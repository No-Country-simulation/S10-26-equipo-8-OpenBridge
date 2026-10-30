import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, afterEach, describe, expect, it, vi } from 'vitest';
import { upsertRepository } from '../../src/db/repositories.js';
import { category, repository, repositoryCategory } from '../../src/db/schema.js';
import { fetchRepos, syncRepos, type RepoRef } from '../../src/ingest/github.js';
import { createTestDb, type TestDb } from '../helpers/test-db.js';

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
  pullRequests: {
    nodes: [
      {
        mergedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        mergedBy: { login: 'org-maintainer' },
      },
    ],
  },
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

    const results = await syncRepos(
      t.db,
      [
        { owner: 'owner"quoted', name: 'absent' },
        { owner: 'zeit', name: 'next.js' },
      ],
      { token: 'test-token', categoryIds: [categoryId] },
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.github.com/graphql');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer test-token');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.query).toContain('repository(owner: "owner\\"quoted", name: "absent")');
    expect(body.query).toContain(
      'pullRequests(states: MERGED, last: 20) { nodes { mergedAt mergedBy { login } } }',
    );
    expect(body.query).not.toContain('mentionableUsers');
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

    const [result] = await syncRepos(t.db, [{ owner: 'zeit', name: 'next.js' }], {
      token: 'test-token',
      categoryIds: [categoryId],
    });

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
    await upsertRepository(
      t.db,
      {
        githubId: 43,
        fullName: 'zeit/next.js',
        name: 'next.js',
        url: 'https://github.com/zeit/next.js',
      },
      [categoryId],
    );
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

    const [result] = await syncRepos(t.db, [{ owner: 'zeit', name: 'next.js' }], {
      token: 'test-token',
      categoryIds: [categoryId],
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.renamed).toBe(true);
    const saved = await t.db.select().from(repository).where(eq(repository.githubId, 43));
    expect(saved).toHaveLength(1);
    expect(saved[0].fullName).toBe('vercel/next.js');
  });

  it('vincula el repo a las categorías recibidas', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { r0: githubRepo({ databaseId: 44 }) } }), {
          status: 200,
        }),
      ),
    );

    const [result] = await syncRepos(t.db, [{ owner: 'vercel', name: 'next.js' }], {
      token: 'test-token',
      categoryIds: [categoryId],
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    const links = await t.db
      .select()
      .from(repositoryCategory)
      .where(eq(repositoryCategory.repositoryId, result.savedId));
    expect(links.map((link) => link.categoryId)).toEqual([categoryId]);
  });

  it('sin categoryIds conserva las categorías que el repo ya tenía', async () => {
    const existing = await upsertRepository(
      t.db,
      { githubId: 45, fullName: 'acme/lib', name: 'lib', url: 'https://github.com/acme/lib' },
      [categoryId],
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              r0: githubRepo({
                databaseId: 45,
                nameWithOwner: 'acme/lib',
                url: 'https://github.com/acme/lib',
              }),
            },
          }),
          { status: 200 },
        ),
      ),
    );

    await syncRepos(t.db, [{ owner: 'acme', name: 'lib' }], { token: 'test-token' });

    const links = await t.db
      .select()
      .from(repositoryCategory)
      .where(eq(repositoryCategory.repositoryId, existing.id));
    expect(links.map((link) => link.categoryId)).toEqual([categoryId]);
  });
});

describe('fetchRepos', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const refs = (count: number): RepoRef[] =>
    Array.from({ length: count }, (_, index) => ({ owner: 'acme', name: `repo-${index}` }));

  // Responde un repo por cada alias de la query, con un id derivado del nombre pedido.
  function githubEcho() {
    return vi.fn(async (_url: string, init: RequestInit) => {
      const { query } = JSON.parse(String(init.body)) as { query: string };
      const data: Record<string, unknown> = {};
      for (const [, alias, name] of query.matchAll(
        /(r\d+): repository\(owner: "acme", name: "([^"]+)"\)/g,
      )) {
        data[alias] = {
          databaseId: Number(name.replace('repo-', '')),
          nameWithOwner: `acme/${name}`,
          url: `https://github.com/acme/${name}`,
          description: null,
          homepageUrl: null,
          primaryLanguage: null,
          stargazerCount: 0,
          forkCount: 0,
          issues: { totalCount: 0 },
          closedIssues: { totalCount: 0 },
          pullRequests: { nodes: [] },
          isArchived: false,
          repositoryTopics: { nodes: [] },
          licenseInfo: null,
          defaultBranchRef: null,
          latestRelease: null,
        };
      }
      return new Response(JSON.stringify({ data }), { status: 200 });
    });
  }

  const aliasCount = (call: unknown[]) =>
    [...String((call[1] as RequestInit).body).matchAll(/r\d+: repository/g)].length;

  it('parte la lista en lotes de 50 por defecto y respeta el orden', async () => {
    const fetchMock = githubEcho();
    vi.stubGlobal('fetch', fetchMock);

    const results = await fetchRepos(refs(120), { token: 'test-token' });

    expect(fetchMock.mock.calls.map(aliasCount)).toEqual([50, 50, 20]);
    expect(results).toHaveLength(120);
    expect(results.map(({ request }) => request.name)).toEqual(refs(120).map(({ name }) => name));
    expect(results.every(({ status }) => status === 'ok')).toBe(true);
  });

  it('acepta un tamaño de lote configurable', async () => {
    const fetchMock = githubEcho();
    vi.stubGlobal('fetch', fetchMock);

    await fetchRepos(refs(100), { token: 'test-token', batchSize: 25 });

    expect(fetchMock.mock.calls.map(aliasCount)).toEqual([25, 25, 25, 25]);
  });

  it('detecta un merge reciente de un mantenedor en un repo de organización', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            r0: {
              databaseId: 46,
              nameWithOwner: 'acme/tool',
              url: 'https://github.com/acme/tool',
              description: null,
              homepageUrl: null,
              primaryLanguage: null,
              stargazerCount: 0,
              forkCount: 0,
              issues: { totalCount: 0 },
              closedIssues: { totalCount: 0 },
              pullRequests: {
                nodes: [
                  {
                    mergedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
                    mergedBy: { login: 'maintainer' },
                  },
                ],
              },
              isArchived: false,
              repositoryTopics: { nodes: [] },
              licenseInfo: null,
              defaultBranchRef: {
                target: {
                  committedDate: '2026-10-25T10:00:00Z',
                  history: {
                    totalCount: 1,
                    nodes: [{ author: { user: { login: 'maintainer' } } }],
                  },
                },
              },
              latestRelease: null,
            },
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const [result] = await fetchRepos([{ owner: 'acme', name: 'tool' }], {
      token: 'test-token',
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.repository.activeMaintainer).toBe(true);
  });

  it('no considera mantenedor activo a quien solo tiene commits recientes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            r0: githubRepo({
              pullRequests: {
                nodes: [
                  {
                    mergedAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(),
                    mergedBy: { login: 'maintainer' },
                  },
                ],
              },
              defaultBranchRef: {
                target: {
                  committedDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
                  history: {
                    totalCount: 1,
                    nodes: [{ author: { user: { login: 'contributor' } } }],
                  },
                },
              },
            }),
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const [result] = await fetchRepos([{ owner: 'acme', name: 'tool' }], {
      token: 'test-token',
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.repository.activeMaintainer).toBe(false);
  });

  it.each([0, -1, 1.5, 101])('rechaza un tamaño de lote inválido (%s)', async (batchSize) => {
    vi.stubGlobal('fetch', githubEcho());

    await expect(fetchRepos(refs(1), { token: 'test-token', batchSize })).rejects.toThrow(
      /batchSize/,
    );
  });

  it('lee el token de GITHUB_TOKEN cuando no se pasa uno', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'env-token');
    const fetchMock = githubEcho();
    vi.stubGlobal('fetch', fetchMock);

    await fetchRepos(refs(1));

    const init = fetchMock.mock.calls[0][1] as RequestInit & { headers: Record<string, string> };
    expect(init.headers.Authorization).toBe('Bearer env-token');
  });

  it('falla sin llamar a GitHub si no hay GITHUB_TOKEN', async () => {
    vi.stubEnv('GITHUB_TOKEN', '');
    const fetchMock = githubEcho();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchRepos(refs(1))).rejects.toThrow(/GITHUB_TOKEN/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no incluye el token en los errores', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));

    const error = await fetchRepos(refs(1), { token: 'secret-token' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect(String((error as Error).message)).not.toContain('secret-token');
  });
});
