import express, { type ErrorRequestHandler } from 'express';
import { catalogRouter } from './catalog/routes.js';
import { apiError } from './catalog/schema.js';
import type { Db } from './db/client.js';
import { embedQuery as ollamaEmbedQuery } from './ingest/embeddings.js';
import { openApiDocument } from './openapi.js';
import { searchRouter } from './search/routes.js';
import type { EmbedQuery } from './search/service.js';

// La base y el proveedor de vectores se reciben de afuera: server.ts usa los
// reales y los tests una base temporal (ver test/helpers/test-db.ts) y un
// embedQuery falso.
export function createApp({
  db,
  embedQuery = (text) => ollamaEmbedQuery(text),
}: {
  db: Db;
  embedQuery?: EmbedQuery;
}) {
  const app = express();

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/api/v1/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });
  app.use('/api/v1', catalogRouter(db));
  app.use('/api/v1', searchRouter(db, embedQuery));

  app.use((req, res) => {
    res.status(404).json(apiError('NOT_FOUND', `No existe la ruta ${req.method} ${req.path}`));
  });

  // Sin esto, Express responde los errores inesperados con una página HTML.
  const handleError: ErrorRequestHandler = (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    // JSON mal formado en el cuerpo: lo detecta express.json() antes de la ruta.
    if (error instanceof SyntaxError && 'type' in error && error.type === 'entity.parse.failed') {
      res.status(400).json(apiError('INVALID_QUERY', 'El cuerpo no es un JSON válido'));
      return;
    }
    console.error(error);
    res.status(500).json(apiError('INTERNAL_ERROR', 'Error interno del servidor'));
  };
  app.use(handleError);

  return app;
}
