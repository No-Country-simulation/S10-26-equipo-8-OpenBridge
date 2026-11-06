import { parseArgs } from 'node:util';
import { z } from 'zod';
import { createDb } from '../db/client.js';
import { embedQuery } from '../ingest/embeddings.js';
import { searchRequestSchema } from './schema.js';
import { EmbeddingsUnavailableError, searchCatalog } from './service.js';

// npm run db:search -w backend -- "texto" [--category auth] [--min-health 60]
//   [--limit 5] [--type REPOSITORY|INTEGRATION_IDEA]
// Prueba la búsqueda contra la base y Ollama reales, sin levantar el servidor.

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    category: { type: 'string', multiple: true },
    'min-health': { type: 'string' },
    limit: { type: 'string' },
    type: { type: 'string', multiple: true },
  },
});

const optionalNumber = (value: string | undefined) =>
  value === undefined ? undefined : Number(value);

const request = searchRequestSchema.safeParse({
  query: positionals.join(' '),
  categories: values.category,
  minHealth: optionalNumber(values['min-health']),
  limit: optionalNumber(values.limit),
  types: values.type,
});
if (!request.success) {
  console.error(`Parámetros inválidos:\n${z.prettifyError(request.error)}`);
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('Falta DATABASE_URL: copiá backend/.env.example a backend/.env');

const { db, pool } = createDb(databaseUrl);
try {
  const results = await searchCatalog(db, request.data, {
    embedQuery: (text) => embedQuery(text),
  });
  if (!results) {
    console.error(`No existe alguna de las categorías: ${request.data.categories?.join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log(`"${request.data.query}"`);
    for (const [index, result] of results.entries()) {
      const categories = result.categories.map(({ slug }) => slug).join(', ');
      const health = result.repository.healthScore ?? 'sin puntaje';
      const kind = result.type === 'REPOSITORY' ? 'repo' : 'idea';
      console.log(
        `${index + 1}. ${result.similarity.toFixed(3)}  [${kind}] ${result.title}  ` +
          `(${categories}; salud ${health})`,
      );
    }
  }
} catch (error) {
  if (!(error instanceof EmbeddingsUnavailableError)) throw error;
  console.error(`Ollama no está disponible (${error.message}). ¿Corriste "ollama serve"?`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
