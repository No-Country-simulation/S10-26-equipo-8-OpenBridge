import { z } from 'zod';
import { embeddingEntityType, maintenanceLevel } from '../db/schema.js';

export const DEFAULT_SEARCH_LIMIT = 5;
export const MAX_SEARCH_LIMIT = 20;

// Cuerpo de POST /api/v1/search. Las ideas se filtran por la categoría y la
// salud de su repositorio.
export const searchRequestSchema = z.object({
  query: z.string().trim().min(1).max(500),
  limit: z.number().int().min(1).max(MAX_SEARCH_LIMIT).default(DEFAULT_SEARCH_LIMIT),
  categories: z.array(z.string().trim().toLowerCase().min(1)).min(1).max(10).optional(),
  minHealth: z.number().int().min(0).max(100).optional(),
  language: z.string().trim().max(50).optional(),
  license: z.string().trim().max(50).optional(),
  maintenance: z.array(z.enum(maintenanceLevel.enumValues)).optional(),
  minStars: z.number().int().min(0).optional(),
  types: z.array(z.enum(embeddingEntityType.enumValues)).min(1).optional(),
});

export type SearchRequest = z.input<typeof searchRequestSchema>;

export const hybridSearchRequestSchema = z.object({
  query: z.string().trim().min(2).max(500),
  category: z.string().trim().toLowerCase().min(1).optional(),
  language: z.string().trim().max(50).optional(),
  license: z.string().trim().max(50).optional(),
  maintenance: z.array(z.enum(maintenanceLevel.enumValues)).optional(),
  minStars: z.number().int().min(0).optional(),
  minHealth: z.number().int().min(0).max(100).optional(),
  page: z.number().int().min(1).default(1),
  size: z.number().int().min(1).max(100).default(20),
});

export type HybridSearchRequest = z.input<typeof hybridSearchRequestSchema>;

export const searchResultSchema = z.object({
  type: z.enum(embeddingEntityType.enumValues),
  id: z.uuid(),
  // Similitud coseno con la consulta: 1 es idéntico; cerca de 0 (o negativa)
  // no tiene relación. Con bge-m3, lo relevante suele estar entre 0,4 y 0,7.
  similarity: z.number().min(-1).max(1),
  // Repos: full name y descripción. Ideas: título y resumen.
  title: z.string(),
  summary: z.string().nullable(),
  categories: z.array(z.object({ slug: z.string(), name: z.string() })),
  repository: z.object({
    id: z.uuid(),
    fullName: z.string(),
    healthScore: z.number().int().min(0).max(100).nullable(),
  }),
});

export const searchResponseSchema = z.object({ data: z.array(searchResultSchema) });

export type SearchResult = z.output<typeof searchResultSchema>;
