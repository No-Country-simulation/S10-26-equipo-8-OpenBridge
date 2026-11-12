import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../../src/db/client.js';
import { EMBEDDING_DIMENSIONS, embedding, repository } from '../../src/db/schema.js';
import { searchCatalog } from '../../src/search/service.js';
import { createTestDb, type TestDb } from '../helpers/test-db.js';

function vectorWithSimilarity(similarity: number, axis: number): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  vector[0] = similarity;
  vector[axis] = Math.sqrt(1 - similarity ** 2);
  return vector;
}

// Los únicos repos que cumplen el filtro son los menos parecidos. Con el
// índice HNSW (que trae ~40 vecinos y recién después filtra) y sin escaneo
// iterativo, la búsqueda devolvería menos de `limit`. Hoy el planificador no
// usa HNSW en esta consulta (hace una búsqueda exacta), pero el test fija el
// comportamiento para cualquier plan, aun sin poder recorrer la tabla.
describe('búsqueda con un filtro selectivo', () => {
  let t: TestDb;
  let indexed: { db: Db; close: () => Promise<void> };

  beforeAll(async () => {
    t = await createTestDb();

    const total = 400;
    const repos = await t.db
      .insert(repository)
      .values(
        Array.from({ length: total }, (_, index) => ({
          githubId: index + 1,
          fullName: `acme/repo-${index}`,
          name: `repo-${index}`,
          url: `https://github.com/acme/repo-${index}`,
          // Los 10 últimos son los únicos sanos, y los menos parecidos.
          healthScore: index >= total - 10 ? 95 : 40,
        })),
      )
      .returning({ id: repository.id });
    await t.db.insert(embedding).values(
      repos.map(({ id }, index) => ({
        entityType: 'REPOSITORY' as const,
        entityId: id,
        content: `repo-${index}`,
        vector: vectorWithSimilarity(index >= total - 10 ? 0.05 : 0.5 + index / 1000, index + 1),
        model: 'bge-m3',
      })),
    );
    await t.db.execute(sql`ANALYZE`);

    // Aplica a las conexiones nuevas: el pool de abajo prefiere los índices
    // a recorrer la tabla.
    await t.db.execute(
      sql.raw(`ALTER DATABASE "${new URL(t.url).pathname.slice(1)}" SET enable_seqscan = off`),
    );
    const { db, pool } = createDb(t.url);
    indexed = { db, close: () => pool.end() };
  });

  afterAll(async () => {
    await indexed?.close();
    await t?.close();
  });

  it('completa el límite aunque los que cumplen el filtro estén lejos', async () => {
    const results = await searchCatalog(
      indexed.db,
      { query: 'sso', limit: 5, minHealth: 90 },
      { embedQuery: async () => vectorWithSimilarity(1, 1) },
    );

    expect(results).toHaveLength(5);
    expect(results!.every(({ repository: repo }) => repo.healthScore === 95)).toBe(true);
  });
});
