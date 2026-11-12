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
  type ModelCapability,
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

export type AnalyzeResult =
  | { status: 'OK'; capabilities: ModelCapability[] }
  | { status: 'NEEDS_CONTEXT'; questions: string[] };

// Pide al modelo las capacidades técnicas que necesita el negocio descripto
// (salida validada con Zod; si no cumple, un reintento mostrándole el error).
// Si la descripción es vaga, devuelve las preguntas del modelo en lugar de
// capacidades.
export async function analyzeBusiness(
  description: string,
  {
    model,
    prompt,
    budgetMs = DEFAULT_BUDGET_MS,
  }: {
    model: IdeaModel;
    prompt: CapabilitiesPrompt;
    // Tiempo total para el modelo, sumando el reintento.
    budgetMs?: number;
  },
): Promise<AnalyzeResult> {
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
  return output.sufficientContext
    ? { status: 'OK', capabilities: output.capabilities }
    : { status: 'NEEDS_CONTEXT', questions: output.missingContext };
}

export type SearchCatalog = typeof searchCatalog;

// Busca en el catálogo los candidatos de cada capacidad con su propia
// consulta. Las búsquedas van en paralelo: mientras Ollama vectoriza una
// consulta, Postgres ya resuelve las anteriores (y con OLLAMA_NUM_PARALLEL > 1
// los vectores también se calculan a la vez). El orden del resultado es el de
// las capacidades.
export async function retrieveCandidates(
  db: Db,
  capabilities: ModelCapability[],
  {
    embedQuery,
    minHealth,
    limit = CANDIDATES_PER_CAPABILITY,
    search = searchCatalog,
  }: { embedQuery: EmbedQuery; minHealth?: number; limit?: number; search?: SearchCatalog },
): Promise<Capability[]> {
  return Promise.all(
    capabilities.map(async (capability) => {
      const candidates = await search(
        db,
        {
          query: capability.query,
          limit,
          types: ['REPOSITORY'],
          minHealth,
          categories: capability.category ? [capability.category] : undefined,
        },
        { embedQuery },
      );
      // null si la categoría no existe en la base (sin seed): sin candidatos.
      return { ...capability, candidates: candidates ?? [] };
    }),
  );
}

// OB-33: capacidades del modelo con sus candidatos del catálogo.
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
  const analysis = await analyzeBusiness(description, { model, prompt, budgetMs });
  if (analysis.status === 'NEEDS_CONTEXT') return analysis;
  const capabilities = await retrieveCandidates(db, analysis.capabilities, {
    embedQuery,
    minHealth: constraints.minHealth,
  });
  return { status: 'OK', capabilities };
}
