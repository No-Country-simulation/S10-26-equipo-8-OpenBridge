import { newIntegrationIdeaSchema } from '../ideas/schema.js';
import type { Db } from './client.js';
import { integrationIdea } from './schema.js';

// Valida contra el esquema de OB-06 antes de tocar la base; si no valida,
// lanza el ZodError con el campo inválido. La idea siempre nace en DRAFT.
export async function createIntegrationIdea(db: Db, input: unknown) {
  const idea = newIntegrationIdeaSchema.parse(input);
  const [saved] = await db
    .insert(integrationIdea)
    .values({ ...idea, status: 'DRAFT' })
    .returning();
  return saved;
}
