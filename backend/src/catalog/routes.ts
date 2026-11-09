import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { getCatalogFilters } from './filters.js';
import { listRepositories } from './repositories.js';
import { apiError, listRepositoriesQuerySchema } from './schema.js';

export function catalogRouter(db: Db): Router {
  const router = Router();

  router.get('/repositories', async (req, res) => {
    const query = listRepositoriesQuerySchema.safeParse(req.query);
    if (!query.success) {
      res.status(400).json(apiError('INVALID_QUERY', z.prettifyError(query.error)));
      return;
    }

    const page = await listRepositories(db, query.data);
    if (!page) {
      res
        .status(404)
        .json(apiError('CATEGORY_NOT_FOUND', `No existe la categoría "${query.data.category}"`));
      return;
    }
    res.json(page);
  });

  router.get('/filters', async (_req, res) => {
    res.json(await getCatalogFilters(db));
  });

  return router;
}
