import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { BASE_CATEGORIES } from '../../src/db/seed.js';

interface SeedRepo {
  repo: string;
  categories: string[];
  license: string;
  description: string;
}

interface SeedFile {
  categories: string[];
  repositories: SeedRepo[];
}

// Licencias OSI que hoy usa la lista. Sumar una nueva acá obliga a revisarla en el PR.
const OSI_LICENSES = [
  'Apache-2.0',
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'MPL-2.0',
  'PostgreSQL',
  'GPL-2.0',
  'GPL-3.0',
  'AGPL-3.0',
];

const seed = parse(
  readFileSync(new URL('../../../seed/repos.yaml', import.meta.url), 'utf-8'),
) as SeedFile;
const repos = seed.repositories;
const slugs = BASE_CATEGORIES.map((c) => c.slug);

describe('lista semilla de repositorios (seed/repos.yaml)', () => {
  it('tiene 100 repositorios o más', () => {
    expect(repos.length).toBeGreaterThanOrEqual(100);
  });

  it('usa los mismos slugs de categoría que la base', () => {
    expect([...seed.categories].sort()).toEqual([...slugs].sort());
    const used = new Set(repos.flatMap((r) => r.categories));
    expect([...used].filter((slug) => !slugs.includes(slug))).toEqual([]);
  });

  it.each(slugs)('tiene al menos 10 repositorios en %s', (slug) => {
    expect(repos.filter((r) => r.categories.includes(slug)).length).toBeGreaterThanOrEqual(10);
  });

  it('no repite repositorios (GitHub no distingue mayúsculas)', () => {
    const names = repos.map((r) => r.repo.toLowerCase());
    expect(names.filter((name, i) => names.indexOf(name) !== i)).toEqual([]);
  });

  it('cada repo tiene owner/name, al menos una categoría y descripción', () => {
    const invalid = repos.filter(
      (r) =>
        !/^[\w.-]+\/[\w.-]+$/.test(r.repo) ||
        !Array.isArray(r.categories) ||
        r.categories.length === 0 ||
        !r.description?.trim(),
    );
    expect(invalid.map((r) => r.repo)).toEqual([]);
  });

  it('solo incluye licencias aprobadas por la OSI', () => {
    const invalid = repos.filter((r) => !OSI_LICENSES.includes(r.license));
    expect(invalid.map((r) => `${r.repo}: ${r.license}`)).toEqual([]);
  });

  it('incluye los repositorios del documento original', () => {
    const names = repos.map((r) => r.repo.toLowerCase());
    expect(names).toEqual(
      expect.arrayContaining([
        'keycloak/keycloak',
        'nextauthjs/next-auth',
        'supabase/supabase',
        'postgres/postgres',
        'ollama/ollama',
        'langchain-ai/langchain',
        'meilisearch/meilisearch',
        'typesense/typesense',
      ]),
    );
  });
});
