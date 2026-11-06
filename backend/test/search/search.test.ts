import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { upsertEmbedding } from '../../src/db/embeddings.js';
import { upsertRepository } from '../../src/db/repositories.js';
import { EMBEDDING_DIMENSIONS, category, integrationIdea } from '../../src/db/schema.js';
import { searchCatalog } from '../../src/search/service.js';
import { createTestDb, type TestDb } from '../helpers/test-db.js';

// Vector unitario que forma un ángulo con el eje 0: la similitud coseno con
// la consulta (el eje 0) es exactamente `similarity`.
function vectorWithSimilarity(similarity: number, axis: number): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  vector[0] = similarity;
  vector[axis] = Math.sqrt(1 - similarity ** 2);
  return vector;
}

const QUERY_VECTOR = vectorWithSimilarity(1, 1);
const embedQuery = vi.fn(async () => QUERY_VECTOR);

describe('búsqueda por significado', () => {
  let t: TestDb;
  let app: ReturnType<typeof createApp>;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestDb();
    app = createApp({ db: t.db, embedQuery });

    const [auth, payments] = await t.db
      .insert(category)
      .values([
        { slug: 'auth', name: 'Autenticación' },
        { slug: 'payments', name: 'Pagos' },
      ])
      .returning();

    // nombre, salud, categorías, similitud con la consulta
    const repos: Array<[string, number | null, string[], number]> = [
      ['keycloak', 95, [auth.id], 0.9],
      ['authelia', 55, [auth.id], 0.95],
      ['sin-puntaje', null, [auth.id], 0.85],
      ['stripe', 80, [payments.id], 0.6],
      ['lejano', 90, [auth.id], 0.1],
    ];
    for (const [index, [name, healthScore, categoryIds, similarity]] of repos.entries()) {
      const saved = await upsertRepository(
        t.db,
        {
          githubId: index + 1,
          fullName: `acme/${name}`,
          name,
          url: `https://github.com/acme/${name}`,
          description: `Descripción de ${name}`,
          healthScore,
        },
        categoryIds,
      );
      ids[name] = saved.id;
      await upsertEmbedding(t.db, {
        entityType: 'REPOSITORY',
        entityId: saved.id,
        content: name,
        vector: vectorWithSimilarity(similarity, index + 2),
        model: 'bge-m3',
      });
    }

    const [idea] = await t.db
      .insert(integrationIdea)
      .values({
        repositoryId: ids.keycloak,
        title: 'SSO para el portal de clientes',
        summary: 'Login único con Keycloak.',
        integrationType: 'REST_API',
        difficulty: 'MEDIUM',
        status: 'APPROVED',
        source: 'HUMAN',
      })
      .returning();
    ids.idea = idea.id;
    await upsertEmbedding(t.db, {
      entityType: 'INTEGRATION_IDEA',
      entityId: idea.id,
      content: idea.title,
      vector: vectorWithSimilarity(0.92, 20),
      model: 'bge-m3',
    });

    // Lo que nunca tiene que aparecer, aunque sea lo más parecido: una idea
    // en borrador y vectores huérfanos (entity_id no tiene FK).
    const [draft] = await t.db
      .insert(integrationIdea)
      .values({
        repositoryId: ids.keycloak,
        title: 'Idea en borrador',
        summary: 'Todavía no se revisó.',
        integrationType: 'SDK',
        difficulty: 'LOW',
        status: 'DRAFT',
        source: 'LLM',
      })
      .returning();
    const hidden: Array<['REPOSITORY' | 'INTEGRATION_IDEA', string, number]> = [
      ['INTEGRATION_IDEA', draft.id, 0.99],
      ['REPOSITORY', randomUUID(), 0.98],
      ['INTEGRATION_IDEA', randomUUID(), 0.97],
    ];
    for (const [index, [entityType, entityId, similarity]] of hidden.entries()) {
      await upsertEmbedding(t.db, {
        entityType,
        entityId,
        content: 'oculto',
        vector: vectorWithSimilarity(similarity, 30 + index),
        model: 'bge-m3',
      });
    }

    // Idea aprobada de un repo con salud baja (authelia, 55).
    const [lowHealthIdea] = await t.db
      .insert(integrationIdea)
      .values({
        repositoryId: ids.authelia,
        title: 'Idea de authelia',
        summary: 'Portal con login único.',
        integrationType: 'DOCKER',
        difficulty: 'LOW',
        status: 'APPROVED',
        source: 'HUMAN',
      })
      .returning();
    await upsertEmbedding(t.db, {
      entityType: 'INTEGRATION_IDEA',
      entityId: lowHealthIdea.id,
      content: lowHealthIdea.title,
      vector: vectorWithSimilarity(0.3, 40),
      model: 'bge-m3',
    });
  });

  afterAll(async () => {
    await t?.close();
  });

  const titles = (results: Array<{ title: string }>) => results.map(({ title }) => title);

  describe('searchCatalog', () => {
    it('ordena repos e ideas por similitud y respeta el límite', async () => {
      const results = await searchCatalog(t.db, { query: 'sso', limit: 3 }, { embedQuery });

      expect(titles(results ?? [])).toEqual([
        'acme/authelia',
        'SSO para el portal de clientes',
        'acme/keycloak',
      ]);
      expect(embedQuery).toHaveBeenCalledWith('sso');
    });

    it('devuelve identificador, similitud y categoría de cada resultado', async () => {
      const [idea, repo] = (await searchCatalog(
        t.db,
        { query: 'sso', limit: 5, types: ['REPOSITORY', 'INTEGRATION_IDEA'], minHealth: 90 },
        { embedQuery },
      ))!;

      expect(idea).toEqual({
        type: 'INTEGRATION_IDEA',
        id: ids.idea,
        similarity: 0.92,
        title: 'SSO para el portal de clientes',
        summary: 'Login único con Keycloak.',
        categories: [{ slug: 'auth', name: 'Autenticación' }],
        repository: { id: ids.keycloak, fullName: 'acme/keycloak', healthScore: 95 },
      });
      expect(repo).toMatchObject({
        type: 'REPOSITORY',
        id: ids.keycloak,
        similarity: 0.9,
        summary: 'Descripción de keycloak',
        categories: [{ slug: 'auth', name: 'Autenticación' }],
      });
    });

    it('con salud mínima 60 no devuelve repos por debajo ni sin puntaje', async () => {
      const results = (await searchCatalog(
        t.db,
        { query: 'sso', limit: 10, minHealth: 60 },
        { embedQuery },
      ))!;

      expect(results.length).toBeGreaterThan(0);
      expect(results.every(({ repository }) => (repository.healthScore ?? -1) >= 60)).toBe(true);
      expect(titles(results)).not.toContain('acme/authelia');
      expect(titles(results)).not.toContain('acme/sin-puntaje');
    });

    it('filtra por categoría y por tipo', async () => {
      const payments = (await searchCatalog(
        t.db,
        { query: 'cobros', limit: 10, categories: ['payments'] },
        { embedQuery },
      ))!;
      expect(titles(payments)).toEqual(['acme/stripe']);

      const onlyIdeas = (await searchCatalog(
        t.db,
        { query: 'sso', limit: 10, types: ['INTEGRATION_IDEA'] },
        { embedQuery },
      ))!;
      expect(titles(onlyIdeas)).toEqual(['SSO para el portal de clientes', 'Idea de authelia']);
    });

    it('no devuelve ideas en borrador ni vectores de entidades borradas', async () => {
      const results = (await searchCatalog(t.db, { query: 'sso', limit: 20 }, { embedQuery }))!;

      expect(titles(results)).not.toContain('Idea en borrador');
      expect(results).toHaveLength(7);
    });

    it('filtra las ideas por la salud de su repositorio', async () => {
      const results = (await searchCatalog(
        t.db,
        { query: 'sso', limit: 10, minHealth: 60, types: ['INTEGRATION_IDEA'] },
        { embedQuery },
      ))!;

      expect(titles(results)).toEqual(['SSO para el portal de clientes']);
    });

    it('devuelve null si una categoría pedida no existe', async () => {
      await expect(
        searchCatalog(
          t.db,
          { query: 'sso', limit: 5, categories: ['auth', 'nope'] },
          { embedQuery },
        ),
      ).resolves.toBeNull();
    });
  });

  describe('POST /api/v1/search', () => {
    it('responde los resultados con los valores por defecto', async () => {
      const res = await request(app).post('/api/v1/search').send({ query: 'sso' });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(5);
      expect(res.body.data[0]).toMatchObject({ type: 'REPOSITORY', title: 'acme/authelia' });
    });

    it('aplica los filtros del cuerpo', async () => {
      const res = await request(app)
        .post('/api/v1/search')
        .send({
          query: 'sso',
          limit: 2,
          categories: ['AUTH'],
          minHealth: 60,
          types: ['REPOSITORY'],
        });

      expect(res.status).toBe(200);
      expect(titles(res.body.data)).toEqual(['acme/keycloak', 'acme/lejano']);
    });

    it.each<{ reason: string; body: object }>([
      { reason: 'sin texto', body: {} },
      { reason: 'texto vacío', body: { query: '   ' } },
      { reason: 'límite fuera de rango', body: { query: 'sso', limit: 50 } },
      { reason: 'salud fuera de rango', body: { query: 'sso', minHealth: 101 } },
      { reason: 'tipo inexistente', body: { query: 'sso', types: ['OTRO'] } },
    ])('rechaza un cuerpo inválido: $reason', async ({ body }) => {
      const res = await request(app).post('/api/v1/search').send(body);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_QUERY');
    });

    it('rechaza un JSON mal formado', async () => {
      const res = await request(app)
        .post('/api/v1/search')
        .set('Content-Type', 'application/json')
        .send('{"query":');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_QUERY');
    });

    it('responde 413 si el cuerpo es demasiado grande', async () => {
      const res = await request(app)
        .post('/api/v1/search')
        .send({ query: 'sso', padding: 'x'.repeat(20_000) });

      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe('INVALID_QUERY');
    });

    it('responde 404 si una categoría no existe', async () => {
      const res = await request(app)
        .post('/api/v1/search')
        .send({ query: 'sso', categories: ['nope'] });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('CATEGORY_NOT_FOUND');
    });

    it('responde 503 si no se puede vectorizar la consulta', async () => {
      const failing = createApp({
        db: t.db,
        embedQuery: async () => {
          throw new Error('No se pudo conectar con Ollama: fetch failed');
        },
      });

      const res = await request(failing).post('/api/v1/search').send({ query: 'sso' });

      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('EMBEDDINGS_UNAVAILABLE');
    });

    it('documenta el servicio en OpenAPI', async () => {
      const res = await request(app).get('/api/v1/openapi.json');

      expect(res.body.paths['/api/v1/search'].post.responses).toHaveProperty('503');
      expect(res.body.components.schemas).toHaveProperty('SearchResponse');
      // En el request, solo `query` es obligatorio: limit tiene default.
      expect(res.body.components.schemas.SearchRequest.required).toEqual(['query']);
    });
  });
});
