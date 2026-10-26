import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { category } from '../../src/db/schema.js';
import { seedCategories } from '../../src/db/seed.js';
import { createTestDb, type TestDb } from '../helpers/test-db.js';

describe('carga inicial de categorías', () => {
  let t: TestDb;

  beforeAll(async () => {
    t = await createTestDb();
  });

  afterAll(async () => {
    await t?.close();
  });

  it('crea al menos las 6 categorías base', async () => {
    await seedCategories(t.db);

    const names = (await t.db.select().from(category)).map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'Autenticación',
        'Base de Datos',
        'Pagos',
        'IA',
        'Analítica',
        'Búsqueda',
      ]),
    );
  });

  it('no duplica categorías si se corre dos veces', async () => {
    await seedCategories(t.db);
    await seedCategories(t.db);

    const slugs = (await t.db.select().from(category)).map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
