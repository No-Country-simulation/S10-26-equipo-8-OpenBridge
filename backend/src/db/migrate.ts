import { fileURLToPath, pathToFileURL } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb, type Db } from './client.js';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

export async function runMigrations(db: Db) {
  await migrate(db, { migrationsFolder });
}

// Ejecutado directo (npm run db:migrate): aplica las migraciones pendientes.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL: copiá backend/.env.example a backend/.env');
  const { db, pool } = createDb(url);
  await runMigrations(db);
  await pool.end();
  console.log('Migraciones aplicadas');
}
