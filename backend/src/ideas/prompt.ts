import { readdirSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import type { ChatMessage } from './model.js';
import { generatedIdeasSchema, type GeneratedIdea } from './schema.js';

// Las instrucciones viven en backend/prompts/ideas/ para versionarlas y
// revisarlas en los PR. Desde src/ideas o dist/ideas la ruta es la misma.
const PROMPTS_DIR = new URL('../../prompts/ideas/', import.meta.url);

export const IDEA_PROMPT_VERSION = 'v1';

export interface RepoContext {
  fullName: string;
  description: string | null;
  primaryLanguage: string | null;
  topics: string[];
  readme: string;
}

export interface IdeaExample {
  repository: RepoContext;
  ideas: GeneratedIdea[];
}

export interface IdeaPrompt {
  version: string;
  system: string;
  examples: IdeaExample[];
}

// Lo que recibe Ollama como `format`. io: 'input' deja opcionales los campos
// con valor por defecto (triggers, snippet, stackCompatibility).
export const ideasJsonSchema = z.toJSONSchema(generatedIdeasSchema, { io: 'input' });

export function loadIdeaPrompt(version = IDEA_PROMPT_VERSION): IdeaPrompt {
  const system = readFileSync(new URL(`${version}.md`, PROMPTS_DIR), 'utf-8');
  const examplesDir = new URL('examples/', PROMPTS_DIR);
  const examples = readdirSync(examplesDir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => JSON.parse(readFileSync(new URL(file, examplesDir), 'utf-8')) as IdeaExample);
  return { version, system, examples };
}

function describeRepository({
  fullName,
  description,
  primaryLanguage,
  topics,
  readme,
}: RepoContext) {
  return [
    `Repositorio: ${fullName}`,
    `Descripción: ${description ?? 'sin descripción'}`,
    `Lenguaje: ${primaryLanguage ?? 'sin dato'}`,
    `Temas: ${topics.length > 0 ? topics.join(', ') : 'sin temas'}`,
    '',
    'README:',
    readme,
  ].join('\n');
}

// Instrucciones, después cada ejemplo como un intercambio pregunta/respuesta
// (few-shot) y al final el repo para el que se piden ideas.
export function buildIdeaMessages(prompt: IdeaPrompt, repository: RepoContext): ChatMessage[] {
  return [
    { role: 'system', content: prompt.system },
    ...prompt.examples.flatMap((example): ChatMessage[] => [
      { role: 'user', content: describeRepository(example.repository) },
      { role: 'assistant', content: JSON.stringify({ ideas: example.ideas }) },
    ]),
    { role: 'user', content: describeRepository(repository) },
  ];
}
