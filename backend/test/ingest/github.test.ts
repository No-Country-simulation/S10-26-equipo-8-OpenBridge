import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, afterEach, describe, expect, it, vi } from 'vitest';
import { upsertRepository } from '../../src/db/repositories.js';
import { category, repository } from '../../src/db/schema.js';
import { fetchRepoBatch, syncRepoBatch } from '../../src/ingest/github.js';
import { createTestDb, type TestDb } from '../helpers/test-db.js';

describe('cliente GraphQL de GitHub', () => {
  let t: TestDb;
  let categoryId: string;

  beforeAll(async () => {
    t = await createTestDb();
    const [auth] = await t.db
      .insert(category)
      .values({ slug: 'auth', name: 'Autenticación' })
      .returning();
    categoryId = auth.id;
  });

  afterAll(async () => {
    await t?.close();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const githubRepo = (overrides: Record<string, unknown> = {}) => ({
    databaseId: 42,
    nameWithOwner: 'vercel/next.js',
    url: 'https://github.com/vercel/next.js',
    description: 'The React framework',
    homepageUrl: 'https://nextjs.org',
    primaryLanguage: { name: 'JavaScript' },
    stargazerCount: 100000,
    forkCount: 20000,
    issues: { totalCount: 500 },
    closedIssues: { totalCount: 1000 },
    isArchived: false,
    repositoryTopics: { nodes: [{ topic: { name: 'react' } }] },
    licenseInfo: { spdxId: 'MIT' },
    defaultBranchRef: {
      target: {
        committedDate: '2026-10-25T10:00:00Z',
        history: {
          totalCount: 2,
          nodes: [
            { author: { user: { login: 'vercel' } } },
            { author: { user: { login: 'contributor' } } },
          ],
        },
      },
    },
    latestRelease: { publishedAt: '2026-10-20T10:00:00Z' },
    ...overrides,
  });

  it('usa el endpoint GraphQL y deja continuar el lote ante errores por alias', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { r0: null, r1: githubRepo() },
          errors: [{ type: 'NOT_FOUND', path: ['r0'], message: 'Repository not found' }],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const results = await syncRepoBatch(
      t.db,
      [
        { owner: 'owner"quoted', name: 'absent' },
        { owner: 'zeit', name: 'next.js' },
      ],
      'test-token',
      categoryId,
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.github.com/graphql');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer test-token');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.query).toContain('repository(owner: "owner\\"quoted", name: "absent")');
    expect(results.map(({ status }) => status)).toEqual(['not_found', 'ok']);
  });

  it('persiste el id, las fechas y el identificador SPDX en el modelo de repositorio', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ data: { r0: githubRepo() } }), { status: 200 }),
        ),
    );

    const [result] = await syncRepoBatch(
      t.db,
      [{ owner: 'zeit', name: 'next.js' }],
      'test-token',
      categoryId,
    );

    expect(result.status).toBe('ok');
    const [saved] = await t.db.select().from(repository).where(eq(repository.githubId, 42));
    expect(saved).toMatchObject({
      fullName: 'vercel/next.js',
      licenseSpdx: 'MIT',
      lastCommitAt: new Date('2026-10-25T10:00:00Z'),
      lastReleaseAt: new Date('2026-10-20T10:00:00Z'),
      healthScore: expect.any(Number),
      maintenanceLevel: 'ACTIVE',
      activeMaintainer: true,
    });
  });

  it('actualiza por github_id y refleja el nombre nuevo cuando GitHub redirige un repo', async () => {
    await upsertRepository(t.db, {
      githubId: 43,
      fullName: 'zeit/next.js',
      name: 'next.js',
      url: 'https://github.com/zeit/next.js',
      categoryId,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              r0: githubRepo({
                databaseId: 43,
                nameWithOwner: 'vercel/next.js',
                url: 'https://github.com/vercel/next.js',
              }),
            },
          }),
          { status: 200 },
        ),
      ),
    );

    const [result] = await syncRepoBatch(
      t.db,
      [{ owner: 'zeit', name: 'next.js' }],
      'test-token',
      categoryId,
    );

    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.renamed).toBe(true);
    const saved = await t.db.select().from(repository).where(eq(repository.githubId, 43));
    expect(saved).toHaveLength(1);
    expect(saved[0].fullName).toBe('vercel/next.js');
  });
});
