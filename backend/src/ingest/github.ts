import type { Db } from '../db/client.js';
import { upsertRepository, type RepositoryInput } from '../db/repositories.js';

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
  isArchived: boolean;
  repositoryTopics: { nodes: Array<{ topic: { name: string } }> };
  licenseInfo: { spdxId: string | null } | null;
  defaultBranchRef: { target: { committedDate: string } | null } | null;
  latestRelease: { publishedAt: string } | null;
}

interface GraphQLResponse {
  data?: Record<string, GithubRepository | null>;
  errors?: GraphQLError[];
}

export type FetchRepoResult =
  | {
      request: RepoRef;
      status: 'ok';
      renamed: boolean;
      repository: Omit<RepositoryInput, 'categoryId'>;
    }
  | { request: RepoRef; status: 'not_found' }
  | { request: RepoRef; status: 'error'; error: string };

export type SyncRepoResult =
  | (Extract<FetchRepoResult, { status: 'ok' }> & { savedId: string })
  | Exclude<FetchRepoResult, { status: 'ok' }>;

const GITHUB_GRAPHQL = 'https://api.github.com/graphql';

function buildQuery(repos: RepoRef[]): string {
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
    isArchived
    repositoryTopics(first: 100) { nodes { topic { name } } }
    licenseInfo { spdxId }
    defaultBranchRef { target { ... on Commit { committedDate } } }
    latestRelease { publishedAt }
  }`,
    )
    .join('\n');

  return `query {${fields}\n}`;
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function mapRepository(node: GithubRepository): Omit<RepositoryInput, 'categoryId'> {
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
    lastCommitAt: node.defaultBranchRef?.target?.committedDate
      ? new Date(node.defaultBranchRef.target.committedDate)
      : null,
    lastReleaseAt: node.latestRelease?.publishedAt
      ? new Date(node.latestRelease.publishedAt)
      : null,
    archived: node.isArchived,
    topics: node.repositoryTopics.nodes.map(({ topic }) => topic.name),
  };
}

export async function fetchRepoBatch(repos: RepoRef[], token: string): Promise<FetchRepoResult[]> {
  if (repos.length === 0) return [];

  const response = await fetch(GITHUB_GRAPHQL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: buildQuery(repos) }),
  });
  if (!response.ok) throw new Error(`GitHub respondió ${response.status}`);

  const payload: unknown = await response.json();
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

  return repos.map((request, index) => {
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
      repository: mapRepository(node),
    };
  });
}

export async function syncRepoBatch(
  db: Db,
  repos: RepoRef[],
  token: string,
  categoryId: string,
): Promise<SyncRepoResult[]> {
  const fetched = await fetchRepoBatch(repos, token);
  const results: SyncRepoResult[] = [];

  for (const result of fetched) {
    if (result.status !== 'ok') {
      results.push(result);
      continue;
    }

    try {
      const saved = await upsertRepository(db, { ...result.repository, categoryId });
      results.push({ ...result, savedId: saved.id });
    } catch (error) {
      results.push({ request: result.request, status: 'error', error: errorMessage(error) });
    }
  }

  return results;
}
