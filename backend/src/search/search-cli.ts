import { parseArgs } from 'node:util';
import { createDb } from '../db/client.js';
import { embedQuery } from '../ingest/embeddings.js';
import { searchCatalog } from './service.js';

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

const query = positionals.join(' ');
if (!query.trim()) throw new Error('Falta el texto a buscar: npm run db:search -- "texto"');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('Falta DATABASE_URL: copiá backend/.env.example a backend/.env');

const { db, pool } = createDb(databaseUrl);
try {
  const results = await searchCatalog(
    db,
    {
      query,
      categories: values.category,
      minHealth: values['min-health'] === undefined ? undefined : Number(values['min-health']),
      limit: values.limit === undefined ? undefined : Number(values.limit),
      types: values.type as ('REPOSITORY' | 'INTEGRATION_IDEA')[] | undefined,
    },
    { embedQuery: (text) => embedQuery(text) },
  );
  if (!results) {
    console.error(`No existe alguna de las categorías: ${values.category?.join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log(`"${query}"`);
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
} finally {
  await pool.end();
}
