import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
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
// no pasan de 25 s en capacidades ni de 23 s en propuestas (ver
// decomposeBusiness y createProposal). Prompt v2/v3: los ejemplos ocupan ~275
// caracteres por capacidad (v1: ~220; integrationType y dependsOn suman ~55),
// así que 8 capacidades son ~2.200 caracteres, unos 750-900 tokens. 1.536
// sigue dejando margen; más tope solo le daría más tiempo a un modelo que
// entra en bucle antes de que lo corte el timeout.
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

  app.use((req, res, next) => {
    const requestId = randomUUID();
    const startedAt = process.hrtime.bigint();

    res.setHeader('X-Request-Id', requestId);
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      console.log(
        JSON.stringify({
          requestId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          durationMs,
        }),
      );
    });

    next();
  });

  app.use(corsMiddleware(allowedOrigins));

  app.get('/health', async (_req, res) => {
    try {
      await db.execute(sql`select 1`);
      res.status(200).json({ status: 'ok' });
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'health_check_failed',
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      res.status(503).json({ status: 'error' });
    }
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

  const handleError: ErrorRequestHandler = (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
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
