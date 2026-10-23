import { eq, sql } from 'drizzle-orm';
import type { Db } from './client.js';
import { repository, repositoryCategory, type NewRepository } from './schema.js';

export type RepositoryInput = Omit<NewRepository, 'id' | 'createdAt' | 'updatedAt'>;

// Inserta o actualiza por github_id: GitHub nunca reasigna ese id, mientras
// que full_name cambia si el repo se renombra o se transfiere.
//
// categoryIds reemplaza las categorías del repo (la lista curada manda).
// Si no se pasa, las categorías quedan como estaban: la sincronización
// diaria de métricas no las conoce y no debe borrarlas.
export async function upsertRepository(db: Db, data: RepositoryInput, categoryIds?: string[]) {
  return db.transaction(async (tx) => {
    const [saved] = await tx
      .insert(repository)
      .values(data)
      .onConflictDoUpdate({
        target: repository.githubId,
        set: { ...data, updatedAt: sql`now()` },
      })
      .returning();

    if (categoryIds) {
      // Un id repetido violaría la PK y revertiría también el upsert del repo.
      const unique = [...new Set(categoryIds)];
      await tx.delete(repositoryCategory).where(eq(repositoryCategory.repositoryId, saved.id));
      if (unique.length > 0) {
        await tx
          .insert(repositoryCategory)
          .values(unique.map((categoryId) => ({ repositoryId: saved.id, categoryId })));
      }
    }

    return saved;
  });
}
