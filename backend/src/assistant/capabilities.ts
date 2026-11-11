import { z } from 'zod';
import type { Db } from '../db/client.js';
import { ModelTimeoutError, type ChatMessage, type IdeaModel } from '../ideas/model.js';
import { searchCatalog, type EmbedQuery } from '../search/service.js';
import { buildCapabilitiesMessages, type CapabilitiesPrompt } from './prompt.js';
import {
  capabilitiesRequestSchema,
  modelOutputSchema,
  type CapabilitiesRequest,
  type Capability,
  type ModelOutput,
} from './schema.js';

// Candidatos del catálogo por capacidad: los suficientes para que OB-34 elija
// uno y una alternativa.
const CANDIDATES_PER_CAPABILITY = 3;

// El modelo respondió dos veces algo que no cumple el esquema.
export class InvalidModelResponseError extends Error {
  constructor(
    message: string,
    readonly raw: string,
  ) {
    super(message);
    this.name = 'InvalidModelResponseError';
  }
}

// No se pudo hablar con el modelo (Ollama caído, modelo sin bajar…).
export class ModelUnavailableError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = 'ModelUnavailableError';
  }
}

export type DecomposeResult =
  { status: 'OK'; capabilities: Capability[] } | { status: 'NEEDS_CONTEXT'; questions: string[] };

type ParseResult = { success: true; output: ModelOutput } | { success: false; error: string };

function parseOutput(raw: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { success: false, error: 'La respuesta no es JSON válido.' };
  }
  const result = modelOutputSchema.safeParse(json);
  return result.success
    ? { success: true, output: result.data }
    : { success: false, error: z.prettifyError(result.error) };
}

const retryMessage = (error: string) =>
  `Tu respuesta no cumple el formato pedido:\n${error}\n\nCorregila y respondé solo con el objeto JSON.`;

// El front corta a los 30 s: el modelo (con el reintento) tiene que terminar
// antes, dejando lugar para las búsquedas.
export const DEFAULT_BUDGET_MS = 25_000;

async function complete(
  model: IdeaModel,
  messages: ChatMessage[],
  deadline: number,
): Promise<string> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new ModelTimeoutError(0);
  try {
    return await model.complete(messages, { timeoutMs: remaining });
  } catch (error) {
    if (error instanceof ModelTimeoutError) throw error;
    throw new ModelUnavailableError(error);
  }
}

// Pide al modelo las capacidades técnicas que necesita el negocio descripto
// (salida validada con Zod; si no cumple, un reintento mostrándole el error)
// y busca en el catálogo los candidatos de cada una con su propia consulta.
// Si la descripción es vaga, devuelve las preguntas del modelo en lugar de
// capacidades.
export async function decomposeBusiness(
  db: Db,
  input: CapabilitiesRequest,
  {
    model,
    prompt,
    embedQuery,
    budgetMs = DEFAULT_BUDGET_MS,
  }: {
    model: IdeaModel;
    prompt: CapabilitiesPrompt;
    embedQuery: EmbedQuery;
    // Tiempo total para el modelo, sumando el reintento.
    budgetMs?: number;
  },
): Promise<DecomposeResult> {
  const { description, constraints } = capabilitiesRequestSchema.parse(input);
  const deadline = Date.now() + budgetMs;

  const messages = buildCapabilitiesMessages(prompt, description);
  let raw = await complete(model, messages, deadline);
  let parsed = parseOutput(raw);
  if (!parsed.success) {
    raw = await complete(
      model,
      [
        ...messages,
        { role: 'assistant', content: raw },
        { role: 'user', content: retryMessage(parsed.error) },
      ],
      deadline,
    );
    parsed = parseOutput(raw);
  }
  if (!parsed.success) throw new InvalidModelResponseError(parsed.error, raw);

  const { output } = parsed;
  if (!output.sufficientContext) {
    return { status: 'NEEDS_CONTEXT', questions: output.missingContext };
  }

  // Una búsqueda por capacidad, en orden: con Ollama local, las consultas
  // en paralelo se encolan igual y solo agregan carga.
  const capabilities: Capability[] = [];
  for (const capability of output.capabilities) {
    const candidates = await searchCatalog(
      db,
      {
        query: capability.query,
        limit: CANDIDATES_PER_CAPABILITY,
        types: ['REPOSITORY'],
        minHealth: constraints.minHealth,
        categories: capability.category ? [capability.category] : undefined,
      },
      { embedQuery },
    );
    // null si la categoría no existe en la base (sin seed): sin candidatos.
    capabilities.push({ ...capability, candidates: candidates ?? [] });
  }
  return { status: 'OK', capabilities };
}
