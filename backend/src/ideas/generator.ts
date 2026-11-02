import { and, desc, eq, notExists, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { createIntegrationIdeas } from '../db/integration-ideas.js';
import { integrationIdea, repository, type IntegrationIdea } from '../db/schema.js';
import type { ChatMessage, IdeaModel } from './model.js';
import { buildIdeaMessages, type IdeaPrompt, type RepoContext } from './prompt.js';
import { generatedIdeasSchema, type GeneratedIdea } from './schema.js';

export type { RepoContext } from './prompt.js';

export type GenerateIdeasResult =
  | { status: 'created'; ideas: IntegrationIdea[] }
  | { status: 'discarded'; error: string; raw: string };

type ParseResult = { success: true; ideas: GeneratedIdea[] } | { success: false; error: string };

function parseIdeas(raw: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { success: false, error: 'La respuesta no es JSON válido.' };
  }
  const result = generatedIdeasSchema.safeParse(json);
  return result.success
    ? { success: true, ideas: result.data.ideas }
    : { success: false, error: z.prettifyError(result.error) };
}

const retryMessage = (error: string) =>
  `Tu respuesta no cumple el formato pedido:\n${error}\n\nCorregila y respondé solo con el objeto JSON.`;

// Pide ideas para un repo y las guarda en DRAFT con origen LLM. Si la
// respuesta no cumple el esquema, reintenta una vez mostrándole el error al
// modelo; si vuelve a fallar, no guarda nada y devuelve el motivo y la
// respuesta cruda para registrarlos.
export async function generateIdeas(
  db: Db,
  { repositoryId, context }: { repositoryId: string; context: RepoContext },
  { model, prompt }: { model: IdeaModel; prompt: IdeaPrompt },
): Promise<GenerateIdeasResult> {
  const messages = buildIdeaMessages(prompt, context);
  let raw = await model.complete(messages);
  let parsed = parseIdeas(raw);

  if (!parsed.success) {
    const retry: ChatMessage[] = [
      ...messages,
      { role: 'assistant', content: raw },
      { role: 'user', content: retryMessage(parsed.error) },
    ];
    raw = await model.complete(retry);
    parsed = parseIdeas(raw);
  }

  if (!parsed.success) return { status: 'discarded', error: parsed.error, raw };

  const ideas = await createIntegrationIdeas(
    db,
    parsed.ideas.map((idea) => ({ ...idea, repositoryId, source: 'LLM' })),
  );
  return { status: 'created', ideas };
}

// Repos que todavía no tienen ideas generadas, los más populares primero.
// Las ideas escritas a mano no cuentan: no impiden sumar borradores.
export async function selectRepositoriesWithoutIdeas(
  db: Db,
  { fullName, limit }: { fullName?: string; limit?: number } = {},
) {
  const query = db
    .select()
    .from(repository)
    .where(
      and(
        notExists(
          db
            .select({ id: integrationIdea.id })
            .from(integrationIdea)
            .where(
              and(
                eq(integrationIdea.repositoryId, repository.id),
                eq(integrationIdea.source, 'LLM'),
              ),
            ),
        ),
        fullName ? sql`lower(${repository.fullName}) = lower(${fullName})` : undefined,
      ),
    )
    .orderBy(desc(repository.stars), repository.fullName);
  return limit === undefined ? query : query.limit(limit);
}
