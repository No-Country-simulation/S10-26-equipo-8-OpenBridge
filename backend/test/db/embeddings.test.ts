import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findNearestEmbeddings, upsertEmbedding } from '../../src/db/embeddings.js';
import { EMBEDDING_DIMENSIONS, embedding } from '../../src/db/schema.js';
import { createTestDb, type TestDb } from '../helpers/test-db.js';

// Generador con semilla: los vectores son los mismos en cada corrida.
function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 2 ** 32;
    return state / 2 ** 32 - 0.5;
  };
}

function randomVector(random: () => number): number[] {
  return Array.from({ length: EMBEDDING_DIMENSIONS }, random);
}

describe('almacenamiento de embeddings', () => {
  let t: TestDb;

  beforeAll(async () => {
    t = await createTestDb();
  });

  afterAll(async () => {
    await t?.close();
  });

  it('la migración habilita la extensión vector', async () => {
    const result = await t.db.execute<{ extname: string }>(
      sql`SELECT extname FROM pg_extension WHERE extname = 'vector'`,
    );
    expect(result.rows).toHaveLength(1);
  });

  it('crea la columna vector con la dimensión del modelo', async () => {
    const result = await t.db.execute<{ type: string }>(
      sql`SELECT format_type(atttypid, atttypmod) AS type FROM pg_attribute
          WHERE attrelid = 'embedding'::regclass AND attname = 'vector'`,
    );
    expect(result.rows[0].type).toBe(`vector(${EMBEDDING_DIMENSIONS})`);
  });

  it('indexa los vectores con HNSW por distancia coseno', async () => {
    const result = await t.db.execute<{ indexdef: string }>(
      sql`SELECT indexdef FROM pg_indexes WHERE tablename = 'embedding'`,
    );
    const defs = result.rows.map((r) => r.indexdef);
    expect(defs).toEqual(
      expect.arrayContaining([expect.stringMatching(/USING hnsw \(vector vector_cosine_ops\)/)]),
    );
  });

  it('rechaza un vector con otra dimensión', async () => {
    await expect(
      upsertEmbedding(t.db, {
        entityType: 'REPOSITORY',
        entityId: randomUUID(),
        content: 'dimensión equivocada',
        vector: [0.1, 0.2, 0.3],
        model: 'nomic-embed-text',
      }),
    ).rejects.toThrow();
  });

  it('guarda un solo embedding por entidad y lo reemplaza al regenerarlo', async () => {
    const random = seededRandom(1);
    const entityId = randomUUID();
    const first = await upsertEmbedding(t.db, {
      entityType: 'INTEGRATION_IDEA',
      entityId,
      content: 'versión 1',
      vector: randomVector(random),
      model: 'nomic-embed-text',
    });
    const second = await upsertEmbedding(t.db, {
      entityType: 'INTEGRATION_IDEA',
      entityId,
      content: 'versión 2',
      vector: randomVector(random),
      model: 'nomic-embed-text',
    });

    expect(second.id).toBe(first.id);
    const rows = await t.db
      .select()
      .from(embedding)
      .where(sql`${embedding.entityId} = ${entityId}`);
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe('versión 2');
  });

  describe('con 1.000 vectores cargados', () => {
    const random = seededRandom(42);
    const rows = Array.from({ length: 1000 }, (_, index) => ({
      entityType: index % 2 === 0 ? ('REPOSITORY' as const) : ('INTEGRATION_IDEA' as const),
      entityId: randomUUID(),
      content: `entidad ${index}`,
      vector: randomVector(random),
      model: 'nomic-embed-text',
    }));

    beforeAll(async () => {
      for (let start = 0; start < rows.length; start += 250) {
        await t.db.insert(embedding).values(rows.slice(start, start + 250));
      }
      await t.db.execute(sql`ANALYZE embedding`);
    });

    it('devuelve los 10 más cercanos en menos de 100 ms', async () => {
      const query = rows[500].vector;
      await findNearestEmbeddings(t.db, query); // calienta la conexión y el caché

      const start = performance.now();
      const nearest = await findNearestEmbeddings(t.db, query, { limit: 10 });
      const elapsed = performance.now() - start;

      expect(nearest).toHaveLength(10);
      expect(elapsed).toBeLessThan(100);
    });

    it('resuelve cada resultado a su entidad de origen', async () => {
      const target = rows[123];
      const [closest] = await findNearestEmbeddings(t.db, target.vector, { limit: 1 });

      expect(closest).toMatchObject({
        entityType: target.entityType,
        entityId: target.entityId,
      });
      expect(closest.distance).toBeCloseTo(0, 5);
    });

    it('ordena por distancia y puede filtrar por tipo de entidad', async () => {
      const nearest = await findNearestEmbeddings(t.db, rows[7].vector, {
        limit: 10,
        entityType: 'REPOSITORY',
      });

      expect(nearest.every(({ entityType }) => entityType === 'REPOSITORY')).toBe(true);
      const distances = nearest.map(({ distance }) => distance);
      expect(distances).toEqual([...distances].sort((a, b) => a - b));
    });
  });
});
