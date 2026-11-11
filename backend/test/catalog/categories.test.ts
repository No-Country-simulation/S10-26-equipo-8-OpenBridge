import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { upsertRepository } from '../../src/db/repositories.js';
import { category } from '../../src/db/schema.js';
import { createTestDb, type TestDb } from '../helpers/test-db.js';

describe('GET /api/v1/categories', () => {
  let t: TestDb;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    t = await createTestDb();
    app = createApp({ db: t.db });

    // Se insertan fuera de orden alfabético para probar que el orden sale de la consulta.
    const [search, auth, database, payments] = await t.db
      .insert(category)
      .values([
        { slug: 'search', name: 'Búsqueda', description: 'Motores de búsqueda' },
        { slug: 'auth', name: 'Autenticación', description: 'Inicio de sesión' },
        { slug: 'database', name: 'Base de Datos', description: null },
        { slug: 'payments', name: 'Pagos', description: 'Cobros' },
      ])
      .returning();

    const repo = (githubId: number, name: string, ids: string[]) =>
      upsertRepository(
        t.db,
        {
          githubId,
          fullName: `acme/${name}`,
          name,
          url: `https://github.com/acme/${name}`,
          description: null,
          topics: [],
          primaryLanguage: null,
          licenseSpdx: null,
          stars: 1,
        },
        ids,
      );

    await repo(1, 'keycloak', [auth!.id]);
    await repo(2, 'authlib', [auth!.id]);
    // Supabase: dos categorías, cuenta una vez en cada una.
    await repo(3, 'supabase', [database!.id, auth!.id]);
    await repo(4, 'meilisearch', [search!.id]);
    void payments;
  });

  afterAll(async () => {
    await t?.close();
  });

  const get = (query = '') => request(app).get(`/api/v1/categories${query}`);
  const countOf = (
    body: { data: Array<{ slug: string; repositoryCount: number }> },
    slug: string,
  ) => body.data.find((c) => c.slug === slug)?.repositoryCount;

  it('responde 200 con { data } y los campos del contrato en cada ítem', async () => {
    const res = await get();

    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(['data']);
    expect(res.body.data).toHaveLength(4);
    for (const item of res.body.data) {
      expect(Object.keys(item).sort()).toEqual(
        ['description', 'id', 'name', 'repositoryCount', 'slug'].sort(),
      );
      expect(item.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(typeof item.slug).toBe('string');
      expect(typeof item.name).toBe('string');
      expect(Number.isInteger(item.repositoryCount)).toBe(true);
      expect(item.repositoryCount).toBeGreaterThanOrEqual(0);
    }
  });

  it('incluye las categorías sin repositorios con repositoryCount 0', async () => {
    const res = await get();

    expect(countOf(res.body, 'payments')).toBe(0);
  });

  it('un repo con varias categorías cuenta una vez en cada una', async () => {
    const res = await get();

    expect(countOf(res.body, 'auth')).toBe(3);
    expect(countOf(res.body, 'database')).toBe(1);
    expect(countOf(res.body, 'search')).toBe(1);
  });

  it('devuelve la descripción tal cual está guardada, también null', async () => {
    const res = await get();
    const bySlug = (slug: string) => res.body.data.find((c: { slug: string }) => c.slug === slug);

    expect(bySlug('auth').description).toBe('Inicio de sesión');
    expect(bySlug('database').description).toBeNull();
  });

  it('ordena por nombre ascendente', async () => {
    const res = await get();

    expect(res.body.data.map((c: { slug: string }) => c.slug)).toEqual([
      'auth',
      'database',
      'search',
      'payments',
    ]);
  });

  it('ignora los parámetros desconocidos', async () => {
    const res = await get('?foo=bar&page=2');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(4);
  });

  it('con el catálogo vacío devuelve { data: [] }', async () => {
    const empty = await createTestDb();
    try {
      const res = await request(createApp({ db: empty.db })).get('/api/v1/categories');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: [] });
    } finally {
      await empty.close();
    }
  });
});
