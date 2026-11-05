import { z } from 'zod';
import { maintenanceLevel } from '../db/schema.js';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// Query de GET /api/v1/repositories. Un tamaño de página mayor al máximo no
// es un error: se limita a MAX_PAGE_SIZE.
export const listRepositoriesQuerySchema = z.object({
  category: z.string().trim().toLowerCase().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce
    .number()
    .int()
    .min(1)
    .default(DEFAULT_PAGE_SIZE)
    .transform((size) => Math.min(size, MAX_PAGE_SIZE)),
});

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

export const apiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

export type RepositoryListItem = z.output<typeof repositoryListItemSchema>;
export type RepositoryPage = z.output<typeof repositoryPageSchema>;
export type ApiError = z.output<typeof apiErrorSchema>;

export const apiError = (code: string, message: string): ApiError => ({ error: { code, message } });
