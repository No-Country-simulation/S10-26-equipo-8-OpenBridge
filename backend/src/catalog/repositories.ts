import { and, asc, desc, eq, exists, inArray, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { category, repository, repositoryCategory } from '../db/schema.js';
import type { ListRepositoriesQuery, RepositoryPage } from './schema.js';

// Página del catálogo, de mayor a menor puntaje de salud. Los repos sin
// puntaje van al final; a igual puntaje, el más popular primero.
// Devuelve null si la categoría pedida no existe.
export async function listRepositories(
  db: Db,
  { category: slug, page, size }: ListRepositoriesQuery,
): Promise<RepositoryPage | null> {
  let where: SQL | undefined;
  if (slug) {
    const [found] = await db
      .select({ id: category.id })
      .from(category)
      .where(eq(category.slug, slug))
      .limit(1);
    if (!found) return null;
    where = exists(
      db
        .select({ one: sql`1` })
        .from(repositoryCategory)
        .where(
          and(
            eq(repositoryCategory.repositoryId, repository.id),
            eq(repositoryCategory.categoryId, found.id),
          ),
        ),
    );
  }

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(repository)
    .where(where);
  const rows = await db
    .select()
    .from(repository)
    .where(where)
    .orderBy(
      sql`${repository.healthScore} desc nulls last`,
      desc(repository.stars),
      asc(repository.fullName),
      // full_name no es único: el id deja un orden total y la paginación
      // no repite ni saltea repos.
      asc(repository.id),
    )
    .limit(size)
    .offset((page - 1) * size);

  // Todas las categorías de cada repo, no solo la filtrada: Supabase sigue
  // mostrando Base de Datos aunque se liste Autenticación.
  const links =
    rows.length === 0
      ? []
      : await db
          .select({
            repositoryId: repositoryCategory.repositoryId,
            slug: category.slug,
            name: category.name,
          })
          .from(repositoryCategory)
          .innerJoin(category, eq(category.id, repositoryCategory.categoryId))
          .where(
            inArray(
              repositoryCategory.repositoryId,
              rows.map(({ id }) => id),
            ),
          )
          .orderBy(asc(category.slug));

  return {
    data: rows.map((row) => ({
      id: row.id,
      fullName: row.fullName,
      name: row.name,
      description: row.description,
      primaryLanguage: row.primaryLanguage,
      licenseSpdx: row.licenseSpdx,
      stars: row.stars,
      healthScore: row.healthScore,
      maintenanceLevel: row.maintenanceLevel,
      categories: links
        .filter((link) => link.repositoryId === row.id)
        .map(({ slug: linkSlug, name }) => ({ slug: linkSlug, name })),
      lastCommitAt: row.lastCommitAt?.toISOString() ?? null,
    })),
    meta: { page, size, total, totalPages: Math.ceil(total / size) },
  };
}
