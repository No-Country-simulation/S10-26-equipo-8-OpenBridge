import { z } from 'zod';
import { maintenanceLevel } from '../db/schema.js';

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

// Máximo de la columna integer de Postgres: un minStars mayor no tiene
// sentido y rompería la consulta.
export const MAX_STARS = 2_147_483_647;

// `maintenance=ACTIVE,MODERATE`: uno o más niveles separados por coma. No
// distingue mayúsculas (igual que language y license), ignora espacios
// alrededor de cada nivel y descarta repetidos. Vacío equivale a no mandarlo;
// un segmento vacío ("ACTIVE,") o desconocido es un error.
const maintenanceList = z.preprocess(
  (value) =>
    typeof value === 'string'
      ? value.trim() === ''
        ? undefined
        : [...new Set(value.split(',').map((level) => level.trim().toUpperCase()))]
      : value,
  z.array(z.enum(maintenanceLevel.enumValues)).optional(),
);

// `minStars`: entero >= 0 escrito solo con dígitos (rechaza -1, abc, 1.5, 1e3).
const minStars = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z
    .string()
    .trim()
    .regex(/^\d+$/, 'Debe ser un entero mayor o igual a 0')
    .transform(Number)
    .pipe(z.number().max(MAX_STARS))
    .optional(),
);

// Query de GET /api/v1/repositories. Un tamaño de página mayor al máximo no
// es un error: se limita a MAX_PAGE_SIZE. Sin `sort`, con texto de búsqueda
// ordena por relevancia y sin texto, por salud.
export const listRepositoriesQuerySchema = z
  .object({
    category: optionalText(z.string().trim().toLowerCase()),
    language: optionalText(z.string().trim().max(MAX_FILTER_LENGTH)),
    license: optionalText(z.string().trim().max(MAX_FILTER_LENGTH)),
    maintenance: maintenanceList,
    minStars,
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
export type RepositoryPage = z.output<typeof repositoryPageSchema>;
export type ApiError = z.output<typeof apiErrorSchema>;

export const apiError = (code: string, message: string): ApiError => ({ error: { code, message } });
