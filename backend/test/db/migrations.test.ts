import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/test-db.js';

const migrationsDir = fileURLToPath(new URL('../../drizzle', import.meta.url));

async function columnsOf(t: TestDb, table: string) {
  const result = await t.db.execute<{ column_name: string }>(
    sql`SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${table}`,
  );
  return result.rows.map((r) => r.column_name);
}

describe('migraciones', () => {
  let t: TestDb;

  beforeAll(async () => {
    t = await createTestDb();
  });

  afterAll(async () => {
    await t?.close();
  });

  it('están versionadas en el repo como archivos SQL', () => {
    const sqlFiles = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
    expect(sqlFiles.length).toBeGreaterThan(0);
  });

  it('crean la tabla category sobre una base vacía', async () => {
    expect(await columnsOf(t, 'category')).toEqual(
      expect.arrayContaining(['id', 'slug', 'name', 'description']),
    );
  });

  it('crean la tabla repository con todos los campos de la ficha técnica', async () => {
    expect(await columnsOf(t, 'repository')).toEqual(
      expect.arrayContaining([
        'id',
        'github_id',
        'full_name',
        'name',
        'description',
        'url',
        'homepage',
        'primary_language',
        'license_spdx',
        'stars',
        'forks',
        'open_issues',
        'last_commit_at',
        'last_release_at',
        'archived',
        'topics',
        'active_maintainer',
        'health_score',
        'maintenance_level',
        'content_hash',
        'last_synced_at',
      ]),
    );
  });

  it('relacionan repos y categorías de muchos a muchos', async () => {
    expect(await columnsOf(t, 'repository')).not.toContain('category_id');
    expect((await columnsOf(t, 'repository_category')).sort()).toEqual([
      'category_id',
      'repository_id',
    ]);
  });
});
