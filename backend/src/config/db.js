import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

export const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS repositorios_metadata (
      id SERIAL PRIMARY KEY,
      owner VARCHAR(100),
      name VARCHAR(100),
      description TEXT,
      stars INT,
      forks INT,
      license VARCHAR(100),
      language VARCHAR(100),
      topics TEXT[],
      open_issues INT,
      last_commit_sha VARCHAR(50),
      last_release_version VARCHAR(50),
      is_archived BOOLEAN,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS errores_extraccion (
      id SERIAL PRIMARY KEY,
      owner VARCHAR(100),
      name VARCHAR(100),
      error_message TEXT,
      fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}