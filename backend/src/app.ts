import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import express, { type ErrorRequestHandler } from 'express';
import { catalogRouter } from './catalog/routes.js';
import { apiError } from './catalog/schema.js';
import type { Db } from './db/client.js';
import { embedQuery as ollamaEmbedQuery } from './ingest/embeddings.js';
import { openApiDocument } from './openapi.js';
import { searchRouter } from './search/routes.js';
import type { EmbedQuery } from './search/service.js';

export function createApp({
  db,
  embedQuery = (text) => ollamaEmbedQuery(text),
}: {
  db: Db;
  embedQuery?: EmbedQuery;
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
