import { createDb } from '../db/client.js';
import { formatEmbeddingReport, generateEmbeddings } from './embeddings.js';

// npm run db:embed -w backend
// Solo la etapa de vectores, sin consultar GitHub: sirve después de aprobar
// ideas o para preparar la búsqueda en local.

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('Falta DATABASE_URL: copiá backend/.env.example a backend/.env');

const { db, pool } = createDb(databaseUrl);
try {
  const report = await generateEmbeddings(db);
  console.log(formatEmbeddingReport(report));
  if (report.failed.length > 0) process.exitCode = 1;
} finally {
  await pool.end();
}
