import { z } from 'zod';
import {
  apiErrorSchema,
  catalogFiltersSchema,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_FILTER_LENGTH,
  MAX_QUERY_LENGTH,
  MIN_QUERY_LENGTH,
  REPOSITORY_SORTS,
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
// io 'input' para cuerpos de request: los campos con default son opcionales.
function jsonSchema(schema: z.ZodType, io: 'input' | 'output' = 'output') {
  const generated: Record<string, unknown> = z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    io,
  });
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
        summary: 'Listar y buscar repositorios',
        description:
          'Página del catálogo con filtros combinables y búsqueda por texto. Sin `sort`, ordena por relevancia si hay `q` ' +
          'y si no, por puntaje de salud de mayor a menor (los repositorios sin puntaje van al final).',
        parameters: [
          {
            name: 'category',
            in: 'query',
            required: false,
            description: 'Slug de la categoría (por ejemplo, auth).',
            schema: { type: 'string' },
          },
          {
            name: 'language',
            in: 'query',
            required: false,
            description: 'Lenguaje principal (por ejemplo, Python). No distingue mayúsculas.',
            schema: { type: 'string', maxLength: MAX_FILTER_LENGTH },
          },
          {
            name: 'license',
            in: 'query',
            required: false,
            description: 'Licencia SPDX (por ejemplo, MIT o Apache-2.0). No distingue mayúsculas.',
            schema: { type: 'string', maxLength: MAX_FILTER_LENGTH },
          },
          {
            name: 'q',
            in: 'query',
            required: false,
            description: `Texto libre sobre nombre, descripción, temas y categoría, desde ${MIN_QUERY_LENGTH} caracteres. Acepta español e inglés.`,
            schema: { type: 'string', minLength: MIN_QUERY_LENGTH, maxLength: MAX_QUERY_LENGTH },
          },
          {
            name: 'sort',
            in: 'query',
            required: false,
            description:
              'health (salud), stars (estrellas), updated (último commit) o relevance. relevance sin q responde 400.',
            schema: { type: 'string', enum: [...REPOSITORY_SORTS] },
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
    '/api/v1/filters': {
      get: {
        summary: 'Opciones de los filtros del catálogo',
        description:
          'Lenguajes, licencias, categorías y niveles de mantenimiento presentes en el catálogo, con la cantidad de ' +
          'repositorios de cada uno (de mayor a menor), y el rango de estrellas.',
        responses: {
          '200': json('CatalogFilters', 'Opciones disponibles.'),
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
          '413': json('ApiError', 'El cuerpo supera los 10 KB (código INVALID_QUERY).'),
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
      SearchRequest: jsonSchema(searchRequestSchema, 'input'),
      SearchResponse: jsonSchema(searchResponseSchema),
      RepositoryPage: jsonSchema(repositoryPageSchema),
      CatalogFilters: jsonSchema(catalogFiltersSchema),
      ApiError: jsonSchema(apiErrorSchema),
    },
  },
};
