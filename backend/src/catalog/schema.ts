import { z } from 'zod';
import { ideaDifficulty, integrationType, maintenanceLevel } from '../db/schema.js';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 200;
export const MAX_FILTER_LENGTH = 50;
export const REPOSITORY_SORTS = ['health', 'stars', 'updated', 'relevance'] as const;

// Un parámetro vacío (`?q=` al borrar el buscador) equivale a no mandarlo.
const optionalText = (schema: z.ZodString) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    schema.optional(),
  );

// Query de GET /api/v1/repositories. Un tamaño de página mayor al máximo no
// es un error: se limita a MAX_PAGE_SIZE. Sin `sort`, con texto de búsqueda
// ordena por relevancia y sin texto, por salud.
export const listRepositoriesQuerySchema = z
  .object({
    category: optionalText(z.string().trim().toLowerCase()),
    language: optionalText(z.string().trim().max(MAX_FILTER_LENGTH)),
    license: optionalText(z.string().trim().max(MAX_FILTER_LENGTH)),
    q: optionalText(z.string().trim().min(MIN_QUERY_LENGTH).max(MAX_QUERY_LENGTH)),
    sort: z.enum(REPOSITORY_SORTS).optional(),
    page: z.coerce.number().int().min(1).default(1),
    size: z.coerce
      .number()
      .int()
      .min(1)
      .default(DEFAULT_PAGE_SIZE)
      .transform((size) => Math.min(size, MAX_PAGE_SIZE)),
  })
  .refine(({ sort, q }) => sort !== 'relevance' || q !== undefined, {
    message: 'sort=relevance necesita un texto de búsqueda (q)',
    path: ['sort'],
  })
  .transform(({ sort, ...query }) => ({
    ...query,
    sort: sort ?? (query.q ? 'relevance' : 'health'),
  }));

export type ListRepositoriesQuery = z.output<typeof listRepositoriesQuerySchema>;

// Contrato v1 de la respuesta: es el que consume el front
// (frontend/src/lib/repositories.ts). Lo que el pipeline todavía no calculó
// (puntaje de salud, último commit) llega en null.
export const repositoryListItemSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  primaryLanguage: z.string().nullable(),
  licenseSpdx: z.string().nullable(),
  stars: z.number().int(),
  healthScore: z.number().int().min(0).max(100).nullable(),
  maintenanceLevel: z.enum(maintenanceLevel.enumValues).nullable(),
  categories: z.array(z.object({ slug: z.string(), name: z.string() })),
  lastCommitAt: z.iso.datetime().nullable(),
});

export const integrationIdeaSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  summary: z.string(),
  integrationType: z.enum(integrationType.enumValues),
  difficulty: z.enum(ideaDifficulty.enumValues),
  triggers: z.array(z.object({ event: z.string(), description: z.string() })),
  snippet: z.object({ language: z.string(), code: z.string() }).nullable(),
  stackCompatibility: z.array(z.string()),
  connectsWith: z.array(z.object({ id: z.uuid(), fullName: z.string() })),
});

// Respuesta de GET /api/v1/repositories/:id: el listado más los campos de la
// ficha. Solo trae ideas aprobadas; [] significa "en curaduría".
export const repositoryDetailSchema = repositoryListItemSchema.extend({
  url: z.string(),
  homepage: z.string().nullable(),
  forks: z.number().int(),
  openIssues: z.number().int(),
  lastReleaseAt: z.iso.datetime().nullable(),
  archived: z.boolean(),
  topics: z.array(z.string()),
  activeMaintainer: z.boolean(),
  lastSyncedAt: z.iso.datetime(),
  integrationIdeas: z.array(integrationIdeaSchema),
});

export const repositoryDetailResponseSchema = z.object({ data: repositoryDetailSchema });

// guid y no uuid: acepta cualquier UUID con forma válida, que es lo único
// que Postgres exige para castear; así un id mal formado nunca llega a la base.
export const repositoryIdSchema = z.guid();

export const repositoryPageSchema = z.object({
  data: z.array(repositoryListItemSchema),
  meta: z.object({
    page: z.number().int(),
    size: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

const filterOptionSchema = z.object({ value: z.string(), count: z.number().int() });

// Respuesta de GET /api/v1/filters: las opciones salen de los datos, con la
// cantidad de repositorios de cada una, de mayor a menor. Contrato que
// consume el front (CatalogFilters en frontend/src/lib/repositories.ts).
export const catalogFiltersSchema = z.object({
  languages: z.array(filterOptionSchema),
  licenses: z.array(filterOptionSchema),
  categories: z.array(filterOptionSchema.extend({ label: z.string() })),
  maintenanceLevels: z.array(
    filterOptionSchema.extend({ value: z.enum(maintenanceLevel.enumValues) }),
  ),
  stars: z.object({ min: z.number().int(), max: z.number().int() }),
});

export type CatalogFilters = z.output<typeof catalogFiltersSchema>;

export const apiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

export type RepositoryListItem = z.output<typeof repositoryListItemSchema>;
export type RepositoryDetail = z.output<typeof repositoryDetailSchema>;
export type RepositoryPage = z.output<typeof repositoryPageSchema>;
export type ApiError = z.output<typeof apiErrorSchema>;

export const apiError = (code: string, message: string): ApiError => ({ error: { code, message } });
