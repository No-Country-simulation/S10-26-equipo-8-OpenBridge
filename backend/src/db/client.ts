import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export type Db = NodePgDatabase<typeof schema>;

// Postgres en Docker en local y Neon en producción: los dos aceptan
// una connection string estándar, así que alcanza con node-postgres.
export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString });
  // Sin este handler, una conexión inactiva que se corta (Neon suspende
  // las bases sin uso) emite un error no capturado y tira el proceso.
  pool.on('error', (err) => console.error('Error en una conexión inactiva de Postgres:', err));
  return { db: drizzle(pool, { schema }), pool };
}
