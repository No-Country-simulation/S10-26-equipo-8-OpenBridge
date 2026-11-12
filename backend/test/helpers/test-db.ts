import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createDb, type Db } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';

const adminUrl =
  process.env.DATABASE_URL ?? 'postgresql://openbridge:openbridge@localhost:5432/openbridge';

// Los tests crean y borran bases: nunca contra un servidor remoto como Neon.
const host = new URL(adminUrl).hostname;
if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) {
  throw new Error(`Los tests de base de datos solo corren contra localhost, no contra "${host}"`);
}

export type TestDb = {
  db: Db;
  url: string;
  close: () => Promise<void>;
};

// Crea una base vacía con nombre único, le aplica las migraciones y la
// borra al cerrar. Cada archivo de test arranca desde cero.
export async function createTestDb(): Promise<TestDb> {
  const name = `openbridge_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const { db, pool } = createDb(url.toString());
  await runMigrations(db);

  return {
    db,
    url: url.toString(),
    close: async () => {
      await pool.end();
      const cleanup = new pg.Client({ connectionString: adminUrl });
      await cleanup.connect();
      await cleanup.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await cleanup.end();
    },
  };
}
