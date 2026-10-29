import { parse } from 'yaml';
import type { RepositoryInput } from '../db/repositories.js';
import type { FetchRepoResult, RepoRef } from './github.js';

const CATEGORY_ALIASES: Record<string, string> = {
  authentication: 'auth',
  auth: 'auth',
  database: 'database',
  payments: 'payments',
  ai: 'ai',
  analytics: 'analytics',
  search: 'search',
};

const TARGET_SUCCESS_RATE = 0.98;

export interface InitialRepository extends RepoRef {
  categories: string[];
}

export interface InitialLoadFailure {
  repo: string;
  categories: string[];
  reason: string;
}

export interface InitialLoadReport {
  attempted: number;
  loaded: number;
  failed: number;
  successRatePercent: number;
  targetMet: boolean;
  failures: InitialLoadFailure[];
}

export interface InitialLoadDependencies {
  fetchBatch: (repositories: RepoRef[]) => Promise<FetchRepoResult[]>;
  persistRepository: (repository: RepositoryInput, categoryIds: string[]) => Promise<void>;
  categoryIds: Map<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizedCategory(category: string): string {
  return CATEGORY_ALIASES[category.toLowerCase()] ?? category.toLowerCase();
}

export function parseInitialInventory(source: string): InitialRepository[] {
  const document: unknown = parse(source);
  if (!isRecord(document) || !Array.isArray(document.repositories)) {
    throw new Error('La lista inicial debe contener un arreglo "repositories"');
  }

  const repositories = new Map<string, InitialRepository>();
  document.repositories.forEach((entry, index) => {
    if (!isRecord(entry) || typeof entry.repo !== 'string' || typeof entry.category !== 'string') {
      throw new Error(`El repositorio en la posición ${index + 1} debe incluir repo y category`);
    }

    const [owner, name, extra] = entry.repo.trim().split('/');
    if (!owner || !name || extra !== undefined) {
      throw new Error(`Identificador inválido para el repositorio en la posición ${index + 1}`);
    }

    const key = `${owner}/${name}`.toLowerCase();
    const category = normalizedCategory(entry.category);
    const existing = repositories.get(key);
    if (existing) {
      if (!existing.categories.includes(category)) existing.categories.push(category);
      return;
    }

    repositories.set(key, { owner, name, categories: [category] });
  });
  return [...repositories.values()];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function repositoryKey(repository: RepoRef): string {
  return `${repository.owner}/${repository.name}`.toLowerCase();
}

export async function loadInitialInventory(
  repositories: InitialRepository[],
  dependencies: InitialLoadDependencies,
  batchSize = 50,
): Promise<InitialLoadReport> {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
    throw new Error('batchSize debe ser un entero entre 1 y 100');
  }

  const failures: InitialLoadFailure[] = [];
  let loaded = 0;

  for (let start = 0; start < repositories.length; start += batchSize) {
    const batch = repositories.slice(start, start + batchSize);
    let results: FetchRepoResult[];
    try {
      results = await dependencies.fetchBatch(batch);
    } catch (error) {
      for (const repository of batch) {
        failures.push({
          repo: `${repository.owner}/${repository.name}`,
          categories: repository.categories,
          reason: errorMessage(error),
        });
      }
      continue;
    }

    const resultsByRepo = new Map(results.map((result) => [repositoryKey(result.request), result]));
    for (const repository of batch) {
      const repo = `${repository.owner}/${repository.name}`;
      const result = resultsByRepo.get(repositoryKey(repository));
      if (!result) {
        failures.push({
          repo,
          categories: repository.categories,
          reason: 'GitHub no devolvió resultado',
        });
        continue;
      }
      if (result.status !== 'ok') {
        failures.push({
          repo,
          categories: repository.categories,
          reason:
            result.status === 'not_found' ? 'Repositorio no encontrado en GitHub' : result.error,
        });
        continue;
      }

      const categoryIds: string[] = [];
      let missingCategory: string | undefined;
      for (const slug of repository.categories) {
        const categoryId = dependencies.categoryIds.get(slug);
        if (!categoryId) {
          missingCategory = slug;
          break;
        }
        categoryIds.push(categoryId);
      }
      if (missingCategory) {
        failures.push({
          repo,
          categories: repository.categories,
          reason: `No existe la categoría "${missingCategory}" en la base de datos`,
        });
        continue;
      }

      try {
        await dependencies.persistRepository(result.repository, categoryIds);
        loaded += 1;
      } catch (error) {
        failures.push({ repo, categories: repository.categories, reason: errorMessage(error) });
      }
    }
  }

  const successRate = repositories.length === 0 ? 0 : loaded / repositories.length;
  return {
    attempted: repositories.length,
    loaded,
    failed: failures.length,
    successRatePercent: Number((successRate * 100).toFixed(2)),
    targetMet: successRate >= TARGET_SUCCESS_RATE,
    failures,
  };
}
