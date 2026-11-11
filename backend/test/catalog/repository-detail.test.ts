import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createIntegrationIdea } from '../../src/db/integration-ideas.js';
import { upsertRepository } from '../../src/db/repositories.js';
import { category, integrationIdea, repository } from '../../src/db/schema.js';
import { createTestDb, type TestDb } from '../helpers/test-db.js';

describe('GET /api/v1/repositories/:id', () => {
  let t: TestDb;
  let app: ReturnType<typeof createApp>;
  let full: { id: string };
  let bare: { id: string };
  let peer: { id: string };
  let approvedIdeaId: string;

  const newRepo = (githubId: number, name: string) =>
    upsertRepository(t.db, {
      githubId,
      fullName: `acme/${name}`,
      name,
      url: `https://github.com/acme/${name}`,
    });

  const idea = async (
    repositoryId: string,
    title: string,
    status: 'DRAFT' | 'APPROVED' | 'REJECTED',
    extra: Record<string, unknown> = {},
  ) => {
    const saved = await createIntegrationIdea(t.db, {
      repositoryId,
      title,
      summary: `Resumen de ${title}`,
      integrationType: 'REST_API',
      difficulty: 'LOW',
      source: 'HUMAN',
      ...extra,
    });
    await t.db.update(integrationIdea).set({ status }).where(eq(integrationIdea.id, saved.id));
    return saved;
  };

  beforeAll(async () => {
    t = await createTestDb();
    app = createApp({ db: t.db });

    const [auth] = await t.db
      .insert(category)
      .values({ slug: 'auth', name: 'Autenticación' })
      .returning();

    full = await upsertRepository(
      t.db,
      {
        githubId: 1,
        fullName: 'acme/full',
        name: 'full',
        description: 'Repo completo',
        url: 'https://github.com/acme/full',
        homepage: 'https://full.example.com',
        primaryLanguage: 'TypeScript',
        licenseSpdx: 'MIT',
        stars: 1200,
        forks: 80,
        openIssues: 12,
        lastCommitAt: new Date('2026-10-01T00:00:00Z'),
        lastReleaseAt: new Date('2026-09-15T00:00:00Z'),
        archived: false,
        topics: ['auth', 'sso'],
        activeMaintainer: true,
        healthScore: 90,
        maintenanceLevel: 'ACTIVE',
        lastSyncedAt: new Date('2026-11-01T12:00:00Z'),
      },
      [auth.id],
    );
    bare = await newRepo(2, 'bare');
    peer = await newRepo(3, 'peer');

    const approved = await idea(full.id, 'Aprobada', 'APPROVED', {
      integrationType: 'WEBHOOK',
      difficulty: 'MEDIUM',
      triggers: [{ event: 'user.login', description: 'Inicio de sesión' }],
      snippet: { language: 'typescript', code: 'console.log(1)' },
      stackCompatibility: ['nextjs'],
      // El último id no existe en el catálogo y tiene que descartarse.
      connectsWith: [peer.id, '11111111-1111-4111-8111-111111111111'],
    });
    approvedIdeaId = approved.id;
    await idea(full.id, 'Borrador', 'DRAFT');
    await idea(full.id, 'Rechazada', 'REJECTED');
    await idea(bare.id, 'Solo borrador', 'DRAFT');
  });

  afterAll(async () => {
    await t?.close();
  });

  it('devuelve la ficha completa dentro de data, con los tipos del contrato', async () => {
    const res = await request(app).get(`/api/v1/repositories/${full.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: {
        id: full.id,
        fullName: 'acme/full',
        name: 'full',
        description: 'Repo completo',
        primaryLanguage: 'TypeScript',
        licenseSpdx: 'MIT',
        stars: 1200,
        healthScore: 90,
        maintenanceLevel: 'ACTIVE',
        categories: [{ slug: 'auth', name: 'Autenticación' }],
        lastCommitAt: '2026-10-01T00:00:00.000Z',
        url: 'https://github.com/acme/full',
        homepage: 'https://full.example.com',
        forks: 80,
        openIssues: 12,
        lastReleaseAt: '2026-09-15T00:00:00.000Z',
        archived: false,
        topics: ['auth', 'sso'],
        activeMaintainer: true,
        lastSyncedAt: '2026-11-01T12:00:00.000Z',
        integrationIdeas: [
          {
            id: approvedIdeaId,
            title: 'Aprobada',
            summary: 'Resumen de Aprobada',
            integrationType: 'WEBHOOK',
            difficulty: 'MEDIUM',
            triggers: [{ event: 'user.login', description: 'Inicio de sesión' }],
            snippet: { language: 'typescript', code: 'console.log(1)' },
            stackCompatibility: ['nextjs'],
            connectsWith: [{ id: peer.id, fullName: 'acme/peer' }],
          },
        ],
      },
    });
  });

  it('los campos del listado son idénticos a los de GET /repositories', async () => {
    const list = await request(app).get('/api/v1/repositories?size=100');
    const detail = await request(app).get(`/api/v1/repositories/${full.id}`);
    const item = list.body.data.find((r: { id: string }) => r.id === full.id);

    expect(item).toBeDefined();
    expect(detail.body.data).toMatchObject(item);
  });

  it('un repo sin ideas aprobadas devuelve integrationIdeas vacío y los nulls del contrato', async () => {
    const res = await request(app).get(`/api/v1/repositories/${bare.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.integrationIdeas).toEqual([]);
    expect(res.body.data).toMatchObject({
      homepage: null,
      lastReleaseAt: null,
      lastCommitAt: null,
      categories: [],
      topics: [],
      archived: false,
      activeMaintainer: false,
    });
  });

  it('sin sincronización de GitHub, lastSyncedAt cae a la última escritura del repo', async () => {
    const [row] = await t.db.select().from(repository).where(eq(repository.id, bare.id));
    expect(row.lastSyncedAt).toBeNull();

    const res = await request(app).get(`/api/v1/repositories/${bare.id}`);

    expect(res.body.data.lastSyncedAt).toBe(row.updatedAt.toISOString());
  });

  it('nunca expone ideas DRAFT ni REJECTED', async () => {
    const res = await request(app).get(`/api/v1/repositories/${full.id}`);
    const titles = res.body.data.integrationIdeas.map((i: { title: string }) => i.title);

    expect(titles).toEqual(['Aprobada']);
  });

  it('un UUID que no existe responde 404 NOT_FOUND', async () => {
    const res = await request(app).get('/api/v1/repositories/22222222-2222-4222-8222-222222222222');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: expect.any(String) } });
  });

  it.each(['abc', '123', 'mock-supabase', '%20', 'a'.repeat(300)])(
    'un id mal formado (%s) responde 404 y no 500',
    async (id) => {
      const res = await request(app).get(`/api/v1/repositories/${encodeURIComponent(id)}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    },
  );
});
