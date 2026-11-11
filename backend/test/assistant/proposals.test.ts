import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { loadCapabilitiesPrompt } from '../../src/assistant/prompt.js';
import { assistantRouter } from '../../src/assistant/routes.js';
import {
  createProposal,
  ProposalAbortedError,
  RetrievalTimeoutError,
} from '../../src/assistant/proposal.js';
import { proposalSchema, type ModelOutput } from '../../src/assistant/schema.js';
import { upsertEmbedding } from '../../src/db/embeddings.js';
import { upsertRepository } from '../../src/db/repositories.js';
import { category, integrationIdea } from '../../src/db/schema.js';
import { seedCategories } from '../../src/db/seed.js';
import { ModelTimeoutError, type IdeaModel } from '../../src/ideas/model.js';
import { searchCatalog, type EmbedQuery } from '../../src/search/service.js';
import { fakeModel, vectorWithSimilarity } from '../helpers/assistant.js';
import { createTestDb, type TestDb } from '../helpers/test-db.js';

const DESCRIPTION = 'Marketplace B2B de repuestos industriales con pagos online y buscador.';

const OUTPUT: ModelOutput = {
  sufficientContext: true,
  missingContext: [],
  capabilities: [
    {
      key: 'auth',
      name: 'Inicio de sesión',
      reason: 'Compradores y vendedores entran con cuentas de empresa.',
      query: 'B2B single sign-on',
      category: 'auth',
      integrationType: 'REST_API',
      dependsOn: ['database', 'auth', 'inexistente'],
    },
    {
      key: 'database',
      name: 'Base de datos',
      reason: 'Pedidos y repuestos tienen que persistir',
      query: 'relational database',
      category: 'database',
      integrationType: 'DOCKER',
      dependsOn: [],
    },
    {
      key: 'search',
      name: 'Búsqueda',
      reason: 'Los compradores buscan repuestos por código.',
      query: 'full-text search engine',
      category: 'search',
      integrationType: 'REST_API',
      dependsOn: ['auth'],
    },
    {
      key: 'payments',
      name: 'Pagos',
      reason: 'Los pedidos se cobran online.',
      query: 'online payments',
      category: 'payments',
      integrationType: 'WEBHOOK',
      dependsOn: ['database'],
    },
  ],
};

const NEEDS_CONTEXT: ModelOutput = {
  sufficientContext: false,
  missingContext: ['¿A qué se dedica tu empresa?', '¿Quiénes la van a usar?'],
  capabilities: [],
};

const embedQuery = vi.fn<EmbedQuery>(async () => vectorWithSimilarity(1, 1));

type SseEvent = { event: string; data: unknown };

// Lee el cuerpo text/event-stream igual que el front: un mensaje por bloque,
// y los bloques sin data (comentarios de keep-alive) se descartan.
function parseSse(body: string): SseEvent[] {
  return body
    .replace(/\r\n/g, '\n')
    .split('\n\n')
    .filter((block) => block.split('\n').some((line) => line.startsWith('data:')))
    .map((block) => {
      const lines = block.split('\n');
      const event =
        lines
          .find((l) => l.startsWith('event:'))
          ?.slice(6)
          .trim() ?? 'message';
      const data = lines
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
        .join('\n');
      return { event, data: JSON.parse(data) };
    });
}

describe('propuesta de stack', () => {
  let t: TestDb;
  const prompt = loadCapabilitiesPrompt();
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestDb();
    await seedCategories(t.db);
    const categories = await t.db.select().from(category);
    const idOf = (slug: string) => categories.find((c) => c.slug === slug)!.id;

    // nombre, categoría, salud, licencia, similitud con cualquier consulta
    const repos: Array<[string, string, number, string | null, number]> = [
      ['keycloak', 'auth', 90, 'Apache-2.0', 0.9],
      ['authelia', 'auth', 60, 'MIT', 0.8],
      ['weakauth', 'auth', 30, 'MIT', 0.95],
      ['postgres', 'database', 95, 'PostgreSQL', 0.9],
      ['meilisearch', 'search', 80, 'MIT', 0.9],
      ['lago', 'payments', 35, 'AGPL-3.0', 0.9],
    ];
    for (const [index, [name, slug, healthScore, licenseSpdx, similarity]] of repos.entries()) {
      const saved = await upsertRepository(
        t.db,
        {
          githubId: index + 1,
          fullName: `acme/${name}`,
          name,
          url: `https://github.com/acme/${name}`,
          healthScore,
          licenseSpdx,
          stars: 1000 * (index + 1),
        },
        [idOf(slug)],
      );
      ids[name] = saved.id;
      await upsertEmbedding(t.db, {
        entityType: 'REPOSITORY',
        entityId: saved.id,
        content: name,
        vector: vectorWithSimilarity(similarity, index + 2),
        model: 'bge-m3',
      });
    }

    const idea = (
      repo: string,
      status: 'DRAFT' | 'APPROVED' | 'REJECTED',
      integrationType: 'SDK' | 'CLI' | 'REST_API',
      connectsWith: string[],
    ) => ({
      repositoryId: ids[repo],
      title: `${repo} ${status}`,
      summary: 'Idea de prueba.',
      integrationType,
      difficulty: 'LOW' as const,
      source: 'HUMAN' as const,
      status,
      connectsWith: connectsWith.map((name) => ids[name]),
    });
    await t.db.insert(integrationIdea).values([
      idea('keycloak', 'APPROVED', 'SDK', ['postgres']),
      // Ni los borradores ni los rechazos crean conexiones del catálogo ni
      // definen el tipo de integración.
      idea('meilisearch', 'DRAFT', 'CLI', ['postgres', 'keycloak']),
      idea('meilisearch', 'REJECTED', 'SDK', ['postgres', 'keycloak']),
    ]);
  });

  afterAll(async () => {
    await t?.close();
  });

  describe('createProposal', () => {
    it('avisa cada etapa y arma la propuesta con datos del catálogo', async () => {
      const stages: string[] = [];
      const result = await createProposal(
        t.db,
        { description: DESCRIPTION },
        { model: fakeModel(JSON.stringify(OUTPUT)).model, prompt, embedQuery },
        { onStage: (stage) => stages.push(stage) },
      );

      expect(stages).toEqual(['ANALYZING', 'RETRIEVING', 'COMPOSING']);
      if (result.status !== 'OK') throw new Error('se esperaba OK');
      const { proposal } = result;
      expect(proposalSchema.parse(proposal)).toEqual(proposal);
      expect(
        proposal.components.map((c) => [c.capability, c.repository.fullName, c.integrationType]),
      ).toEqual([
        // La idea aprobada de keycloak define SDK, aunque el modelo dijo REST_API.
        ['auth', 'acme/keycloak', 'SDK'],
        ['database', 'acme/postgres', 'DOCKER'],
        // Las ideas DRAFT y REJECTED de meilisearch no cuentan.
        ['search', 'acme/meilisearch', 'REST_API'],
      ]);
      expect(proposal.components[0]).toMatchObject({
        repository: {
          id: ids.keycloak,
          healthScore: 90,
          licenseSpdx: 'Apache-2.0',
        },
        alternative: { id: ids.authelia, fullName: 'acme/authelia' },
        justification:
          'Compradores y vendedores entran con cuentas de empresa. acme/keycloak tiene salud 90/100, licencia Apache-2.0 y 1.000 estrellas en GitHub.',
      });
      expect(proposal.gaps).toEqual([
        { capability: 'payments', message: 'Sin opción madura en el catálogo' },
      ]);
      expect(proposal.connections).toEqual([
        { from: ids.keycloak, to: ids.postgres, integrationType: 'SDK', source: 'CATALOG' },
        {
          from: ids.meilisearch,
          to: ids.keycloak,
          integrationType: 'REST_API',
          source: 'MODEL_SUGGESTION',
        },
      ]);
    });

    it('aplica minHealth y licencias del usuario', async () => {
      const result = await createProposal(
        t.db,
        {
          description: DESCRIPTION,
          constraints: { minHealth: 85, licenses: ['postgresql', 'apache-2.0'] },
        },
        { model: fakeModel(JSON.stringify(OUTPUT)).model, prompt, embedQuery },
      );

      if (result.status !== 'OK') throw new Error('se esperaba OK');
      expect(result.proposal.components.map((c) => c.repository.fullName)).toEqual([
        'acme/keycloak',
        'acme/postgres',
      ]);
      expect(result.proposal.components[0]).not.toHaveProperty('alternative');
      expect(result.proposal.gaps.map((g) => g.capability)).toEqual(['search', 'payments']);
    });

    it('con licencias pide más candidatos, para no perder los compatibles fuera de los 3 primeros', async () => {
      const limits: Array<number | undefined> = [];
      const search: typeof searchCatalog = async (db, input, deps) => {
        limits.push(input.limit);
        return searchCatalog(db, input, deps);
      };
      const run = (constraints: { licenses?: string[] }) =>
        createProposal(
          t.db,
          { description: DESCRIPTION, constraints },
          { model: fakeModel(JSON.stringify(OUTPUT)).model, prompt, embedQuery, search },
        );

      await run({});
      const withoutLicenses = [...new Set(limits)];
      limits.length = 0;
      await run({ licenses: ['mit'] });

      expect(withoutLicenses).toEqual([3]);
      expect(new Set(limits).size).toBe(1);
      expect(limits[0]).toBeGreaterThan(3);
    });

    it('descarta candidatos cuyo id no existe en el catálogo', async () => {
      const ghost = randomUUID();
      const search: typeof searchCatalog = async (db, input, deps) => {
        const real = (await searchCatalog(db, input, deps)) ?? [];
        return [
          {
            type: 'REPOSITORY',
            id: ghost,
            similarity: 0.99,
            title: 'acme/fantasma',
            summary: null,
            categories: [],
            repository: { id: ghost, fullName: 'acme/fantasma', healthScore: 99 },
          },
          ...real,
        ];
      };

      const result = await createProposal(
        t.db,
        { description: DESCRIPTION },
        { model: fakeModel(JSON.stringify(OUTPUT)).model, prompt, embedQuery, search },
      );

      if (result.status !== 'OK') throw new Error('se esperaba OK');
      expect(result.proposal.components[0].repository.id).toBe(ids.keycloak);
      expect(JSON.stringify(result.proposal)).not.toContain(ghost);
      expect(JSON.stringify(result.proposal)).not.toContain('fantasma');
    });

    it('busca los candidatos de todas las capacidades en paralelo', async () => {
      let inFlight = 0;
      let maxInFlight = 0;
      const slowEmbed: EmbedQuery = async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 20));
        inFlight -= 1;
        return vectorWithSimilarity(1, 1);
      };

      await createProposal(
        t.db,
        { description: DESCRIPTION },
        { model: fakeModel(JSON.stringify(OUTPUT)).model, prompt, embedQuery: slowEmbed },
      );

      expect(maxInFlight).toBe(OUTPUT.capabilities.length);
    });

    it('corta con RetrievalTimeoutError si las búsquedas superan el presupuesto total', async () => {
      const hanging: EmbedQuery = () => new Promise(() => {});

      await expect(
        createProposal(
          t.db,
          { description: DESCRIPTION },
          {
            model: fakeModel(JSON.stringify(OUTPUT)).model,
            prompt,
            embedQuery: hanging,
            totalBudgetMs: 50,
          },
        ),
      ).rejects.toBeInstanceOf(RetrievalTimeoutError);
    });

    it('si el cliente se fue, no sigue con las búsquedas', async () => {
      const controller = new AbortController();
      const embed = vi.fn<EmbedQuery>(async () => vectorWithSimilarity(1, 1));
      const model: IdeaModel = {
        name: 'fake',
        complete: async () => {
          controller.abort();
          return JSON.stringify(OUTPUT);
        },
      };

      await expect(
        createProposal(
          t.db,
          { description: DESCRIPTION },
          { model, prompt, embedQuery: embed },
          { signal: controller.signal },
        ),
      ).rejects.toBeInstanceOf(ProposalAbortedError);
      expect(embed).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/assistant/proposals', () => {
    const post = (model: IdeaModel, body: object, embed: EmbedQuery = embedQuery) =>
      request(createApp({ db: t.db, embedQuery: embed, assistantModel: model }))
        .post('/api/v1/assistant/proposals')
        .set('Accept', 'text/event-stream')
        .send(body)
        .buffer(true)
        .parse((res, callback) => {
          let text = '';
          res.setEncoding('utf8');
          res.on('data', (chunk: string) => (text += chunk));
          res.on('end', () => callback(null, text));
        });

    it('manda comentarios de keep-alive mientras el modelo piensa, sin romper los eventos', async () => {
      const slow: IdeaModel = {
        name: 'lento',
        complete: async () => {
          await new Promise((resolve) => setTimeout(resolve, 120));
          return JSON.stringify(OUTPUT);
        },
      };
      const app = express().use(
        '/api/v1',
        assistantRouter(t.db, { model: slow, prompt, embedQuery, keepAliveMs: 20 }),
      );

      const res = await request(app)
        .post('/api/v1/assistant/proposals')
        .send({ description: DESCRIPTION })
        .buffer(true)
        .parse((response, callback) => {
          let text = '';
          response.setEncoding('utf8');
          response.on('data', (chunk: string) => (text += chunk));
          response.on('end', () => callback(null, text));
        });

      const body = res.body as string;
      expect(body).toMatch(/^: ping$/m);
      // Los comentarios no tienen data: el parser del front los ignora.
      expect(parseSse(body).map(({ event }) => event)).toEqual([
        'progress',
        'progress',
        'progress',
        'result',
      ]);
    });

    it('emite las tres etapas y después la propuesta, por SSE', async () => {
      const res = await post(fakeModel(JSON.stringify(OUTPUT)).model, {
        description: `  ${DESCRIPTION}  `,
        constraints: { minHealth: 50 },
      });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/^text\/event-stream/);
      expect(res.headers['cache-control']).toBe('no-cache');
      expect(res.headers['connection']).toBe('keep-alive');
      expect(res.headers['x-accel-buffering']).toBe('no');

      const events = parseSse(res.body as string);
      expect(events.map(({ event }) => event)).toEqual([
        'progress',
        'progress',
        'progress',
        'result',
      ]);
      expect(events.slice(0, 3).map(({ data }) => data)).toEqual([
        { stage: 'ANALYZING' },
        { stage: 'RETRIEVING' },
        { stage: 'COMPOSING' },
      ]);

      const result = events[3].data as { data: unknown };
      expect(Object.keys(result)).toEqual(['data']);
      const proposal = proposalSchema.strict().parse(result.data);
      expect(proposal.cached).toBe(false);
      expect(proposal.capabilities).toHaveLength(4);
      expect(proposal.components.map((c) => c.capability)).toEqual(['auth', 'database', 'search']);
      for (const component of proposal.components) {
        expect(Object.keys(component).sort()).toEqual(
          ['alternative', 'capability', 'integrationType', 'justification', 'repository']
            .filter((key) => key !== 'alternative' || 'alternative' in component)
            .sort(),
        );
      }
      expect(
        proposal.connections.every((c) => c.source !== 'CATALOG' || c.from === ids.keycloak),
      ).toBe(true);
      expect(
        proposal.connections.some((c) => c.from === ids.meilisearch && c.source === 'CATALOG'),
      ).toBe(false);
    });

    it('responde 400 VALIDATION_ERROR en JSON (antes del stream) si la descripción es corta', async () => {
      const { model } = fakeModel();
      const res = await request(createApp({ db: t.db, embedQuery, assistantModel: model }))
        .post('/api/v1/assistant/proposals')
        .send({ description: 'una app' });

      expect(res.status).toBe(400);
      expect(res.headers['content-type']).toMatch(/^application\/json/);
      expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(res.body.error.details.length).toBeGreaterThan(0);
      expect(model.complete).not.toHaveBeenCalled();
    });

    it.each<{ reason: string; body: object }>([
      {
        reason: 'salud fuera de rango',
        body: { description: DESCRIPTION, constraints: { minHealth: 101 } },
      },
      {
        reason: 'licencias no son texto',
        body: { description: DESCRIPTION, constraints: { licenses: [1] } },
      },
    ])('responde 400 VALIDATION_ERROR: $reason', async ({ body }) => {
      const res = await request(
        createApp({ db: t.db, embedQuery, assistantModel: fakeModel().model }),
      )
        .post('/api/v1/assistant/proposals')
        .send(body);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('responde 413 VALIDATION_ERROR (código del contrato del front) si el cuerpo es enorme', async () => {
      const res = await request(
        createApp({ db: t.db, embedQuery, assistantModel: fakeModel().model }),
      )
        .post('/api/v1/assistant/proposals')
        .send({ description: 'x'.repeat(100_000) });

      expect(res.status).toBe(413);
      expect(res.body.error).toEqual({
        code: 'VALIDATION_ERROR',
        message: expect.any(String),
        details: [],
      });
    });

    it('si la descripción es vaga, emite un error INSUFFICIENT_CONTEXT con las preguntas', async () => {
      const res = await post(fakeModel(JSON.stringify(NEEDS_CONTEXT)).model, {
        description: 'Quiero hacer una app para mi negocio',
      });

      expect(res.status).toBe(200);
      const events = parseSse(res.body as string);
      expect(events).toEqual([
        { event: 'progress', data: { stage: 'ANALYZING' } },
        {
          event: 'error',
          data: {
            error: {
              code: 'INSUFFICIENT_CONTEXT',
              message: expect.any(String),
              details: NEEDS_CONTEXT.missingContext.map((issue) => ({
                field: 'description',
                issue,
              })),
            },
          },
        },
      ]);
    });

    it('si el modelo no responde a tiempo, emite UPSTREAM_TIMEOUT', async () => {
      const slow: IdeaModel = {
        name: 'lento',
        complete: async () => {
          throw new ModelTimeoutError(20_000);
        },
      };

      const events = parseSse((await post(slow, { description: DESCRIPTION })).body as string);

      expect(events.at(-1)).toEqual({
        event: 'error',
        data: { error: { code: 'UPSTREAM_TIMEOUT', message: expect.any(String), details: [] } },
      });
    });

    it.each<{ reason: string; model: () => IdeaModel; embed?: EmbedQuery }>([
      {
        reason: 'Ollama caído',
        model: () => ({
          name: 'caído',
          complete: async () => {
            throw new Error('fetch failed');
          },
        }),
      },
      { reason: 'respuesta inválida dos veces', model: () => fakeModel('no', 'tampoco').model },
      {
        reason: 'embeddings caídos',
        model: () => fakeModel(JSON.stringify(OUTPUT)).model,
        embed: async () => {
          throw new Error('No se pudo conectar con Ollama');
        },
      },
    ])(
      'ante un fallo ($reason) emite INTERNAL_ERROR sin detalles internos',
      async ({ model, embed }) => {
        const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
        const res = await post(model(), { description: DESCRIPTION }, embed);
        errorLog.mockRestore();

        const events = parseSse(res.body as string);
        const last = events.at(-1)!;
        expect(last.event).toBe('error');
        expect(last.data).toEqual({
          error: { code: 'INTERNAL_ERROR', message: expect.any(String), details: [] },
        });
        expect(JSON.stringify(last.data)).not.toMatch(/fetch failed|Ollama|tampoco/);
        expect(events.filter(({ event }) => event === 'result')).toEqual([]);
      },
    );

    it('documenta el servicio en OpenAPI', async () => {
      const res = await request(createApp({ db: t.db })).get('/api/v1/openapi.json');

      const operation = res.body.paths['/api/v1/assistant/proposals'].post;
      expect(operation.requestBody.content['application/json'].schema).toEqual({
        $ref: '#/components/schemas/ProposalRequest',
      });
      expect(operation.responses['200'].content).toHaveProperty('text/event-stream');
      expect(Object.keys(operation.responses)).toEqual(['200', '400', '413']);
      expect(res.body.components.schemas).toHaveProperty('Proposal');
      expect(
        res.body.components.schemas.ProposalRequest.properties.constraints.properties,
      ).toHaveProperty('licenses');
    });
  });
});
