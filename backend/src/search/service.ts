import { and, asc, cosineDistance, eq, gte, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { listRepositories } from '../catalog/repositories.js';
import type { RepositoryListItem, RepositoryPage } from '../catalog/schema.js';
import {
  category,
  embedding,
  integrationIdea,
  repository,
  repositoryCategory,
} from '../db/schema.js';
import { expandSearchQuery } from './query-expansion.js';
import {
  hybridSearchRequestSchema,
  searchRequestSchema,
  type HybridSearchRequest,
  type SearchRequest,
  type SearchResult,
} from './schema.js';

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

// Reciprocal rank fusion combines lexical and semantic positions without
// comparing scores that have different scales.
export async function searchHybridCatalog(
  db: Db,
  input: HybridSearchRequest,
  { embedQuery }: { embedQuery: EmbedQuery },
): Promise<RepositoryPage | null> {
  const request = hybridSearchRequestSchema.parse(input);
  const lexical = await listRepositories(db, {
    category: request.category,
    language: request.language,
    license: request.license,
    q: request.query,
    sort: 'relevance',
    page: 1,
    size: 100,
  });
  if (!lexical) return null;

  const semantic = await searchCatalog(
    db,
    {
      query: request.query,
      categories: request.category ? [request.category] : undefined,
      language: request.language,
      license: request.license,
      maintenance: request.maintenance,
      minStars: request.minStars,
      minHealth: request.minHealth,
      types: ['REPOSITORY'],
      limit: MAX_HYBRID_CANDIDATES,
    },
    { embedQuery },
  );
  if (!semantic) return null;

  const scores = new Map<string, number>();
  const addRank = (id: string, rank: number) =>
    scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_CONSTANT + rank));
  lexical.data.forEach(({ id }, index) => addRank(id, index + 1));
  semantic.forEach(({ id }, index) => addRank(id, index + 1));

  const lexicalIds = new Set(lexical.data.map(({ id }) => id));
  const semanticIds = [...new Set(semantic.map(({ id }) => id))].filter(
    (id) => !lexicalIds.has(id),
  );
  const semanticRows =
    semanticIds.length === 0
      ? []
      : await db.select().from(repository).where(inArray(repository.id, semanticIds));
  const categoryRows =
    semanticIds.length === 0
      ? []
      : await db
          .select({
            repositoryId: repositoryCategory.repositoryId,
            slug: category.slug,
            name: category.name,
          })
          .from(repositoryCategory)
          .innerJoin(category, eq(category.id, repositoryCategory.categoryId))
          .where(inArray(repositoryCategory.repositoryId, semanticIds))
          .orderBy(asc(category.slug));

  const candidates = [
    ...lexical.data,
    ...semanticRows.map((row): RepositoryListItem => ({
      id: row.id,
      fullName: row.fullName,
      name: row.name,
      description: row.description,
      primaryLanguage: row.primaryLanguage,
      licenseSpdx: row.licenseSpdx,
      stars: row.stars,
      healthScore: row.healthScore,
      maintenanceLevel: row.maintenanceLevel,
      categories: categoryRows
        .filter(({ repositoryId }) => repositoryId === row.id)
        .map(({ slug, name }) => ({ slug, name })),
      lastCommitAt: row.lastCommitAt?.toISOString() ?? null,
    })),
  ]
    .filter(
      (item) =>
        !request.maintenance?.length ||
        (item.maintenanceLevel !== null && request.maintenance.includes(item.maintenanceLevel)),
    )
    .filter((item) => request.minStars === undefined || item.stars >= request.minStars)
    .filter(
      (item) => request.minHealth === undefined || (item.healthScore ?? -1) >= request.minHealth,
    )
    .sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0));

  const offset = (request.page - 1) * request.size;
  return {
    data: candidates.slice(offset, offset + request.size),
    meta: {
      page: request.page,
      size: request.size,
      total: candidates.length,
      totalPages: Math.ceil(candidates.length / request.size),
    },
  };
}

const RRF_CONSTANT = 60;
const MAX_HYBRID_CANDIDATES = 20;

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
    vector = await embedQuery(expandSearchQuery(request.query));
  } catch (error) {
    throw new EmbeddingsUnavailableError(error);
  }

  const distance = cosineDistance(embedding.vector, vector);
  // Una idea se filtra y se muestra con los datos de su repositorio.
  const repositoryId = sql`CASE WHEN ${embedding.entityType} = 'REPOSITORY'
    THEN ${embedding.entityId} ELSE ${integrationIdea.repositoryId} END`;

  const rows = await db.transaction(async (tx) => {
    // Hoy, con los JOIN y el catálogo chico, Postgres recorre todos los
    // vectores y ordena: la búsqueda es exacta. Si con más datos eligiera el
    // índice HNSW, este filtraría después de traer a los vecinos más cercanos
    // y podría devolver menos de `limit`; el escaneo iterativo (pgvector 0.8)
    // sigue buscando hasta completarlos. Ver test/search/iterative-scan.test.ts.
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
          request.language
            ? sql`lower(${repository.primaryLanguage}) = lower(${request.language})`
            : undefined,
          request.license
            ? sql`lower(${repository.licenseSpdx}) = lower(${request.license})`
            : undefined,
          request.maintenance?.length
            ? inArray(repository.maintenanceLevel, request.maintenance)
            : undefined,
          request.minStars === undefined ? undefined : gte(repository.stars, request.minStars),
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
