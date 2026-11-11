import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { upsertRepository } from '../../src/db/repositories.js';
import { repository, syncRun } from '../../src/db/schema.js';
import type { RepoRef } from '../../src/ingest/github.js';
import { runSync } from '../../src/ingest/sync-run.js';
import { createTestDb, type TestDb } from '../helpers/test-db.js';

const HOUR = 60 * 60 * 1000;

const refs = (...names: string[]): RepoRef[] => names.map((name) => ({ owner: 'acme', name }));

// Responde cada alias con un repo cuyo id sale del nombre (repo-7 → 7), o
// NOT_FOUND si el nombre empieza con "missing". Cada query cuesta 1 punto.
function githubEcho() {
  let remaining = 4000;
  return vi.fn(async (_url: string, init: RequestInit) => {
    const { query } = JSON.parse(String(init.body)) as { query: string };
    const data: Record<string, unknown> = {};
    const errors: unknown[] = [];
    for (const [, alias, name] of query.matchAll(
      /(r\d+): repository\(owner: "acme", name: "([^"]+)"\)/g,
    )) {
      if (name.startsWith('missing')) {
        data[alias] = null;
        errors.push({ type: 'NOT_FOUND', path: [alias], message: 'Repository not found' });
        continue;
      }
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
    remaining -= 1;
    data.rateLimit = { cost: 1, remaining, resetAt: '2026-11-02T12:00:00Z' };
    return new Response(JSON.stringify({ data, errors }), { status: 200 });
  });
}

const requestedNames = (fetchMock: ReturnType<typeof githubEcho>) =>
  fetchMock.mock.calls.flatMap(([, init]) =>
    [...String(init.body).matchAll(/name: \\"([^\\]+)\\"/g)].map(([, name]) => name),
  );

describe('runSync', () => {
  let t: TestDb;

  beforeAll(async () => {
    t = await createTestDb();
  });

  beforeEach(async () => {
    await t.db.delete(syncRun);
    await t.db.delete(repository);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await t?.close();
  });

  it('registra la ejecución con repos correctos, fallidos y puntos del límite', async () => {
    vi.stubGlobal('fetch', githubEcho());

    const run = await runSync(t.db, refs('repo-1', 'repo-2', 'missing-1'), {
      token: 'test-token',
      batchSize: 2,
    });

    expect(run).toMatchObject({
      status: 'COMPLETED',
      reposTotal: 3,
      reposOk: 2,
      reposFailed: 1,
      rateLimitUsed: 2,
      rateLimitRemaining: 3998,
      rateLimitResetAt: new Date('2026-11-02T12:00:00Z'),
      finishedAt: expect.any(Date),
    });
    const [saved] = await t.db.select().from(syncRun).where(eq(syncRun.id, run.id));
    expect(saved).toEqual(run);
  });

  it('retoma una ejecución interrumpida sin reprocesar los repos ya actualizados', async () => {
    const [interrupted] = await t.db
      .insert(syncRun)
      .values({
        reposTotal: 2,
        reposOk: 1,
        rateLimitUsed: 1,
        startedAt: new Date(Date.now() - HOUR),
      })
      .returning();
    await upsertRepository(t.db, {
      githubId: 1,
      fullName: 'acme/repo-1',
      name: 'repo-1',
      url: 'https://github.com/acme/repo-1',
      lastSyncedAt: new Date(),
    });
    const fetchMock = githubEcho();
    vi.stubGlobal('fetch', fetchMock);

    const run = await runSync(t.db, refs('repo-1', 'repo-2'), { token: 'test-token' });

    expect(requestedNames(fetchMock)).toEqual(['repo-2']);
    expect(run).toMatchObject({
      id: interrupted.id,
      status: 'COMPLETED',
      reposTotal: 2,
      reposOk: 2,
      reposFailed: 0,
      rateLimitUsed: 2,
    });
    expect(await t.db.select().from(syncRun)).toHaveLength(1);
  });

  it('marca la ejecución como fallida si GitHub la corta, y la retoma al relanzar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));

    await expect(runSync(t.db, refs('repo-1'), { token: 'test-token' })).rejects.toThrow(
      'GitHub respondió 401',
    );

    const [failed] = await t.db.select().from(syncRun);
    expect(failed).toMatchObject({
      status: 'FAILED',
      error: 'GitHub respondió 401',
      finishedAt: expect.any(Date),
    });

    vi.stubGlobal('fetch', githubEcho());
    const run = await runSync(t.db, refs('repo-1'), { token: 'test-token' });

    expect(run).toMatchObject({ id: failed.id, status: 'COMPLETED', reposOk: 1, error: null });
  });

  it('incluye la etapa de vectores en el registro de la ejecución', async () => {
    vi.stubGlobal('fetch', githubEcho());
    const afterSync = vi.fn().mockRejectedValue(new Error('Ollama no disponible'));

    await expect(runSync(t.db, refs('repo-1'), { token: 'test-token', afterSync })).rejects.toThrow(
      'Ollama no disponible',
    );

    expect(afterSync).toHaveBeenCalledOnce();
    const [run] = await t.db.select().from(syncRun);
    expect(run).toMatchObject({
      status: 'FAILED',
      reposOk: 1,
      reposFailed: 0,
      error: 'Ollama no disponible',
      finishedAt: expect.any(Date),
    });
  });

  it('no retoma una ejecución sin actividad hace más de 12 horas', async () => {
    const startedAt = new Date(Date.now() - 14 * HOUR);
    const [abandoned] = await t.db
      .insert(syncRun)
      .values({ reposTotal: 1, startedAt, updatedAt: new Date(Date.now() - 13 * HOUR) })
      .returning();
    await upsertRepository(t.db, {
      githubId: 1,
      fullName: 'acme/repo-1',
      name: 'repo-1',
      url: 'https://github.com/acme/repo-1',
      lastSyncedAt: new Date(startedAt.getTime() + 60_000),
    });
    const fetchMock = githubEcho();
    vi.stubGlobal('fetch', fetchMock);

    const run = await runSync(t.db, refs('repo-1'), { token: 'test-token' });

    expect(requestedNames(fetchMock)).toEqual(['repo-1']);
    expect(run.id).not.toBe(abandoned.id);
    const [old] = await t.db.select().from(syncRun).where(eq(syncRun.id, abandoned.id));
    expect(old.status).toBe('FAILED');
  });

  it('cierra las ejecuciones huérfanas que quedaron RUNNING', async () => {
    const [orphan] = await t.db
      .insert(syncRun)
      .values({ reposTotal: 1, startedAt: new Date(Date.now() - 2 * HOUR) })
      .returning();
    await t.db
      .insert(syncRun)
      .values({ reposTotal: 1, status: 'COMPLETED', startedAt: new Date(Date.now() - HOUR) });
    vi.stubGlobal('fetch', githubEcho());

    await runSync(t.db, refs('repo-1'), { token: 'test-token' });

    const [old] = await t.db.select().from(syncRun).where(eq(syncRun.id, orphan.id));
    expect(old.status).toBe('FAILED');
  });

  it('guarda last_synced_at en cada repo actualizado', async () => {
    vi.stubGlobal('fetch', githubEcho());

    await runSync(t.db, refs('repo-1'), { token: 'test-token' });

    const [saved] = await t.db.select().from(repository);
    expect(saved.lastSyncedAt).toBeInstanceOf(Date);
  });
});
