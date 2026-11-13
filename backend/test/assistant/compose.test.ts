import { describe, expect, it } from 'vitest';
import {
  composeProposal,
  NO_MATURE_OPTION,
  type ComposerCandidate,
  type ComposerCapability,
  type HydratedRepository,
} from '../../src/assistant/compose.js';
import { proposalSchema } from '../../src/assistant/schema.js';

const repo = (
  id: string,
  healthScore: number | null,
  extra: Partial<HydratedRepository> = {},
): HydratedRepository => ({
  id,
  fullName: `acme/${id}`,
  healthScore,
  licenseSpdx: 'MIT',
  stars: 1200,
  ideas: [],
  ...extra,
});

// Por defecto todos los candidatos son igual de parecidos a la consulta: así
// los tests que no miran el ranking no dependen de la similitud.
const DEFAULT_SIMILARITY = 0.8;

const capability = (
  key: string,
  candidates: Array<string | ComposerCandidate>,
  extra: Partial<ComposerCapability> = {},
): ComposerCapability => ({
  key,
  name: key.toUpperCase(),
  reason: `El negocio necesita ${key}.`,
  integrationType: 'REST_API',
  dependsOn: [],
  candidates: candidates.map((candidate) =>
    typeof candidate === 'string' ? { id: candidate, similarity: DEFAULT_SIMILARITY } : candidate,
  ),
  ...extra,
});

const FIXED = { id: '00000000-0000-4000-8000-000000000000', now: new Date('2026-11-11T12:00:00Z') };

const compose = (
  capabilities: ComposerCapability[],
  repositories: HydratedRepository[],
  constraints: { minHealth?: number; licenses?: string[]; exclude?: string[] } = {},
) => composeProposal(capabilities, repositories, constraints, FIXED);

describe('composeProposal', () => {
  it('arma una propuesta con la forma del contrato', () => {
    const proposal = compose([capability('auth', ['a'])], [repo('a', 90)]);

    expect(proposalSchema.parse(proposal)).toEqual(proposal);
    expect(proposal).toMatchObject({
      id: FIXED.id,
      createdAt: '2026-11-11T12:00:00.000Z',
      cached: false,
      capabilities: [{ key: 'auth', name: 'AUTH', reason: 'El negocio necesita auth.' }],
    });
    // Solo key, name y reason: lo interno (consulta, candidatos…) no sale.
    expect(Object.keys(proposal.capabilities[0])).toEqual(['key', 'name', 'reason']);
  });

  it('a igual similitud y estrellas, elige el elegible más sano y el siguiente como alternativa', () => {
    const proposal = compose(
      [capability('auth', ['low', 'a', 'b', 'c'])],
      [repo('low', 30), repo('a', 60), repo('b', 95), repo('c', 80)],
    );

    expect(proposal.components).toEqual([
      {
        capability: 'auth',
        repository: { id: 'b', fullName: 'acme/b', healthScore: 95, licenseSpdx: 'MIT' },
        justification: expect.any(String),
        integrationType: 'REST_API',
        alternative: { id: 'c', fullName: 'acme/c' },
      },
    ]);
    expect(proposal.gaps).toEqual([]);
  });

  it('omite la alternativa si no hay otro candidato elegible', () => {
    const proposal = compose([capability('auth', ['a', 'b'])], [repo('a', 90), repo('b', 10)]);

    expect(proposal.components[0]).not.toHaveProperty('alternative');
  });

  it('exige salud de al menos max(40, minHealth); sin puntaje no es elegible', () => {
    const repos = [repo('none', null), repo('h40', 40), repo('h39', 39), repo('h70', 70)];

    const base = compose([capability('auth', ['none', 'h39', 'h40'])], repos);
    expect(base.components[0].repository.id).toBe('h40');
    expect(base.components[0]).not.toHaveProperty('alternative');

    const lowMin = compose([capability('auth', ['h39', 'h40'])], repos, { minHealth: 10 });
    expect(lowMin.components[0].repository.id).toBe('h40');

    const highMin = compose([capability('auth', ['h40', 'h70'])], repos, { minHealth: 65 });
    expect(highMin.components[0].repository.id).toBe('h70');
    expect(highMin.components[0]).not.toHaveProperty('alternative');
  });

  it('filtra por licencia (SPDX sin distinguir mayúsculas) cuando se piden licencias', () => {
    const repos = [
      repo('agpl', 90, { licenseSpdx: 'AGPL-3.0' }),
      repo('none', 90, { licenseSpdx: null }),
      repo('apache', 80, { licenseSpdx: 'Apache-2.0' }),
      repo('mit', 70, { licenseSpdx: 'MIT' }),
    ];
    const capabilities = [capability('auth', ['agpl', 'none', 'apache', 'mit'])];

    const filtered = compose(capabilities, repos, { licenses: ['apache-2.0', 'mit'] });
    expect(filtered.components[0].repository.id).toBe('apache');
    expect(filtered.components[0].alternative).toEqual({ id: 'mit', fullName: 'acme/mit' });

    // Lista vacía: no filtra.
    expect(compose(capabilities, repos, { licenses: [] }).components[0].repository.id).toBe('agpl');
  });

  it('declara la capacidad sin opción madura como gap, sin componente', () => {
    const proposal = compose(
      [capability('auth', ['a']), capability('video', ['weak']), capability('maps', [])],
      [repo('a', 90), repo('weak', 20)],
    );

    expect(proposal.components.map(({ capability }) => capability)).toEqual(['auth']);
    expect(proposal.gaps).toEqual([
      { capability: 'video', message: 'Sin opción madura en el catálogo' },
      { capability: 'maps', message: 'Sin opción madura en el catálogo' },
    ]);
    expect(NO_MATURE_OPTION).toBe('Sin opción madura en el catálogo');
    // Las capacidades sin componente siguen listadas.
    expect(proposal.capabilities.map(({ key }) => key)).toEqual(['auth', 'video', 'maps']);
  });

  it('descarta candidatos que no están en el catálogo', () => {
    const proposal = compose([capability('auth', ['ghost', 'a', 'ghost-2'])], [repo('a', 90)]);

    expect(proposal.components[0].repository.id).toBe('a');
    expect(JSON.stringify(proposal)).not.toContain('ghost');
  });

  it('no recomienda el mismo repo para dos capacidades si hay otro elegible', () => {
    const proposal = compose(
      [capability('database', ['supa', 'pg']), capability('auth', ['supa', 'kc'])],
      [repo('supa', 90), repo('pg', 80), repo('kc', 70)],
    );

    expect(proposal.components.map(({ repository }) => repository.id)).toEqual(['supa', 'kc']);
  });

  it('justifica con la razón de la capacidad y datos reales del repo', () => {
    const proposal = compose(
      [capability('auth', ['a'], { reason: 'Clientes empresa con SSO propio' })],
      [repo('a', 88, { licenseSpdx: 'Apache-2.0', stars: 25_300 })],
    );

    expect(proposal.components[0].justification).toBe(
      'Clientes empresa con SSO propio. acme/a tiene salud 88/100, licencia Apache-2.0 y 25.300 estrellas en GitHub.',
    );

    const noLicense = compose([capability('auth', ['a'])], [repo('a', 50, { licenseSpdx: null })]);
    expect(noLicense.components[0].justification).toBe(
      'El negocio necesita auth. acme/a tiene salud 50/100, sin licencia declarada y 1.200 estrellas en GitHub.',
    );
  });

  describe('ranking de candidatos', () => {
    const hit = (id: string, similarity: number): ComposerCandidate => ({ id, similarity });
    const chosen = (proposal: ReturnType<typeof compose>) => ({
      repository: proposal.components[0]?.repository.id,
      alternative: proposal.components[0]?.alternative?.id,
    });

    it('un candidato sano y popular apenas menos parecido le gana a uno débil', () => {
      // La forma de flexsearch (más parecido, salud 42) contra meilisearch y typesense.
      const proposal = compose(
        [
          capability('search', [
            hit('flexsearch', 0.62),
            hit('meilisearch', 0.58),
            hit('typesense', 0.57),
          ]),
        ],
        [
          repo('flexsearch', 42, { stars: 12_000 }),
          repo('meilisearch', 85, { stars: 48_000 }),
          repo('typesense', 80, { stars: 21_000 }),
        ],
      );

      expect(chosen(proposal)).toEqual({ repository: 'meilisearch', alternative: 'typesense' });
    });

    it('la similitud sigue pesando: uno mucho más parecido no pierde contra uno algo más sano', () => {
      const proposal = compose(
        [capability('database', [hit('relevant', 0.85), hit('offtopic', 0.55)])],
        [repo('relevant', 55, { stars: 2_000 }), repo('offtopic', 65, { stars: 3_000 })],
      );

      expect(chosen(proposal)).toEqual({ repository: 'relevant', alternative: 'offtopic' });
    });

    it('la popularidad es relativa a los candidatos de la capacidad', () => {
      // Mismo parecido y salud: gana el de más estrellas, aunque sean pocas.
      const proposal = compose(
        [capability('auth', [hit('few', 0.7), hit('more', 0.7)])],
        [repo('few', 70, { stars: 10 }), repo('more', 70, { stars: 90 })],
      );
      expect(chosen(proposal)).toEqual({ repository: 'more', alternative: 'few' });

      // Sin estrellas en ninguno no se rompe (log10(1) = 0).
      const noStars = compose(
        [capability('auth', [hit('a', 0.7), hit('b', 0.9)])],
        [repo('a', 70, { stars: 0 }), repo('b', 70, { stars: 0 })],
      );
      expect(chosen(noStars)).toEqual({ repository: 'b', alternative: 'a' });
    });

    it('los empates se resuelven por el orden de la búsqueda, siempre igual', () => {
      const repos = [repo('x', 70), repo('y', 70)];

      const xFirst = compose([capability('auth', [hit('x', 0.7), hit('y', 0.7)])], repos);
      const yFirst = compose([capability('auth', [hit('y', 0.7), hit('x', 0.7)])], repos);

      expect(chosen(xFirst)).toEqual({ repository: 'x', alternative: 'y' });
      expect(chosen(yFirst)).toEqual({ repository: 'y', alternative: 'x' });
      expect(compose([capability('auth', [hit('x', 0.7), hit('y', 0.7)])], repos)).toEqual(xFirst);
    });

    it('la alternativa es la siguiente del mismo ranking, no la siguiente de la búsqueda', () => {
      const proposal = compose(
        [capability('auth', [hit('top', 0.8), hit('weak', 0.79), hit('strong', 0.75)])],
        [
          repo('top', 95, { stars: 50_000 }),
          repo('weak', 41, { stars: 100 }),
          repo('strong', 90, { stars: 40_000 }),
        ],
      );

      expect(chosen(proposal)).toEqual({ repository: 'top', alternative: 'strong' });
    });

    it('con el mejor ya usado por otra capacidad, elige el siguiente del ranking', () => {
      const proposal = compose(
        [
          capability('database', [hit('supa', 0.8)]),
          capability('auth', [hit('supa', 0.8), hit('weak', 0.79), hit('kc', 0.75)]),
        ],
        [repo('supa', 90), repo('weak', 41, { stars: 10 }), repo('kc', 85)],
      );

      expect(proposal.components[1]).toMatchObject({
        repository: { id: 'kc' },
        alternative: { id: 'supa' },
      });
    });
  });

  describe('puntuación de la justificación', () => {
    const justification = (reason: string) =>
      compose([capability('auth', ['a'], { reason })], [repo('a', 88)]).components[0].justification;
    const TAIL = ' acme/a tiene salud 88/100, licencia MIT y 1.200 estrellas en GitHub.';

    it.each([
      ['Se consulta rápido.'],
      ['Se consulta rápido!'],
      ['Se consulta rápido?'],
      ['Se consulta rápido…'],
      ['Se consulta rápido...'],
      ['Se consulta rápido.  '],
      ['Se consulta rápido   '],
      ['Se consulta rápido'],
    ])('%j termina en un solo punto', (reason) => {
      const text = justification(reason);
      expect(text).toBe(`Se consulta rápido.${TAIL}`);
      expect(text).not.toMatch(/\.\.|\.,| \./);
    });
  });

  describe('tipo de integración del componente', () => {
    it('usa el de una idea aprobada del repo si la hay', () => {
      const proposal = compose(
        [capability('auth', ['a'], { integrationType: 'REST_API' })],
        [repo('a', 90, { ideas: [{ integrationType: 'SDK', connectsWith: [] }] })],
      );
      expect(proposal.components[0].integrationType).toBe('SDK');
    });

    it('si no, el que sugirió el modelo para la capacidad', () => {
      const proposal = compose(
        [capability('auth', ['a'], { integrationType: 'DOCKER' })],
        [repo('a', 90)],
      );
      expect(proposal.components[0].integrationType).toBe('DOCKER');
    });
  });

  describe('conexiones', () => {
    it('salen del catálogo cuando una idea aprobada del origen conecta con el destino', () => {
      const proposal = compose(
        [capability('auth', ['kc']), capability('database', ['pg']), capability('search', ['ms'])],
        [
          repo('kc', 90, {
            ideas: [
              { integrationType: 'WEBHOOK', connectsWith: ['pg', 'not-recommended'] },
              { integrationType: 'SDK', connectsWith: [] },
            ],
          }),
          repo('pg', 90),
          repo('ms', 90),
        ],
      );

      expect(proposal.connections).toEqual([
        { from: 'kc', to: 'pg', integrationType: 'WEBHOOK', source: 'CATALOG' },
      ]);
    });

    it('sin idea del catálogo, son sugerencia del modelo según dependsOn', () => {
      const proposal = compose(
        [
          capability('auth', ['kc'], { dependsOn: ['database'], integrationType: 'SDK' }),
          capability('database', ['pg']),
          capability('payments', ['lago'], { dependsOn: ['database'], integrationType: 'WEBHOOK' }),
        ],
        [repo('kc', 90), repo('pg', 90), repo('lago', 90)],
      );

      expect(proposal.connections).toEqual([
        { from: 'kc', to: 'pg', integrationType: 'SDK', source: 'MODEL_SUGGESTION' },
        { from: 'lago', to: 'pg', integrationType: 'WEBHOOK', source: 'MODEL_SUGGESTION' },
      ]);
    });

    it('descarta dependsOn desconocidos, a sí misma o hacia capacidades sin componente', () => {
      const proposal = compose(
        [
          capability('auth', ['kc'], { dependsOn: ['auth', 'nope', 'video', 'database'] }),
          capability('database', ['pg'], { dependsOn: ['database'] }),
          capability('video', ['weak'], { dependsOn: ['auth'] }),
        ],
        [repo('kc', 90), repo('pg', 90), repo('weak', 10)],
      );

      expect(proposal.connections).toEqual([
        { from: 'kc', to: 'pg', integrationType: 'REST_API', source: 'MODEL_SUGGESTION' },
      ]);
    });

    it('no repite pares y el catálogo gana sobre la sugerencia, en cualquier dirección', () => {
      const proposal = compose(
        [
          capability('auth', ['kc'], { dependsOn: ['database', 'database'] }),
          capability('database', ['pg'], { dependsOn: ['auth', 'search'] }),
          capability('search', ['ms'], { dependsOn: ['database'] }),
        ],
        [
          repo('kc', 90),
          // El catálogo conecta pg → kc: tapa la sugerencia kc → pg y pg → kc.
          repo('pg', 90, { ideas: [{ integrationType: 'SDK', connectsWith: ['kc', 'kc'] }] }),
          repo('ms', 90),
        ],
      );

      expect(proposal.connections).toEqual([
        { from: 'pg', to: 'kc', integrationType: 'SDK', source: 'CATALOG' },
        // pg → ms y ms → pg son el mismo par: queda la primera.
        { from: 'pg', to: 'ms', integrationType: 'REST_API', source: 'MODEL_SUGGESTION' },
      ]);
    });

    it('solo conecta componentes recomendados, nunca alternativas', () => {
      const proposal = compose(
        [capability('auth', ['kc', 'alt']), capability('database', ['pg'])],
        [
          repo('kc', 90),
          repo('alt', 90),
          repo('pg', 90, { ideas: [{ integrationType: 'SDK', connectsWith: ['alt'] }] }),
        ],
      );

      expect(proposal.components[0].alternative?.id).toBe('alt');
      expect(proposal.connections).toEqual([]);
    });
  });
  describe('exclusiones (ajuste "cambiá X")', () => {
    it('reemplaza el componente excluido por el siguiente del ranking', () => {
      const proposal = compose(
        [capability('auth', ['a', 'b', 'c'])],
        [repo('a', 95), repo('b', 90), repo('c', 80)],
        { exclude: ['a'] },
      );

      expect(proposal.components.map((c) => c.repository.id)).toEqual(['b']);
      expect(proposal.components[0].alternative).toEqual({ id: 'c', fullName: 'acme/c' });
    });

    it('no usa un repo excluido como alternativa', () => {
      const proposal = compose(
        [capability('auth', ['a', 'b', 'c'])],
        [repo('a', 95), repo('b', 90), repo('c', 80)],
        { exclude: ['b'] },
      );

      expect(proposal.components[0].repository.id).toBe('a');
      expect(proposal.components[0].alternative).toEqual({ id: 'c', fullName: 'acme/c' });
    });

    it('excluye el repo en todas las capacidades, también como componente repetido', () => {
      const proposal = compose(
        [capability('database', ['pg', 'my']), capability('cache', ['pg'])],
        [repo('pg', 95), repo('my', 80)],
        { exclude: ['pg'] },
      );

      expect(proposal.components.map((c) => [c.capability, c.repository.id])).toEqual([
        ['database', 'my'],
      ]);
      expect(JSON.stringify(proposal)).not.toContain('"pg"');
      expect(proposal.gaps).toEqual([{ capability: 'cache', message: NO_MATURE_OPTION }]);
    });

    it('si todos los candidatos están excluidos, la capacidad va a gaps', () => {
      const proposal = compose(
        [capability('auth', ['a', 'b']), capability('database', ['pg'])],
        [repo('a', 95), repo('b', 90), repo('pg', 90)],
        { exclude: ['a', 'b'] },
      );

      expect(proposal.components.map((c) => c.capability)).toEqual(['database']);
      expect(proposal.gaps).toEqual([{ capability: 'auth', message: NO_MATURE_OPTION }]);
    });
  });
});
