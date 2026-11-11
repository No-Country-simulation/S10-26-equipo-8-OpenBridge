import express, { type ErrorRequestHandler } from 'express';
import { capabilitiesJsonSchema, loadCapabilitiesPrompt } from './assistant/prompt.js';
import { assistantRouter } from './assistant/routes.js';
import { catalogRouter } from './catalog/routes.js';
import { apiError } from './catalog/schema.js';
import { corsMiddleware, parseAllowedOrigins } from './cors.js';
import type { Db } from './db/client.js';
import { createOllamaIdeaModel, type IdeaModel } from './ideas/model.js';
import { embedQuery as ollamaEmbedQuery } from './ingest/embeddings.js';
import { openApiDocument } from './openapi.js';
import { searchRouter } from './search/routes.js';
import type { EmbedQuery } from './search/service.js';

// El front corta a los 30 s: cada intento tiene hasta 20 s, y entre los dos
// no pasan de 25 s (ver decomposeBusiness). 8 capacidades con justificación y
// consulta largas rondan los 1.000 tokens: 1.536 deja margen.
const ASSISTANT_TIMEOUT_MS = 20_000;
const ASSISTANT_NUM_PREDICT = 1536;

// La base, el proveedor de vectores y el modelo del asistente se reciben de
// afuera: server.ts usa los reales y los tests una base temporal (ver
// test/helpers/test-db.ts) y dobles de prueba.
export function createApp({
  db,
  embedQuery = (text) => ollamaEmbedQuery(text),
  assistantModel = createOllamaIdeaModel({
    format: capabilitiesJsonSchema,
    timeoutMs: ASSISTANT_TIMEOUT_MS,
    numPredict: ASSISTANT_NUM_PREDICT,
    // La misma descripción tiene que dar las mismas capacidades.
    temperature: 0,
  }),
  allowedOrigins = parseAllowedOrigins(process.env.CORS_ORIGINS),
}: {
  db: Db;
  embedQuery?: EmbedQuery;
  assistantModel?: IdeaModel;
  allowedOrigins?: string[];
}) {
  const app = express();

  app.use(corsMiddleware(allowedOrigins));

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/api/v1/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });
  app.use('/api/v1', catalogRouter(db));
  app.use('/api/v1', searchRouter(db, embedQuery));
  app.use(
    '/api/v1',
    assistantRouter(db, {
      model: assistantModel,
      prompt: loadCapabilitiesPrompt(),
      embedQuery,
    }),
  );

  app.use((req, res) => {
    res.status(404).json(apiError('NOT_FOUND', `No existe la ruta ${req.method} ${req.path}`));
  });

  // Sin esto, Express responde los errores inesperados con una página HTML.
  const handleError: ErrorRequestHandler = (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    // Errores del cuerpo que detecta express.json() antes de la ruta: JSON
    // mal formado (400), demasiado grande (413), charset no soportado (415).
    const status = typeof error?.status === 'number' ? error.status : 500;
    if (status >= 400 && status < 500) {
      const message =
        error.type === 'entity.parse.failed' ? 'El cuerpo no es un JSON válido' : error.message;
      res.status(status).json(apiError('INVALID_QUERY', message));
      return;
    }
    console.error(error);
    res.status(500).json(apiError('INTERNAL_ERROR', 'Error interno del servidor'));
  };
  app.use(handleError);

  return app;
}
