import { and, asc, desc, eq, exists, inArray, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { category, repository, repositoryCategory } from '../db/schema.js';
import type { ListRepositoriesQuery, RepositoryPage } from './schema.js';

const escapeLike = (text: string) => text.replace(/[\\%_]/g, '\\$&');

// Texto completo de Postgres sobre nombre (peso A), descripción y temas (B)
// y el nombre y la descripción de sus categorías (C). Los repos están en
// inglés y las categorías en español: cada parte usa su diccionario y la
// consulta se prueba con los dos, así "motor de búsqueda" encuentra los
// motores de búsqueda por su categoría. Con 136 repos se calcula en cada
// consulta; si el catálogo crece mucho, conviene una columna con índice GIN.
function textSearch(q: string) {
  const categoryText = sql`coalesce((
    SELECT string_agg(${category.name} || ' ' || coalesce(${category.description}, ''), ' ')
    FROM ${repositoryCategory}
    INNER JOIN ${category} ON ${category.id} = ${repositoryCategory.categoryId}
    WHERE ${repositoryCategory.repositoryId} = ${repository.id}
  ), '')`;
  const document = sql`(
    setweight(to_tsvector('english', ${repository.fullName} || ' ' || ${repository.name}), 'A') ||
    setweight(to_tsvector('english',
      coalesce(${repository.description}, '') || ' ' || array_to_string(${repository.topics}, ' ')), 'B') ||
    setweight(to_tsvector('spanish', ${categoryText}), 'C')
  )`;
  const english = sql`websearch_to_tsquery('english', ${q})`;
  const spanish = sql`websearch_to_tsquery('spanish', ${q})`;
  // Coincidencias parciales del nombre ("meili" → meilisearch), que el
  // texto completo no encuentra porque trabaja con palabras enteras. Suman
  // un bonus moderado: del orden de una coincidencia en el nombre (peso A),
  // para no tapar coincidencias reales en la descripción.
  const partialName = sql`${repository.name} ILIKE ${`%${escapeLike(q)}%`}`;

  return {
    matches: sql`(${document} @@ ${english} OR ${document} @@ ${spanish} OR ${partialName})`,
    rank: sql`(ts_rank(${document}, ${english}) + ts_rank(${document}, ${spanish})
      + CASE WHEN ${partialName} THEN 0.5 ELSE 0 END)`,
  };
}

// Página del catálogo con filtros y búsqueda por texto. Devuelve null si la
// categoría pedida no existe.
export async function listRepositories(
  db: Db,
  { category: slug, language, license, q, sort, page, size }: ListRepositoriesQuery,
): Promise<RepositoryPage | null> {
  const conditions: SQL[] = [];
  if (slug) {
    const [found] = await db
      .select({ id: category.id })
      .from(category)
      .where(eq(category.slug, slug))
      .limit(1);
    if (!found) return null;
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(repositoryCategory)
          .where(
            and(
              eq(repositoryCategory.repositoryId, repository.id),
              eq(repositoryCategory.categoryId, found.id),
            ),
          ),
      ),
    );
  }
  if (language) conditions.push(sql`lower(${repository.primaryLanguage}) = lower(${language})`);
  if (license) conditions.push(sql`lower(${repository.licenseSpdx}) = lower(${license})`);
  const search = q ? textSearch(q) : undefined;
  if (search) conditions.push(search.matches);
  const where = and(...conditions);

  // full_name no es único: el id al final deja un orden total y la
  // paginación no repite ni saltea repos.
  const tieBreak = [asc(repository.fullName), asc(repository.id)];
  const healthDesc = sql`${repository.healthScore} desc nulls last`;
  const orderBy = {
    health: [healthDesc, desc(repository.stars), ...tieBreak],
    stars: [desc(repository.stars), healthDesc, ...tieBreak],
    updated: [sql`${repository.lastCommitAt} desc nulls last`, desc(repository.stars), ...tieBreak],
    // El schema garantiza que relevance viene con q.
    relevance: [sql`${search?.rank ?? sql`0`} desc`, desc(repository.stars), ...tieBreak],
  }[sort];

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(repository)
    .where(where);
  const rows = await db
    .select()
    .from(repository)
    .where(where)
    .orderBy(...orderBy)
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
