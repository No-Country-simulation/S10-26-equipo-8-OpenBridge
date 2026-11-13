import { readdirSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import type { ChatMessage } from '../ideas/model.js';
import { modelOutputSchema, modelOutputV1Schema, type ModelOutput } from './schema.js';

// Igual que los prompts de ideas: cada versión vive en su carpeta
// (system.md y examples/) y no se edita; para cambiarla se crea otra.
const PROMPTS_DIR = new URL('../../prompts/assistant/capabilities/', import.meta.url);

// v2 (OB-34) suma integrationType y dependsOn a cada capacidad. v3 mantiene
// ese esquema y aclara que una herramienta interna "para los empleados" ya
// tiene contexto suficiente, con un ejemplo que contrasta con el vago. v4
// pide queries de base de datos concretas (relacional, pgvector si hay RAG),
// prohíbe capacidades que la descripción no pide (notificaciones, colas…) y
// enseña que un producto RAG lleva modelo (ai) y orquestador (rag, categoría
// ai: la búsqueda queda acotada a la categoría, ver retrieveCandidates).
export const CAPABILITIES_PROMPT_VERSION = 'v4';

// Esquema de salida de cada versión: los ejemplos de v1 siguen siendo válidos
// para v1 aunque la app ya no la use; v2, v3 y v4 comparten el actual.
export function modelOutputSchemaFor(version: string) {
  return version === 'v1' ? modelOutputV1Schema : modelOutputSchema;
}

export interface CapabilitiesExample {
  description: string;
  response: ModelOutput;
}

export interface CapabilitiesPrompt {
  version: string;
  system: string;
  examples: CapabilitiesExample[];
}

// Lo que recibe Ollama como `format`: restringe la salida a esta forma.
export const capabilitiesJsonSchema = z.toJSONSchema(modelOutputSchema, { io: 'input' });

export function listCapabilitiesPromptVersions(): string[] {
  return readdirSync(PROMPTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^v\d+$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

export function loadCapabilitiesPrompt(version = CAPABILITIES_PROMPT_VERSION): CapabilitiesPrompt {
  if (!listCapabilitiesPromptVersions().includes(version)) {
    throw new Error(
      `No existe la versión de prompt "${version}" en backend/prompts/assistant/capabilities/`,
    );
  }
  const versionDir = new URL(`${version}/`, PROMPTS_DIR);
  const system = readFileSync(new URL('system.md', versionDir), 'utf-8');
  const examplesDir = new URL('examples/', versionDir);
  const examples = readdirSync(examplesDir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map(
      (file) =>
        JSON.parse(readFileSync(new URL(file, examplesDir), 'utf-8')) as CapabilitiesExample,
    );
  return { version, system, examples };
}

// Instrucciones, cada ejemplo como un intercambio pregunta/respuesta
// (few-shot) y al final la descripción del usuario.
export function buildCapabilitiesMessages(
  prompt: CapabilitiesPrompt,
  description: string,
): ChatMessage[] {
  return [
    { role: 'system', content: prompt.system },
    ...prompt.examples.flatMap((example): ChatMessage[] => [
      { role: 'user', content: asData(example.description) },
      { role: 'assistant', content: JSON.stringify(example.response) },
    ]),
    { role: 'user', content: asData(description) },
  ];
}

// La descripción la escribe el usuario: va delimitada para que el modelo la
// trate como dato y no como instrucciones (ver system.md).
const asData = (description: string) => `<descripcion>\n${description}\n</descripcion>`;
