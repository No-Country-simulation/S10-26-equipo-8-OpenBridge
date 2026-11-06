import { z } from 'zod';
import {
  apiErrorSchema,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  repositoryPageSchema,
} from './catalog/schema.js';
import {
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_LIMIT,
  searchRequestSchema,
  searchResponseSchema,
} from './search/schema.js';

// Los cuerpos de respuesta salen de los mismos esquemas Zod que usa el
// código, así la documentación no se desincroniza. OpenAPI 3.1 usa JSON
// Schema 2020-12, el mismo formato que genera Zod.
function jsonSchema(schema: z.ZodType) {
  const generated: Record<string, unknown> = z.toJSONSchema(schema, { target: 'draft-2020-12' });
  // $schema sobra adentro de un documento OpenAPI.
  delete generated.$schema;
  return generated;
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (name: string, description: string) => ({
  description,
  content: { 'application/json': { schema: ref(name) } },
});

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'OpenBridge API',
    version: '1.0.0',
    description: 'Catálogo de herramientas open source con ideas de integración.',
  },
  paths: {
    '/api/v1/repositories': {
      get: {
        summary: 'Listar repositorios',
        description:
          'Página del catálogo ordenada por puntaje de salud de mayor a menor. Los repositorios sin puntaje van al final.',
        parameters: [
          {
            name: 'category',
            in: 'query',
            required: false,
            description: 'Slug de la categoría (por ejemplo, auth).',
            schema: { type: 'string' },
          },
          {
            name: 'page',
            in: 'query',
            required: false,
            description: 'Número de página, desde 1.',
            schema: { type: 'integer', minimum: 1, default: 1 },
          },
          {
            name: 'size',
            in: 'query',
            required: false,
            description: `Repositorios por página. Un valor mayor a ${MAX_PAGE_SIZE} se limita a ${MAX_PAGE_SIZE}.`,
            schema: { type: 'integer', minimum: 1, default: DEFAULT_PAGE_SIZE },
          },
        ],
        responses: {
          '200': json('RepositoryPage', 'Página de repositorios con el total.'),
          '400': json('ApiError', 'Parámetros inválidos (código INVALID_QUERY).'),
          '404': json('ApiError', 'La categoría no existe (código CATEGORY_NOT_FOUND).'),
        },
      },
    },
    '/api/v1/search': {
      post: {
        summary: 'Buscar por significado',
        description:
          `Repositorios e ideas aprobadas más parecidos en significado al texto, de mayor a menor similitud ` +
          `(por defecto ${DEFAULT_SEARCH_LIMIT}, hasta ${MAX_SEARCH_LIMIT}). Las ideas se filtran por la ` +
          'categoría y la salud de su repositorio. Con minHealth, los repositorios sin puntaje quedan afuera.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: ref('SearchRequest') } },
        },
        responses: {
          '200': json('SearchResponse', 'Resultados ordenados por similitud.'),
          '400': json('ApiError', 'Cuerpo inválido (código INVALID_QUERY).'),
          '404': json('ApiError', 'Alguna categoría no existe (código CATEGORY_NOT_FOUND).'),
          '503': json(
            'ApiError',
            'No se pudo vectorizar la consulta: Ollama no responde (código EMBEDDINGS_UNAVAILABLE).',
          ),
        },
      },
    },
  },
  components: {
    schemas: {
      SearchRequest: jsonSchema(searchRequestSchema),
      SearchResponse: jsonSchema(searchResponseSchema),
      RepositoryPage: jsonSchema(repositoryPageSchema),
      ApiError: jsonSchema(apiErrorSchema),
    },
  },
};
