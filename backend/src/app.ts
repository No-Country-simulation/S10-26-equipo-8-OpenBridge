import express, { type ErrorRequestHandler } from 'express';
import { catalogRouter } from './catalog/routes.js';
import { apiError } from './catalog/schema.js';
import type { Db } from './db/client.js';
import { openApiDocument } from './openapi.js';

// La base se recibe de afuera: server.ts usa la real y los tests una
// temporal (ver test/helpers/test-db.ts).
export function createApp({ db }: { db: Db }) {
  const app = express();

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/api/v1/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });
  app.use('/api/v1', catalogRouter(db));

  app.use((req, res) => {
    res.status(404).json(apiError('NOT_FOUND', `No existe la ruta ${req.method} ${req.path}`));
  });

  // Sin esto, Express responde los errores inesperados con una página HTML.
  const handleError: ErrorRequestHandler = (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    console.error(error);
    res.status(500).json(apiError('INTERNAL_ERROR', 'Error interno del servidor'));
  };
  app.use(handleError);

  return app;
}
