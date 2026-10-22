import { sql } from 'drizzle-orm';
import type { Db } from './client.js';
import { repository, type NewRepository } from './schema.js';

export type RepositoryInput = Omit<NewRepository, 'id' | 'createdAt' | 'updatedAt'>;

// Inserta o actualiza por github_id: GitHub nunca reasigna ese id, mientras
// que full_name cambia si el repo se renombra o se transfiere.
export async function upsertRepository(db: Db, data: RepositoryInput) {
  const [saved] = await db
    .insert(repository)
    .values(data)
    .onConflictDoUpdate({
      target: repository.githubId,
      set: { ...data, updatedAt: sql`now()` },
    })
    .returning();
  return saved;
}
