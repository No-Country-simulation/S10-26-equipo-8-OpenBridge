import { cosineDistance, eq, sql } from 'drizzle-orm';
import type { Db } from './client.js';
import { embedding, type NewEmbedding } from './schema.js';

export type EmbeddingInput = Omit<NewEmbedding, 'id' | 'createdAt' | 'updatedAt'>;
export type EmbeddingEntityType = EmbeddingInput['entityType'];

// Regenerar el embedding de una entidad reemplaza el anterior.
export async function upsertEmbedding(db: Db, data: EmbeddingInput) {
  const [saved] = await db
    .insert(embedding)
    .values(data)
    .onConflictDoUpdate({
      target: [embedding.entityType, embedding.entityId],
      set: { content: data.content, vector: data.vector, model: data.model, updatedAt: sql`now()` },
    })
    .returning();
  return saved;
}

// Vecinos más cercanos por distancia coseno (0 = idénticos, 2 = opuestos).
// El ORDER BY sobre el operador <=> con LIMIT es lo que usa el índice HNSW.
export async function findNearestEmbeddings(
  db: Db,
  query: number[],
  { limit = 10, entityType }: { limit?: number; entityType?: EmbeddingEntityType } = {},
) {
  const distance = cosineDistance(embedding.vector, query);
  return db
    .select({
      entityType: embedding.entityType,
      entityId: embedding.entityId,
      content: embedding.content,
      distance: sql<number>`${distance}`.mapWith(Number),
    })
    .from(embedding)
    .where(entityType ? eq(embedding.entityType, entityType) : undefined)
    .orderBy(distance)
    .limit(limit);
}
