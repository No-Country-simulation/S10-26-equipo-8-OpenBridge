import { and, asc, cosineDistance, eq, gte, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import {
  category,
  embedding,
  integrationIdea,
  repository,
  repositoryCategory,
} from '../db/schema.js';
import { searchRequestSchema, type SearchRequest, type SearchResult } from './schema.js';

export type EmbedQuery = (text: string) => Promise<number[]>;

// El proveedor de vectores (Ollama) no respondió: la búsqueda no se puede
// hacer, pero no es un error del servidor (el endpoint responde 503).
export class EmbeddingsUnavailableError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = 'EmbeddingsUnavailableError';
  }
}

const roundSimilarity = (distance: number) => Math.round((1 - distance) * 10_000) / 10_000;

// Repos e ideas aprobadas más parecidos en significado a `query`. Devuelve
// null si alguna categoría pedida no existe.
export async function searchCatalog(
  db: Db,
  input: SearchRequest,
  { embedQuery }: { embedQuery: EmbedQuery },
): Promise<SearchResult[] | null> {
  const request = searchRequestSchema.parse(input);

  if (request.categories) {
    const found = await db
      .select({ slug: category.slug })
      .from(category)
      .where(inArray(category.slug, request.categories));
    if (found.length !== new Set(request.categories).size) return null;
  }

  let vector: number[];
  try {
    vector = await embedQuery(request.query);
  } catch (error) {
    throw new EmbeddingsUnavailableError(error);
  }

  const distance = cosineDistance(embedding.vector, vector);
  // Una idea se filtra y se muestra con los datos de su repositorio.
  const repositoryId = sql`CASE WHEN ${embedding.entityType} = 'REPOSITORY'
    THEN ${embedding.entityId} ELSE ${integrationIdea.repositoryId} END`;

  const rows = await db.transaction(async (tx) => {
    // HNSW filtra después de traer a los vecinos más cercanos: con un filtro
    // estricto podría devolver menos de `limit`. El escaneo iterativo
    // (pgvector 0.8) sigue buscando hasta completarlos.
    await tx.execute(sql`SET LOCAL hnsw.iterative_scan = relaxed_order`);
    return tx
      .select({
        type: embedding.entityType,
        id: embedding.entityId,
        distance: sql<number>`${distance}`.mapWith(Number),
        ideaTitle: integrationIdea.title,
        ideaSummary: integrationIdea.summary,
        repositoryId: repository.id,
        fullName: repository.fullName,
        description: repository.description,
        healthScore: repository.healthScore,
      })
      .from(embedding)
      .leftJoin(
        integrationIdea,
        and(
          eq(embedding.entityType, 'INTEGRATION_IDEA'),
          eq(integrationIdea.id, embedding.entityId),
        ),
      )
      .innerJoin(repository, sql`${repository.id} = ${repositoryId}`)
      .where(
        and(
          request.types ? inArray(embedding.entityType, request.types) : undefined,
          sql`(${embedding.entityType} = 'REPOSITORY' OR ${integrationIdea.status} = 'APPROVED')`,
          request.minHealth === undefined
            ? undefined
            : gte(repository.healthScore, request.minHealth),
          request.categories
            ? sql`EXISTS (
                SELECT 1 FROM ${repositoryCategory}
                INNER JOIN ${category} ON ${category.id} = ${repositoryCategory.categoryId}
                WHERE ${repositoryCategory.repositoryId} = ${repository.id}
                  AND ${inArray(category.slug, request.categories)}
              )`
            : undefined,
        ),
      )
      .orderBy(distance)
      .limit(request.limit);
  });

  const repositoryIds = [...new Set(rows.map((row) => row.repositoryId))];
  const categoryRows =
    repositoryIds.length === 0
      ? []
      : await db
          .select({
            repositoryId: repositoryCategory.repositoryId,
            slug: category.slug,
            name: category.name,
          })
          .from(repositoryCategory)
          .innerJoin(category, eq(category.id, repositoryCategory.categoryId))
          .where(inArray(repositoryCategory.repositoryId, repositoryIds))
          .orderBy(asc(category.slug));

  // relaxed_order puede devolver el orden levemente alterado: se reordena acá.
  return rows
    .sort((a, b) => a.distance - b.distance)
    .map((row) => ({
      type: row.type,
      id: row.id,
      similarity: roundSimilarity(row.distance),
      title: row.type === 'REPOSITORY' ? row.fullName : (row.ideaTitle ?? ''),
      summary: row.type === 'REPOSITORY' ? row.description : row.ideaSummary,
      categories: categoryRows
        .filter(({ repositoryId }) => repositoryId === row.repositoryId)
        .map(({ slug, name }) => ({ slug, name })),
      repository: {
        id: row.repositoryId,
        fullName: row.fullName,
        healthScore: row.healthScore,
      },
    }));
}
