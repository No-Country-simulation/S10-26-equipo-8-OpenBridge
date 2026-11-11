import { describe, expect, it } from 'vitest';
import {
  composeProposal,
  NO_MATURE_OPTION,
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

const capability = (
  key: string,
  candidateIds: string[],
  extra: Partial<ComposerCapability> = {},
): ComposerCapability => ({
  key,
  name: key.toUpperCase(),
  reason: `El negocio necesita ${key}.`,
  integrationType: 'REST_API',
  dependsOn: [],
  candidateIds,
  ...extra,
});

const FIXED = { id: '00000000-0000-4000-8000-000000000000', now: new Date('2026-11-11T12:00:00Z') };

const compose = (
  capabilities: ComposerCapability[],
  repositories: HydratedRepository[],
  constraints: { minHealth?: number; licenses?: string[] } = {},
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

  it('elige el mejor candidato elegible (orden de la búsqueda) y el siguiente como alternativa', () => {
    const proposal = compose(
      [capability('auth', ['low', 'a', 'b', 'c'])],
      [repo('low', 30), repo('a', 60), repo('b', 95), repo('c', 80)],
    );

    expect(proposal.components).toEqual([
      {
        capability: 'auth',
        repository: { id: 'a', fullName: 'acme/a', healthScore: 60, licenseSpdx: 'MIT' },
        justification: expect.any(String),
        integrationType: 'REST_API',
        alternative: { id: 'b', fullName: 'acme/b' },
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

    const base = compose([capability('auth', ['none', 'h39', 'h40', 'h70'])], repos);
    expect(base.components[0].repository.id).toBe('h40');

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
});
