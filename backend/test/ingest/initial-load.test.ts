import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import type { FetchRepoResult, RepoRef } from '../../src/ingest/github.js';
import {
  loadInitialInventory,
  parseInitialInventory,
  type InitialRepository,
} from '../../src/ingest/initial-load.js';

const fixture = (
  owner: string,
  name: string,
  category = 'auth',
  license = 'MIT',
): InitialRepository => ({
  owner,
  name,
  categories: [category],
  license,
});

describe('carga inicial del inventario', () => {
  it('lee la lista inicial real y normaliza la categoría de autenticación', async () => {
    const source = await readFile(new URL('../../../seed/repos.yaml', import.meta.url), 'utf8');
    const repositories = parseInitialInventory(source);

    expect(repositories).toHaveLength(136);
    expect(repositories[0]).toMatchObject({
      owner: 'keycloak',
      name: 'keycloak',
      categories: ['auth'],
      license: 'Apache-2.0',
    });
    expect(
      repositories.find(
        ({ owner, name }) =>
          owner.toLowerCase() === 'clickhouse' && name.toLowerCase() === 'clickhouse',
      ),
    ).toMatchObject({ categories: ['database', 'analytics'] });
  });

  it('rechaza identificadores inválidos y combina categorías de repositorios repetidos', () => {
    expect(() =>
      parseInitialInventory('repositories: [{ repo: invalid, categories: [ai], license: MIT }]'),
    ).toThrow(/Identificador inválido/);
    const repositories = parseInitialInventory(
      'repositories:\n  - repo: acme/tool\n    categories: [database]\n    license: MIT\n  - repo: ACME/TOOL\n    categories: [analytics]\n    license: MIT\n',
    );
    expect(repositories).toEqual([
      { owner: 'acme', name: 'tool', categories: ['database', 'analytics'], license: 'MIT' },
    ]);
  });

  it('normaliza la categoría de autenticación y exige una licencia', () => {
    expect(
      parseInitialInventory(
        'repositories:\n  - repo: acme/tool\n    category: Authentication\n    license: MIT\n',
      ),
    ).toEqual([{ owner: 'acme', name: 'tool', categories: ['auth'], license: 'MIT' }]);
    expect(() =>
      parseInitialInventory('repositories: [{ repo: acme/tool, categories: [ai] }]'),
    ).toThrow(/licencia válida/);
  });

  it('usa la licencia del inventario cuando GitHub devuelve NOASSERTION', async () => {
    const repositories = [fixture('acme', 'tool', 'database', 'Apache-2.0')];
    const persistRepository = vi.fn().mockResolvedValue(undefined);
    const report = await loadInitialInventory(repositories, {
      fetchBatch: vi.fn(async (batch: RepoRef[]) =>
        batch.map((request): FetchRepoResult => ({
          request,
          status: 'ok',
          renamed: false,
          repository: {
            githubId: 1,
            fullName: 'acme/tool',
            name: 'tool',
            url: 'https://github.com/acme/tool',
            licenseSpdx: 'NOASSERTION',
          },
        })),
      ),
      persistRepository,
      categoryIds: new Map([['database', 'category-database']]),
    });

    expect(report.loaded).toBe(1);
    expect(persistRepository).toHaveBeenCalledWith(
      expect.objectContaining({ licenseSpdx: 'Apache-2.0' }),
      ['category-database'],
    );
  });

  it('divide lotes fallidos y reporta solo los repositorios que siguen fallando', async () => {
    const repositories = [
      fixture('acme', 'one'),
      fixture('acme', 'two'),
      fixture('acme', 'three'),
      fixture('acme', 'four'),
    ];
    const fetchBatch = vi.fn(async (batch: RepoRef[]) => {
      if (batch.length > 1 && batch[0].name === 'one') {
        throw new Error('GitHub respondió 504');
      }
      if (batch.length === 1 && batch[0].name === 'one') {
        throw new Error('GitHub respondió 504');
      }
      return batch.map((repository): FetchRepoResult => ({
        request: repository,
        status: 'ok',
        renamed: false,
        repository: {
          githubId:
            repositories.findIndex(
              ({ owner, name }) => owner === repository.owner && name === repository.name,
            ) + 1,
          fullName: `${repository.owner}/${repository.name}`,
          name: repository.name,
          url: `https://github.com/${repository.owner}/${repository.name}`,
        },
      }));
    });
    const persistRepository = vi.fn().mockResolvedValue(undefined);

    const report = await loadInitialInventory(
      repositories,
      {
        fetchBatch,
        persistRepository,
        categoryIds: new Map([['auth', 'category-auth']]),
      },
      2,
    );

    expect(fetchBatch).toHaveBeenCalledTimes(4);
    expect(persistRepository).toHaveBeenCalledTimes(3);
    expect(report).toMatchObject({
      attempted: 4,
      loaded: 3,
      failed: 1,
      successRatePercent: 75,
      targetMet: false,
    });
    expect(report.failures.map(({ repo }) => repo)).toEqual(['acme/one']);
  });

  it('alcanza el umbral requerido cuando carga exactamente el 98 %', async () => {
    const repositories = Array.from({ length: 100 }, (_, index) =>
      fixture('acme', `repo-${index}`),
    );
    const fetchBatch = vi.fn(async (batch: RepoRef[]) =>
      batch.map((repository, index): FetchRepoResult =>
        repository.name === 'repo-99'
          ? { request: repository, status: 'not_found' }
          : repository.name === 'repo-98'
            ? { request: repository, status: 'not_found' }
            : {
                request: repository,
                status: 'ok',
                renamed: false,
                repository: {
                  githubId: index + 1,
                  fullName: `${repository.owner}/${repository.name}`,
                  name: repository.name,
                  url: `https://github.com/${repository.owner}/${repository.name}`,
                },
              },
      ),
    );

    const report = await loadInitialInventory(repositories, {
      fetchBatch,
      persistRepository: vi.fn().mockResolvedValue(undefined),
      categoryIds: new Map([['auth', 'category-auth']]),
    });

    expect(report).toMatchObject({
      attempted: 100,
      loaded: 98,
      failed: 2,
      successRatePercent: 98,
      targetMet: true,
    });
  });
});
