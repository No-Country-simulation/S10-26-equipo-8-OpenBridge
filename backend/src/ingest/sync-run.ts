import { and, desc, eq, gte, ne, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { repository, syncRun, type SyncRun } from '../db/schema.js';
import {
  errorMessage,
  syncRepos,
  type RepoRef,
  type SyncRepoResult,
  type SyncReposOptions,
} from './github.js';

// Una ejecución sin terminar más vieja que esto no se retoma: sus datos ya
// están desactualizados y conviene sincronizar todo de nuevo.
const RESUME_WINDOW_MS = 12 * 60 * 60 * 1000;

export type RunSyncOptions = Omit<SyncReposOptions, 'onBatch'> & {
  afterSync?: (results: SyncRepoResult[]) => Promise<void> | void;
};

// Nombres (en minúsculas) de los repos actualizados desde `since`.
async function syncedSince(db: Db, since: Date): Promise<Set<string>> {
  const rows = await db
    .select({ fullName: repository.fullName })
    .from(repository)
    .where(gte(repository.lastSyncedAt, since));
  return new Set(rows.map(({ fullName }) => fullName.toLowerCase()));
}

// Arranca una ejecución nueva o retoma la última si quedó sin terminar
// (el proceso se cortó o falló). Devuelve la ejecución y los repos pendientes.
async function startOrResume(
  db: Db,
  repos: RepoRef[],
): Promise<{ run: SyncRun; pending: RepoRef[] }> {
  const [last] = await db.select().from(syncRun).orderBy(desc(syncRun.startedAt)).limit(1);
  // La ventana se cuenta desde el último lote guardado, no desde el arranque.
  const resumable =
    last && last.status !== 'COMPLETED' && Date.now() - last.updatedAt.getTime() <= RESUME_WINDOW_MS
      ? last
      : undefined;

  // Cualquier otra ejecución que haya quedado RUNNING ya no se va a retomar.
  await db
    .update(syncRun)
    .set({
      status: 'FAILED',
      error: 'Ejecución abandonada: no terminó y no se retomó a tiempo',
      updatedAt: sql`now()`,
    })
    .where(
      and(eq(syncRun.status, 'RUNNING'), resumable ? ne(syncRun.id, resumable.id) : undefined),
    );

  if (resumable) {
    // Un repo renombrado no coincide con el nombre pedido y se vuelve a
    // traer: cuesta un punto del límite y no rompe nada.
    const done = await syncedSince(db, resumable.startedAt);
    const pending = repos.filter(({ owner, name }) => !done.has(`${owner}/${name}`.toLowerCase()));
    // Los fallidos se vuelven a intentar, así que su cuenta arranca de cero.
    const [run] = await db
      .update(syncRun)
      .set({
        status: 'RUNNING',
        reposTotal: repos.length,
        reposOk: repos.length - pending.length,
        reposFailed: 0,
        finishedAt: null,
        error: null,
        updatedAt: sql`now()`,
      })
      .where(eq(syncRun.id, resumable.id))
      .returning();
    return { run, pending };
  }

  // started_at con el reloj de Node, el mismo que marca last_synced_at en
  // syncRepos: la reanudación compara ambas fechas.
  const [run] = await db
    .insert(syncRun)
    .values({ reposTotal: repos.length, startedAt: new Date() })
    .returning();
  return { run, pending: repos };
}

// Sincroniza los repos con GitHub dejando registro en sync_run. El avance se
// guarda después de cada lote: si el proceso se corta, relanzarlo retoma la
// misma ejecución sin reprocesar los repos ya actualizados.
//
// No controla ejecuciones simultáneas: el programador (OB-13) corre una por vez.
export async function runSync(
  db: Db,
  repos: RepoRef[],
  options: RunSyncOptions = {},
): Promise<SyncRun> {
  const { run, pending } = await startOrResume(db, repos);
  const { afterSync, ...syncOptions } = options;

  try {
    const results = await syncRepos(db, pending, {
      ...syncOptions,
      onBatch: async ({ results, rateLimit }) => {
        const ok = results.filter(({ status }) => status === 'ok').length;
        await db
          .update(syncRun)
          .set({
            reposOk: sql`${syncRun.reposOk} + ${ok}`,
            reposFailed: sql`${syncRun.reposFailed} + ${results.length - ok}`,
            rateLimitUsed: sql`${syncRun.rateLimitUsed} + ${rateLimit?.cost ?? 0}`,
            ...(rateLimit && {
              rateLimitRemaining: rateLimit.remaining,
              rateLimitResetAt: rateLimit.resetAt,
            }),
            updatedAt: sql`now()`,
          })
          .where(eq(syncRun.id, run.id));
      },
    });
    await afterSync?.(results);
  } catch (error) {
    await db
      .update(syncRun)
      .set({
        status: 'FAILED',
        error: errorMessage(error),
        finishedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(eq(syncRun.id, run.id));
    throw error;
  }

  const [finished] = await db
    .update(syncRun)
    .set({ status: 'COMPLETED', finishedAt: sql`now()`, updatedAt: sql`now()` })
    .where(eq(syncRun.id, run.id))
    .returning();
  return finished;
}
