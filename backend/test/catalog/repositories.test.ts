import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { upsertRepository } from '../../src/db/repositories.js';
import { category } from '../../src/db/schema.js';
import { createTestDb, type TestDb } from '../helpers/test-db.js';

describe('GET /api/v1/repositories', () => {
  let t: TestDb;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    t = await createTestDb();
    app = createApp({ db: t.db });

    const [auth, database] = await t.db
      .insert(category)
      .values([
        { slug: 'auth', name: 'Autenticación' },
        { slug: 'database', name: 'Base de Datos' },
      ])
      .returning();

    const repo = (githubId: number, name: string, healthScore: number | null, ids: string[]) =>
      upsertRepository(
        t.db,
        {
          githubId,
          fullName: `acme/${name}`,
          name,
          url: `https://github.com/acme/${name}`,
          stars: githubId * 10,
          healthScore,
          maintenanceLevel: healthScore === null ? null : 'ACTIVE',
          licenseSpdx: 'MIT',
          lastCommitAt: new Date('2026-10-01T00:00:00Z'),
        },
        ids,
      );
    await repo(1, 'auth-90', 90, [auth.id]);
    await repo(2, 'auth-50', 50, [auth.id]);
    await repo(3, 'auth-sin-puntaje', null, [auth.id]);
    await repo(4, 'db-99', 99, [database.id]);
    await repo(5, 'auth-db-70', 70, [auth.id, database.id]);
  });

  afterAll(async () => {
    await t?.close();
  });

  const names = (body: { data: Array<{ fullName: string }> }) =>
    body.data.map(({ fullName }) => fullName);

  it('lista una categoría ordenada por salud de mayor a menor, con el total', async () => {
    const res = await request(app).get('/api/v1/repositories?category=auth&page=1&size=20');

    expect(res.status).toBe(200);
    expect(names(res.body)).toEqual([
      'acme/auth-90',
      'acme/auth-db-70',
      'acme/auth-50',
      'acme/auth-sin-puntaje',
    ]);
    expect(res.body.meta).toEqual({ page: 1, size: 20, total: 4, totalPages: 1 });
  });

  it('devuelve cada repo con los campos del contrato y todas sus categorías', async () => {
    const res = await request(app).get('/api/v1/repositories?category=auth');

    expect(res.body.data[1]).toEqual({
      id: expect.any(String),
      fullName: 'acme/auth-db-70',
      name: 'auth-db-70',
      description: null,
      primaryLanguage: null,
      licenseSpdx: 'MIT',
      stars: 50,
      healthScore: 70,
      maintenanceLevel: 'ACTIVE',
      categories: [
        { slug: 'auth', name: 'Autenticación' },
        { slug: 'database', name: 'Base de Datos' },
      ],
      lastCommitAt: '2026-10-01T00:00:00.000Z',
    });
  });

  it('pagina los resultados', async () => {
    const res = await request(app).get('/api/v1/repositories?category=auth&page=2&size=2');

    expect(names(res.body)).toEqual(['acme/auth-50', 'acme/auth-sin-puntaje']);
    expect(res.body.meta).toEqual({ page: 2, size: 2, total: 4, totalPages: 2 });
  });

  it('sin categoría lista todo el catálogo', async () => {
    const res = await request(app).get('/api/v1/repositories');

    expect(res.status).toBe(200);
    expect(names(res.body)).toEqual([
      'acme/db-99',
      'acme/auth-90',
      'acme/auth-db-70',
      'acme/auth-50',
      'acme/auth-sin-puntaje',
    ]);
    expect(res.body.meta).toEqual({ page: 1, size: 20, total: 5, totalPages: 1 });
  });

  it('responde 404 con un mensaje claro si la categoría no existe', async () => {
    const res = await request(app).get('/api/v1/repositories?category=nope');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'CATEGORY_NOT_FOUND', message: 'No existe la categoría "nope"' },
    });
  });

  it('limita el tamaño de página a 100', async () => {
    const res = await request(app).get('/api/v1/repositories?size=500');

    expect(res.status).toBe(200);
    expect(res.body.meta.size).toBe(100);
  });

  it.each(['page=0', 'page=abc', 'size=0', 'size=1.5', 'page=1&page=2'])(
    'responde 400 ante parámetros inválidos (%s)',
    async (query) => {
      const res = await request(app).get(`/api/v1/repositories?${query}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_QUERY');
    },
  );
});

describe('GET /api/v1/repositories — filtros de mantenimiento y estrellas', () => {
  let t: TestDb;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    t = await createTestDb();
    app = createApp({ db: t.db });

    const [auth, database] = await t.db
      .insert(category)
      .values([
        { slug: 'auth', name: 'Autenticación' },
        { slug: 'database', name: 'Base de Datos' },
      ])
      .returning();

    const repo = (
      githubId: number,
      name: string,
      stars: number,
      level: 'ACTIVE' | 'MODERATE' | 'AT_RISK' | 'ARCHIVED' | null,
      ids: string[],
      description?: string,
    ) =>
      upsertRepository(
        t.db,
        {
          githubId,
          fullName: `acme/${name}`,
          name,
          description,
          url: `https://github.com/acme/${name}`,
          stars,
          healthScore: 50,
          maintenanceLevel: level,
        },
        ids,
      );
    await repo(1, 'active-exact', 10000, 'ACTIVE', [auth.id], 'zebra login library');
    await repo(2, 'active-below', 9999, 'ACTIVE', [auth.id], 'zebra login library');
    await repo(3, 'moderate-big', 25000, 'MODERATE', [auth.id]);
    await repo(4, 'at-risk-big', 50000, 'AT_RISK', [database.id]);
    await repo(5, 'archived-mid', 12000, 'ARCHIVED', [auth.id]);
    await repo(6, 'no-level', 30000, null, [database.id]);
    await repo(7, 'active-db', 40000, 'ACTIVE', [database.id]);
  });

  afterAll(async () => {
    await t?.close();
  });

  const get = (query: string) => request(app).get(`/api/v1/repositories?${query}`);
  const names = (body: { data: Array<{ fullName: string }> }) =>
    body.data.map(({ fullName }) => fullName.replace('acme/', '')).sort();

  it('sin los parámetros nuevos lista todo el catálogo', async () => {
    const res = await get('');

    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(7);
  });

  it('maintenance=ACTIVE devuelve solo repos activos', async () => {
    const res = await get('maintenance=ACTIVE');

    expect(res.status).toBe(200);
    expect(names(res.body)).toEqual(['active-below', 'active-db', 'active-exact']);
    expect(res.body.meta.total).toBe(3);
    expect(
      res.body.data.every((r: { maintenanceLevel: string }) => r.maintenanceLevel === 'ACTIVE'),
    ).toBe(true);
  });

  it('acepta varios niveles separados por coma (cualquiera de ellos)', async () => {
    const res = await get('maintenance=ACTIVE,MODERATE');

    expect(names(res.body)).toEqual(['active-below', 'active-db', 'active-exact', 'moderate-big']);
    expect(res.body.meta.total).toBe(4);
  });

  it('no distingue mayúsculas, ignora espacios y duplicados', async () => {
    const res = await get('maintenance=%20active%20,%20at_risk,ACTIVE');

    expect(res.status).toBe(200);
    expect(names(res.body)).toEqual(['active-below', 'active-db', 'active-exact', 'at-risk-big']);
  });

  it.each(['maintenance=ACTIVE,NOPE', 'maintenance=foo', 'maintenance=ACTIVE,', 'maintenance=,'])(
    'rechaza un nivel desconocido o vacío entre comas (%s) con el campo en el detalle',
    async (query) => {
      const res = await get(query);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_QUERY');
      expect(res.body.error.message).toContain('maintenance');
    },
  );

  it('maintenance vacío equivale a no mandarlo', async () => {
    const res = await get('maintenance=');

    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(7);
  });

  it('minStars incluye los repos con exactamente esa cantidad y excluye los de menos', async () => {
    const res = await get('minStars=10000');

    expect(res.status).toBe(200);
    expect(names(res.body)).not.toContain('active-below');
    expect(names(res.body)).toContain('active-exact');
    expect(res.body.meta.total).toBe(6);
    expect(res.body.data.every((r: { stars: number }) => r.stars >= 10000)).toBe(true);
  });

  it('minStars=0 no filtra y minStars vacío equivale a no mandarlo', async () => {
    expect((await get('minStars=0')).body.meta.total).toBe(7);
    expect((await get('minStars=')).body.meta.total).toBe(7);
  });

  it.each([
    'minStars=-1',
    'minStars=abc',
    'minStars=1.5',
    'minStars=1e3',
    'minStars=99999999999',
    'minStars=1&minStars=2',
  ])('rechaza minStars inválido (%s)', async (query) => {
    const res = await get(query);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_QUERY');
    expect(res.body.error.message).toContain('minStars');
  });

  it('combina maintenance, minStars, category y q con el total filtrado', async () => {
    const res = await get('maintenance=ACTIVE,MODERATE&minStars=10000&category=auth&q=zebra');

    expect(res.status).toBe(200);
    expect(names(res.body)).toEqual(['active-exact']);
    expect(res.body.meta).toEqual({ page: 1, size: 20, total: 1, totalPages: 1 });
  });

  it('meta.total refleja el filtro aunque la paginación y el orden lo recorten', async () => {
    const res = await get('maintenance=ACTIVE,MODERATE&minStars=10000&size=2&sort=stars');

    expect(res.body.meta).toEqual({ page: 1, size: 2, total: 3, totalPages: 2 });
    expect(res.body.data.map((r: { stars: number }) => r.stars)).toEqual([40000, 25000]);

    const second = await get('maintenance=ACTIVE,MODERATE&minStars=10000&size=2&sort=stars&page=2');
    expect(second.body.data.map((r: { stars: number }) => r.stars)).toEqual([10000]);
  });
});

describe('GET /api/v1/openapi.json', () => {
  it('documenta el listado de repositorios', async () => {
    const res = await request(createApp({ db: {} as never })).get('/api/v1/openapi.json');

    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    const operation = res.body.paths['/api/v1/repositories'].get;
    expect(operation.parameters.map((p: { name: string }) => p.name)).toEqual([
      'category',
      'language',
      'license',
      'maintenance',
      'minStars',
      'q',
      'sort',
      'page',
      'size',
    ]);
    expect(Object.keys(operation.responses)).toEqual(['200', '400', '404']);
    expect(res.body.components.schemas.RepositoryPage).toBeDefined();
    expect(res.body.paths['/api/v1/filters'].get.responses).toHaveProperty('200');
    expect(res.body.components.schemas.CatalogFilters).toBeDefined();
  });
});
