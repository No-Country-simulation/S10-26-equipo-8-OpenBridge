import { parseArgs } from 'node:util';
import { z } from 'zod';
import { createDb } from '../db/client.js';
import { embedQuery } from '../ingest/embeddings.js';
import { hybridSearchRequestSchema, searchRequestSchema } from './schema.js';
import { EmbeddingsUnavailableError, searchCatalog, searchHybridCatalog } from './service.js';

// npm run db:search -w backend -- "texto" [--category auth] [--min-health 60]
//   [--limit 5] [--type REPOSITORY|INTEGRATION_IDEA] [--hybrid]
// Prueba la búsqueda contra la base y Ollama reales, sin levantar el servidor.

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    category: { type: 'string', multiple: true },
    'min-health': { type: 'string' },
    limit: { type: 'string' },
    type: { type: 'string', multiple: true },
    hybrid: { type: 'boolean', default: false },
  },
});

const optionalNumber = (value: string | undefined) =>
  value === undefined ? undefined : Number(value);

if (values.hybrid && (values.category?.length ?? 0) > 1) {
  console.error('La búsqueda híbrida acepta una sola categoría.');
  process.exit(1);
}
if (values.hybrid && values.type?.length) {
  console.error('--type solo se usa con la búsqueda semántica.');
  process.exit(1);
}

const request = values.hybrid
  ? {
      mode: 'hybrid' as const,
      parsed: hybridSearchRequestSchema.safeParse({
        query: positionals.join(' '),
        category: values.category?.[0],
        minHealth: optionalNumber(values['min-health']),
        size: optionalNumber(values.limit),
      }),
    }
  : {
      mode: 'semantic' as const,
      parsed: searchRequestSchema.safeParse({
        query: positionals.join(' '),
        categories: values.category,
        minHealth: optionalNumber(values['min-health']),
        limit: optionalNumber(values.limit),
        types: values.type,
      }),
    };
if (!request.parsed.success) {
  console.error(`Parámetros inválidos:\n${z.prettifyError(request.parsed.error)}`);
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('Falta DATABASE_URL: copiá backend/.env.example a backend/.env');

const { db, pool } = createDb(databaseUrl);
try {
  if (request.mode === 'hybrid') {
    const results = await searchHybridCatalog(db, request.parsed.data, {
      embedQuery: (text) => embedQuery(text),
    });
    if (!results) {
      console.error(`No existe la categoría: ${request.parsed.data.category}`);
      process.exitCode = 1;
    } else {
      console.log(`"${request.parsed.data.query}"`);
      for (const [index, result] of results.data.entries()) {
        const categories = result.categories.map(({ slug }) => slug).join(', ');
        const health = result.healthScore ?? 'sin puntaje';
        console.log(`${index + 1}. [repo] ${result.fullName} (${categories}; salud ${health})`);
      }
    }
  } else {
    const results = await searchCatalog(db, request.parsed.data, {
      embedQuery: (text) => embedQuery(text),
    });
    if (!results) {
      console.error(
        `No existe alguna de las categorías: ${request.parsed.data.categories?.join(', ')}`,
      );
      process.exitCode = 1;
    } else {
      console.log(`"${request.parsed.data.query}"`);
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
  }
} catch (error) {
  if (!(error instanceof EmbeddingsUnavailableError)) throw error;
  console.error(`Ollama no está disponible (${error.message}). ¿Corriste "ollama serve"?`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
