import type { Db } from '../db/client.js';
import { upsertRepository, type RepositoryInput } from '../db/repositories.js';
import { calculateHealthScore, getRecentCommitCutoff } from './health.js';

export interface RepoRef {
  owner: string;
  name: string;
}

interface GraphQLError {
  message: string;
  path?: Array<string | number>;
  type?: string;
  extensions?: { type?: string };
}

interface GithubRepository {
  databaseId: number;
  nameWithOwner: string;
  url: string;
  description: string | null;
  homepageUrl: string | null;
  primaryLanguage: { name: string } | null;
  stargazerCount: number;
  forkCount: number;
  issues: { totalCount: number };
  closedIssues: { totalCount: number };
  mentionableUsers: { nodes: Array<{ login: string }> };
  isArchived: boolean;
  repositoryTopics: { nodes: Array<{ topic: { name: string } }> };
  licenseInfo: { spdxId: string | null } | null;
  defaultBranchRef: {
    target: {
      committedDate: string;
      history: {
        totalCount: number;
        nodes: Array<{ author: { user: { login: string } | null } | null }>;
      };
    } | null;
  } | null;
  latestRelease: { publishedAt: string } | null;
}

interface GraphQLResponse {
  data?: Record<string, unknown>;
  errors?: GraphQLError[];
}

// Lo que informa GitHub en cada query: cuántos puntos costó, cuántos quedan
// y cuándo se renueva el saldo.
export interface RateLimit {
  cost: number;
  remaining: number;
  resetAt: Date;
}

export interface Batch<T> {
  results: T[];
  rateLimit: RateLimit | null;
}

export type FetchRepoResult =
  | {
      request: RepoRef;
      status: 'ok';
      renamed: boolean;
      repository: RepositoryInput;
    }
  | { request: RepoRef; status: 'not_found' }
  | { request: RepoRef; status: 'error'; error: string };

export type SyncRepoResult =
  | (Extract<FetchRepoResult, { status: 'ok' }> & { savedId: string })
  | Exclude<FetchRepoResult, { status: 'ok' }>;

export interface GithubClientOptions {
  // Si no se pasa, se lee de GITHUB_TOKEN. Nunca se incluye en logs ni errores.
  token?: string;
  // Repos por query (uno por alias). GitHub limita el costo de cada query.
  batchSize?: number;
  // Si el saldo del límite baja de este número, se espera a resetAt antes
  // del próximo lote.
  rateLimitThreshold?: number;
  // Espera antes del primer reintento; se duplica en cada intento.
  retryDelayMs?: number;
  // Se llama al terminar cada lote, para guardar el avance sobre la marcha.
  onBatch?: (batch: Batch<FetchRepoResult>) => Promise<void> | void;
  // Inyectable para no esperar de verdad en los tests.
  sleep?: (ms: number) => Promise<void>;
}

const GITHUB_GRAPHQL = 'https://api.github.com/graphql';
const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 100;
const DEFAULT_RATE_LIMIT_THRESHOLD = 200;
const DEFAULT_RETRY_DELAY_MS = 1000;
const MAX_ATTEMPTS = 3;

// Margen después de resetAt por si nuestro reloj y el de GitHub no coinciden.
const RESET_MARGIN_MS = 1000;
// Si GitHub limita sin decir hasta cuándo.
const RATE_LIMIT_FALLBACK_WAIT_MS = 60_000;

// Error transitorio de GitHub (5xx o de red): vale la pena reintentar.
class RetryableError extends Error {}

// GitHub limitó las solicitudes: se reintenta después de waitMs.
class RateLimitedError extends RetryableError {
  readonly waitMs: number;

  constructor(message: string, waitMs: number) {
    super(message);
    this.waitMs = waitMs;
  }
}

function rateLimitWait(headers: Headers): number {
  const retryAfter = Number(headers.get('retry-after'));
  if (retryAfter > 0) return retryAfter * 1000;
  const reset = Number(headers.get('x-ratelimit-reset'));
  if (reset > 0) return Math.max(0, reset * 1000 - Date.now()) + RESET_MARGIN_MS;
  return RATE_LIMIT_FALLBACK_WAIT_MS;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function readGithubToken(): string {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) throw new Error('Falta la variable de entorno GITHUB_TOKEN');
  return token;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}

function buildQuery(repos: RepoRef[], now: Date): string {
  const since = JSON.stringify(getRecentCommitCutoff(now).toISOString());
  const fields = repos
    .map(
      (repo, index) => `
  r${index}: repository(owner: ${JSON.stringify(repo.owner)}, name: ${JSON.stringify(repo.name)}) {
    databaseId
    nameWithOwner
    url
    description
    homepageUrl
    primaryLanguage { name }
    stargazerCount
    forkCount
    issues(states: OPEN) { totalCount }
    closedIssues: issues(states: CLOSED) { totalCount }
    mentionableUsers(first: 100) { nodes { login } }
    isArchived
    repositoryTopics(first: 100) { nodes { topic { name } } }
    licenseInfo { spdxId }
    defaultBranchRef {
      target {
        ... on Commit {
          committedDate
          history(since: ${since}, first: 100) {
            totalCount
            nodes { author { user { login } } }
          }
        }
      }
    }
    latestRelease { publishedAt }
  }`,
    )
    .join('\n');

  return `query {${fields}\n  rateLimit { cost remaining resetAt }\n}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isGraphQLError(value: unknown): value is GraphQLError {
  return isRecord(value) && typeof value.message === 'string';
}

function isGithubRepository(value: unknown): value is GithubRepository {
  if (!isRecord(value)) return false;
  return (
    typeof value.databaseId === 'number' &&
    typeof value.nameWithOwner === 'string' &&
    typeof value.url === 'string' &&
    typeof value.stargazerCount === 'number' &&
    typeof value.forkCount === 'number' &&
    isRecord(value.issues) &&
    typeof value.issues.totalCount === 'number' &&
    isRecord(value.closedIssues) &&
    typeof value.closedIssues.totalCount === 'number' &&
    isRecord(value.mentionableUsers) &&
    Array.isArray(value.mentionableUsers.nodes) &&
    value.mentionableUsers.nodes.every(
      (user) => isRecord(user) && typeof user.login === 'string',
    ) &&
    typeof value.isArchived === 'boolean' &&
    isRecord(value.repositoryTopics) &&
    Array.isArray(value.repositoryTopics.nodes)
  );
}

function isGraphQLResponse(value: unknown): value is GraphQLResponse {
  if (!isRecord(value)) return false;
  if (value.data !== undefined && !isRecord(value.data)) return false;
  if (
    value.errors !== undefined &&
    (!Array.isArray(value.errors) || !value.errors.every(isGraphQLError))
  ) {
    return false;
  }
  return value.data !== undefined || value.errors !== undefined;
}

function parseRateLimit(value: unknown): RateLimit | null {
  if (
    !isRecord(value) ||
    typeof value.cost !== 'number' ||
    typeof value.remaining !== 'number' ||
    typeof value.resetAt !== 'string'
  ) {
    return null;
  }
  const resetAt = new Date(value.resetAt);
  if (Number.isNaN(resetAt.getTime())) return null;
  return { cost: value.cost, remaining: value.remaining, resetAt };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function mapRepository(node: GithubRepository, now: Date): RepositoryInput {
  const recentCommits = node.defaultBranchRef?.target?.history;
  const lastCommitAt = node.defaultBranchRef?.target?.committedDate
    ? new Date(node.defaultBranchRef.target.committedDate)
    : null;
  const lastReleaseAt = node.latestRelease?.publishedAt
    ? new Date(node.latestRelease.publishedAt)
    : null;
  const activeContributorLogins = new Set(
    (recentCommits?.nodes ?? [])
      .map((commit) => commit.author?.user?.login)
      .filter((login): login is string => typeof login === 'string'),
  );
  const owner = node.nameWithOwner.slice(0, node.nameWithOwner.indexOf('/'));
  const archived = node.isArchived;
  const mentionableLogins = new Set(
    node.mentionableUsers.nodes.map(({ login }) => login.toLowerCase()),
  );
  const hasMaintainerCommitInPast90Days = [...activeContributorLogins].some(
    (login) =>
      login.toLowerCase() === owner.toLowerCase() || mentionableLogins.has(login.toLowerCase()),
  );
  const { healthScore, maintenanceLevel, activeMaintainer } = calculateHealthScore(
    {
      lastCommitAt,
      recentCommitCount: recentCommits?.totalCount ?? 0,
      openIssues: node.issues.totalCount,
      closedIssues: node.closedIssues.totalCount,
      stars: node.stargazerCount,
      lastReleaseAt,
      activeContributors: activeContributorLogins.size,
      archived,
      hasMaintainerCommitInPast90Days,
    },
    now,
  );

  return {
    githubId: node.databaseId,
    fullName: node.nameWithOwner,
    name: node.nameWithOwner.slice(node.nameWithOwner.indexOf('/') + 1),
    url: node.url,
    description: node.description,
    homepage: node.homepageUrl,
    primaryLanguage: node.primaryLanguage?.name ?? null,
    licenseSpdx: node.licenseInfo?.spdxId ?? null,
    stars: node.stargazerCount,
    forks: node.forkCount,
    openIssues: node.issues.totalCount,
    lastCommitAt,
    lastReleaseAt,
    archived,
    topics: node.repositoryTopics.nodes.map(({ topic }) => topic.name),
    activeMaintainer,
    healthScore,
    maintenanceLevel,
  };
}

async function requestGithub(query: string, token: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(GITHUB_GRAPHQL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });
  } catch (error) {
    throw new RetryableError(`No se pudo conectar con GitHub: ${errorMessage(error)}`);
  }
  if (response.status >= 500) throw new RetryableError(`GitHub respondió ${response.status}`);
  // Límite secundario (demasiadas solicitudes seguidas) o primario agotado.
  if (
    response.status === 429 ||
    (response.status === 403 &&
      (response.headers.has('retry-after') ||
        response.headers.get('x-ratelimit-remaining') === '0'))
  ) {
    throw new RateLimitedError(
      `GitHub limitó las solicitudes (${response.status})`,
      rateLimitWait(response.headers),
    );
  }
  // Cualquier otro 4xx (token inválido, sin permisos) no se arregla reintentando: corta todo.
  if (!response.ok) throw new Error(`GitHub respondió ${response.status}`);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    // Respuesta cortada a mitad de camino: es un error de red más.
    throw new RetryableError(`GitHub devolvió una respuesta ilegible: ${errorMessage(error)}`);
  }
  // Con el límite agotado, GraphQL responde 200 con un error RATE_LIMITED.
  if (
    isRecord(payload) &&
    Array.isArray(payload.errors) &&
    payload.errors.some(
      (error) =>
        isRecord(error) &&
        (error.type === 'RATE_LIMITED' ||
          (isRecord(error.extensions) && error.extensions.type === 'RATE_LIMITED')),
    )
  ) {
    throw new RateLimitedError(
      'GitHub agotó el límite de solicitudes',
      rateLimitWait(response.headers),
    );
  }
  return payload;
}

type RetryOptions = { retryDelayMs: number; sleep: (ms: number) => Promise<void> };

async function fetchRepoBatch(
  repos: RepoRef[],
  token: string,
  { retryDelayMs, sleep }: RetryOptions,
): Promise<Batch<FetchRepoResult>> {
  const now = new Date();
  const query = buildQuery(repos, now);

  let payload: unknown;
  for (let attempt = 1; ; attempt++) {
    try {
      payload = await requestGithub(query, token);
      break;
    } catch (error) {
      if (!(error instanceof RetryableError)) throw error;
      if (attempt === MAX_ATTEMPTS) {
        return {
          results: repos.map((request) => ({ request, status: 'error', error: error.message })),
          rateLimit: null,
        };
      }
      await sleep(
        error instanceof RateLimitedError ? error.waitMs : retryDelayMs * 2 ** (attempt - 1),
      );
    }
  }

  if (!isGraphQLResponse(payload)) {
    throw new Error('GitHub devolvió una respuesta GraphQL inválida');
  }

  const errorsByAlias = new Map<string, GraphQLError[]>();
  for (const error of payload.errors ?? []) {
    const alias = error.path?.[0];
    if (typeof alias !== 'string' || !/^r\d+$/.test(alias)) {
      throw new Error(`Error GraphQL de GitHub sin alias de repositorio: ${error.message}`);
    }
    if (!errorsByAlias.has(alias)) errorsByAlias.set(alias, []);
    errorsByAlias.get(alias)?.push(error);
  }

  const results = repos.map((request, index): FetchRepoResult => {
    const alias = `r${index}`;
    const aliasErrors = errorsByAlias.get(alias) ?? [];
    const notFound = aliasErrors.some(
      (error) => error.type === 'NOT_FOUND' || error.extensions?.type === 'NOT_FOUND',
    );
    if (notFound || payload.data?.[alias] === null || payload.data?.[alias] === undefined) {
      return { request, status: 'not_found' };
    }
    if (aliasErrors.length > 0) {
      return {
        request,
        status: 'error',
        error: aliasErrors.map((error) => error.message).join('; '),
      };
    }

    const node: unknown = payload.data[alias];
    if (!isGithubRepository(node)) {
      return {
        request,
        status: 'error',
        error: 'GitHub devolvió datos incompletos para el repositorio',
      };
    }

    const requestedName = `${request.owner}/${request.name}`;
    return {
      request,
      status: 'ok',
      renamed: node.nameWithOwner.toLowerCase() !== requestedName.toLowerCase(),
      repository: mapRepository(node, now),
    };
  });

  return { results, rateLimit: parseRateLimit(payload.data?.rateLimit) };
}

// Trae los repos en lotes secuenciales: una query GraphQL por lote. Si el
// saldo del límite queda bajo, espera a que GitHub lo renueve antes de seguir.
export async function fetchRepos(
  repos: RepoRef[],
  {
    token,
    batchSize = DEFAULT_BATCH_SIZE,
    rateLimitThreshold = DEFAULT_RATE_LIMIT_THRESHOLD,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    onBatch,
    sleep = wait,
  }: GithubClientOptions = {},
): Promise<FetchRepoResult[]> {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
    throw new Error(`batchSize debe ser un entero entre 1 y ${MAX_BATCH_SIZE}`);
  }
  if (repos.length === 0) return [];

  const resolvedToken = token ?? readGithubToken();
  const results: FetchRepoResult[] = [];
  let rateLimit: RateLimit | null = null;
  for (const batch of chunk(repos, batchSize)) {
    if (rateLimit && rateLimit.remaining < rateLimitThreshold) {
      await sleep(Math.max(0, rateLimit.resetAt.getTime() - Date.now()) + RESET_MARGIN_MS);
    }
    const fetched = await fetchRepoBatch(batch, resolvedToken, { retryDelayMs, sleep });
    // Un lote fallido no informa saldo: se conserva el último conocido.
    rateLimit = fetched.rateLimit ?? rateLimit;
    results.push(...fetched.results);
    await onBatch?.(fetched);
  }
  return results;
}

export type SyncReposOptions = Omit<GithubClientOptions, 'onBatch'> & {
  categoryIds?: string[];
  onBatch?: (batch: Batch<SyncRepoResult>) => Promise<void> | void;
};

// Guarda cada lote apenas llega, así lo ya traído no se pierde si el proceso
// se corta. categoryIds reemplaza las categorías de cada repo guardado; si no
// se pasa, se conservan las que ya tenía (ver upsertRepository).
export async function syncRepos(
  db: Db,
  repos: RepoRef[],
  { categoryIds, onBatch, ...options }: SyncReposOptions = {},
): Promise<SyncRepoResult[]> {
  const results: SyncRepoResult[] = [];

  await fetchRepos(repos, {
    ...options,
    onBatch: async ({ results: fetched, rateLimit }) => {
      const synced: SyncRepoResult[] = [];
      for (const result of fetched) {
        if (result.status !== 'ok') {
          synced.push(result);
          continue;
        }

        try {
          const saved = await upsertRepository(
            db,
            { ...result.repository, lastSyncedAt: new Date() },
            categoryIds,
          );
          synced.push({ ...result, savedId: saved.id });
        } catch (error) {
          synced.push({ request: result.request, status: 'error', error: errorMessage(error) });
        }
      }
      results.push(...synced);
      await onBatch?.({ results: synced, rateLimit });
    },
  });

  return results;
}
