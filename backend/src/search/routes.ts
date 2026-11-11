import express, { Router } from 'express';
import { z } from 'zod';
import { apiError } from '../catalog/schema.js';
import type { Db } from '../db/client.js';
import { searchRequestSchema } from './schema.js';
import { EmbeddingsUnavailableError, searchCatalog, type EmbedQuery } from './service.js';

export function searchRouter(db: Db, embedQuery: EmbedQuery): Router {
  const router = Router();

  router.post('/search', express.json({ limit: '10kb' }), async (req, res) => {
    const body = searchRequestSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json(apiError('INVALID_QUERY', z.prettifyError(body.error)));
      return;
    }

    try {
      const results = await searchCatalog(db, body.data, { embedQuery });
      if (!results) {
        res
          .status(404)
          .json(
            apiError(
              'CATEGORY_NOT_FOUND',
              `No existe alguna de las categorías: ${body.data.categories?.join(', ')}`,
            ),
          );
        return;
      }
      res.json({ data: results });
    } catch (error) {
      if (!(error instanceof EmbeddingsUnavailableError)) throw error;
      console.error(error);
      res
        .status(503)
        .json(
          apiError(
            'EMBEDDINGS_UNAVAILABLE',
            'El servicio de búsqueda por significado no está disponible',
          ),
        );
    }
  });

  return router;
}
