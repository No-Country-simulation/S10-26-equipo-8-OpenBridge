import { z } from 'zod';
import {
  assistantErrorSchema,
  capabilitiesRequestSchema,
  capabilitiesResponseSchema,
  MAX_DESCRIPTION,
  MAX_LICENSES,
  MIN_DESCRIPTION,
  proposalRequestSchema,
  proposalSchema,
} from './assistant/schema.js';
import { NO_MATURE_OPTION } from './assistant/compose.js';
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
    '/api/v1/assistant/capabilities': {
      post: {
        summary: 'Descomponer el negocio en capacidades técnicas',
        description:
          'El modelo identifica las capacidades técnicas que necesita el producto descripto, cada una con una ' +
          'justificación de una línea, y por cada capacidad se buscan candidatos en el catálogo con su propia ' +
          `consulta. La descripción tiene entre ${MIN_DESCRIPTION} y ${MAX_DESCRIPTION} caracteres.`,
        requestBody: {
          required: true,
          content: { 'application/json': { schema: ref('CapabilitiesRequest') } },
        },
        responses: {
          '200': json('CapabilitiesResponse', 'Capacidades con sus candidatos del catálogo.'),
          '400': json('AssistantError', 'Cuerpo inválido (código VALIDATION_ERROR).'),
          '413': json('AssistantError', 'El cuerpo supera los 32 KB (código PAYLOAD_TOO_LARGE).'),
          '422': json(
            'AssistantError',
            'La descripción es vaga (código INSUFFICIENT_CONTEXT); details trae las preguntas del asistente.',
          ),
          '502': json(
            'AssistantError',
            'El modelo respondió dos veces fuera de formato (código MODEL_INVALID_RESPONSE).',
          ),
          '503': json(
            'AssistantError',
            'Ollama no responde o falta un modelo (código UPSTREAM_UNAVAILABLE).',
          ),
          '504': json('AssistantError', 'El modelo tardó demasiado (código UPSTREAM_TIMEOUT).'),
        },
      },
    },
    '/api/v1/assistant/proposals': {
      post: {
        summary: 'Proponer un stack open source',
        description:
          'Arma una propuesta de arquitectura con repos del catálogo. Una sola llamada al modelo descompone el ' +
          'negocio en capacidades (con su tipo de integración y sus dependencias); por cada capacidad se buscan ' +
          'candidatos, se verifican contra el catálogo y se elige el mejor con salud de al menos ' +
          'max(40, constraints.minHealth) y, si se piden, licencia en constraints.licenses (SPDX, hasta ' +
          `${MAX_LICENSES}). Sin candidato elegible, la capacidad va a gaps ("${NO_MATURE_OPTION}"). Las ` +
          'conexiones salen de las ideas APPROVED del catálogo (source CATALOG) o, si no hay, de las ' +
          'dependencias que sugirió el modelo (source MODEL_SUGGESTION). Entre dos repos hay a lo sumo una ' +
          'conexión: si el catálogo ya los conecta, en cualquier dirección, no se agrega la sugerencia.\n\n' +
          'La respuesta es un stream text/event-stream con estos eventos, en orden:\n' +
          '- `progress` con `{"stage": "ANALYZING" | "RETRIEVING" | "COMPOSING"}` antes de cada etapa;\n' +
          '- `result` con `{"data": Proposal}` y fin del stream; o bien\n' +
          '- `error` con `{"error": AssistantError}` y fin del stream. Códigos: INSUFFICIENT_CONTEXT (descripción ' +
          'vaga; details trae las preguntas del asistente), UPSTREAM_TIMEOUT (el modelo o las búsquedas no ' +
          'terminaron en ~27 s) e INTERNAL_ERROR (cualquier otro fallo).\n\n' +
          `La descripción tiene entre ${MIN_DESCRIPTION} y ${MAX_DESCRIPTION} caracteres.`,
        requestBody: {
          required: true,
          content: { 'application/json': { schema: ref('ProposalRequest') } },
        },
        responses: {
          '200': {
            description:
              'Stream SSE: eventos progress, y después result (data: Proposal) o error (error: AssistantError).',
            content: {
              'text/event-stream': {
                schema: {
                  type: 'string',
                  description: 'Eventos SSE; el `data` de `result` es `{"data": Proposal}`.',
                },
              },
            },
          },
          '400': json(
            'AssistantError',
            'Cuerpo inválido, antes del stream (código VALIDATION_ERROR).',
          ),
          '413': json('AssistantError', 'El cuerpo supera los 32 KB (código VALIDATION_ERROR).'),
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
      CapabilitiesRequest: jsonSchema(capabilitiesRequestSchema, 'input'),
      CapabilitiesResponse: jsonSchema(capabilitiesResponseSchema),
      ProposalRequest: jsonSchema(proposalRequestSchema, 'input'),
      Proposal: jsonSchema(proposalSchema),
      AssistantError: jsonSchema(assistantErrorSchema),
      SearchResponse: jsonSchema(searchResponseSchema),
      RepositoryPage: jsonSchema(repositoryPageSchema),
      CatalogFilters: jsonSchema(catalogFiltersSchema),
      ApiError: jsonSchema(apiErrorSchema),
    },
  },
};
