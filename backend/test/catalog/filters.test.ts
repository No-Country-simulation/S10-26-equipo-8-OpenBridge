import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { upsertRepository } from '../../src/db/repositories.js';
import { category, type maintenanceLevel } from '../../src/db/schema.js';
import { seedCategories } from '../../src/db/seed.js';
import { createTestDb, type TestDb } from '../helpers/test-db.js';

type Level = (typeof maintenanceLevel.enumValues)[number];

describe('filtros y búsqueda por texto del catálogo', () => {
  let t: TestDb;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    t = await createTestDb();
    app = createApp({ db: t.db });
    await seedCategories(t.db);
    const categories = await t.db.select().from(category);
    const idOf = (slug: string) => categories.find((c) => c.slug === slug)!.id;

    // [nombre, categoría, lenguaje, licencia, estrellas, salud, nivel, último commit, descripción, temas]
    const repos: Array<
      [
        string,
        string,
        string,
        string,
        number,
        number | null,
        Level | null,
        string,
        string,
        string[],
      ]
    > = [
      [
        'meilisearch',
        'search',
        'Rust',
        'MIT',
        50_000,
        98,
        'ACTIVE',
        '2026-11-01',
        'A lightning-fast search engine',
        ['search-engine'],
      ],
      [
        'typesense',
        'search',
        'C++',
        'GPL-3.0',
        27_000,
        99,
        'ACTIVE',
        '2026-10-20',
        'Open source alternative to Algolia',
        ['search'],
      ],
      [
        'sonic',
        'search',
        'Rust',
        'MPL-2.0',
        20_000,
        80,
        'MODERATE',
        '2026-09-01',
        'Fast, lightweight schema-less backend',
        [],
      ],
      [
        'keycloak',
        'auth',
        'Java',
        'Apache-2.0',
        37_000,
        97,
        'ACTIVE',
        '2026-11-03',
        'Identity and access management',
        ['sso', 'oidc'],
      ],
      [
        'authlib',
        'auth',
        'Python',
        'BSD-3-Clause',
        4_000,
        70,
        'MODERATE',
        '2026-11-05',
        'The ultimate Python library in building OAuth servers',
        ['oauth2'],
      ],
      [
        'fastapi-users',
        'auth',
        'Python',
        'MIT',
        5_000,
        60,
        'AT_RISK',
        '2025-12-01',
        'Ready-to-use user management for FastAPI',
        ['fastapi'],
      ],
      [
        'pay-py',
        'payments',
        'Python',
        'MIT',
        3_000,
        null,
        null,
        '2026-10-30',
        'Payments for Django',
        ['stripe'],
      ],
    ];
    for (const [
      index,
      [name, slug, language, license, stars, health, level, commit, description, topics],
    ] of repos.entries()) {
      await upsertRepository(
        t.db,
        {
          githubId: index + 1,
          fullName: `acme/${name}`,
          name,
          url: `https://github.com/acme/${name}`,
          description,
          topics,
          primaryLanguage: language,
          licenseSpdx: license,
          stars,
          healthScore: health,
          maintenanceLevel: level,
          lastCommitAt: new Date(`${commit}T00:00:00Z`),
        },
        [idOf(slug)],
      );
    }
  });

  afterAll(async () => {
    await t?.close();
  });

  const list = (query: string) => request(app).get(`/api/v1/repositories?${query}`);
  const names = (res: request.Response) => res.body.data.map(({ name }: { name: string }) => name);

  describe('filtros por lenguaje, licencia y categoría', () => {
    it('con "Python" y "MIT", todos los resultados cumplen ambos', async () => {
      const res = await list('language=Python&license=MIT');

      expect(res.status).toBe(200);
      expect(names(res).sort()).toEqual(['fastapi-users', 'pay-py']);
      expect(res.body.meta.total).toBe(2);
    });

    it('no distingue mayúsculas en lenguaje y licencia', async () => {
      const res = await list('language=python&license=mit');

      expect(names(res).sort()).toEqual(['fastapi-users', 'pay-py']);
    });

    it('combina categoría con lenguaje', async () => {
      const res = await list('category=auth&language=Python');

      expect(names(res)).toEqual(['authlib', 'fastapi-users']);
    });

    it('devuelve una página vacía si nada cumple los filtros', async () => {
      const res = await list('language=Haskell');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: [], meta: { page: 1, size: 20, total: 0, totalPages: 0 } });
    });
  });

  describe('búsqueda por texto (q)', () => {
    it('"motor de búsqueda" trae primero a Meilisearch y Typesense', async () => {
      const res = await list(`q=${encodeURIComponent('motor de búsqueda')}`);

      expect(res.status).toBe(200);
      expect(names(res).slice(0, 2)).toEqual(['meilisearch', 'typesense']);
    });

    it('busca en nombre, descripción y temas', async () => {
      expect(names(await list('q=keycloak'))[0]).toBe('keycloak');
      expect(names(await list('q=algolia'))).toEqual(['typesense']);
      expect(names(await list('q=oidc'))).toEqual(['keycloak']);
    });

    it('encuentra coincidencias parciales del nombre', async () => {
      expect(names(await list('q=meili'))).toEqual(['meilisearch']);
    });

    it('se combina con los filtros', async () => {
      const res = await list(`q=${encodeURIComponent('motor de búsqueda')}&language=Rust`);

      expect(names(res)).toEqual(['meilisearch', 'sonic']);
    });

    it('sin coincidencias devuelve una página vacía', async () => {
      const res = await list('q=blockchain');

      expect(res.status).toBe(200);
      expect(res.body.meta.total).toBe(0);
    });

    it('rechaza un término de menos de 2 caracteres', async () => {
      const res = await list('q=a');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_QUERY');
    });
  });

  describe('orden', () => {
    it('por defecto ordena por salud (typesense 99 antes que meilisearch 98)', async () => {
      expect(names(await list('category=search'))).toEqual(['typesense', 'meilisearch', 'sonic']);
    });

    it('ordena por estrellas', async () => {
      const res = await list('category=search&sort=stars');

      expect(names(res)).toEqual(['meilisearch', 'typesense', 'sonic']);
    });

    it('ordena por actividad reciente', async () => {
      const res = await list('category=auth&sort=updated');

      expect(names(res)).toEqual(['authlib', 'keycloak', 'fastapi-users']);
    });

    it('rechaza ordenar por relevancia sin texto de búsqueda', async () => {
      const res = await list('sort=relevance');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_QUERY');
    });

    it('rechaza un orden desconocido', async () => {
      expect((await list('sort=random')).status).toBe(400);
    });
  });

  describe('GET /api/v1/filters', () => {
    it('devuelve las opciones a partir de los datos reales, con su cantidad', async () => {
      const res = await request(app).get('/api/v1/filters');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        languages: [
          { value: 'Python', count: 3 },
          { value: 'Rust', count: 2 },
          { value: 'C++', count: 1 },
          { value: 'Java', count: 1 },
        ],
        licenses: [
          { value: 'MIT', count: 3 },
          { value: 'Apache-2.0', count: 1 },
          { value: 'BSD-3-Clause', count: 1 },
          { value: 'GPL-3.0', count: 1 },
          { value: 'MPL-2.0', count: 1 },
        ],
        // Solo las categorías con repositorios.
        categories: [
          { value: 'auth', label: 'Autenticación', count: 3 },
          { value: 'search', label: 'Búsqueda', count: 3 },
          { value: 'payments', label: 'Pagos', count: 1 },
        ],
        maintenanceLevels: [
          { value: 'ACTIVE', count: 3 },
          { value: 'MODERATE', count: 2 },
          { value: 'AT_RISK', count: 1 },
        ],
        stars: { min: 3_000, max: 50_000 },
      });
    });

    it('con el catálogo vacío devuelve listas vacías', async () => {
      const empty = await createTestDb();
      try {
        const res = await request(createApp({ db: empty.db })).get('/api/v1/filters');

        expect(res.body).toEqual({
          languages: [],
          licenses: [],
          categories: [],
          maintenanceLevels: [],
          stars: { min: 0, max: 0 },
        });
      } finally {
        await empty.close();
      }
    });
  });
});
