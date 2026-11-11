import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { decomposeBusiness, InvalidModelResponseError } from '../../src/assistant/capabilities.js';
import { loadCapabilitiesPrompt } from '../../src/assistant/prompt.js';
import { MAX_DESCRIPTION, type ModelOutput } from '../../src/assistant/schema.js';
import { upsertEmbedding } from '../../src/db/embeddings.js';
import { upsertRepository } from '../../src/db/repositories.js';
import { EMBEDDING_DIMENSIONS, category } from '../../src/db/schema.js';
import { seedCategories } from '../../src/db/seed.js';
import {
  ModelTimeoutError,
  type ChatMessage,
  type CompleteOptions,
  type IdeaModel,
} from '../../src/ideas/model.js';
import type { EmbedQuery } from '../../src/search/service.js';
import { createTestDb, type TestDb } from '../helpers/test-db.js';

function vectorWithSimilarity(similarity: number, axis: number): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  vector[0] = similarity;
  vector[axis] = Math.sqrt(1 - similarity ** 2);
  return vector;
}

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
    },
    {
      key: 'payments',
      name: 'Pagos',
      reason: 'Los pedidos se cobran online.',
      query: 'online payments',
      category: 'payments',
    },
    {
      key: 'video',
      name: 'Videollamadas',
      reason: 'Los vendedores muestran repuestos por videollamada.',
      query: 'video calls',
      category: null,
    },
  ],
};

const NEEDS_CONTEXT: ModelOutput = {
  sufficientContext: false,
  missingContext: ['¿A qué se dedica tu empresa?', '¿Quiénes la van a usar?'],
  capabilities: [],
};

// Modelo falso que devuelve las respuestas en orden y registra los mensajes.
function fakeModel(...responses: string[]) {
  const calls: ChatMessage[][] = [];
  const options: Array<CompleteOptions | undefined> = [];
  const model: IdeaModel = {
    name: 'fake',
    complete: vi.fn(async (messages: ChatMessage[], callOptions?: CompleteOptions) => {
      calls.push(messages);
      options.push(callOptions);
      const next = responses.shift();
      if (next === undefined) throw new Error('El modelo falso no tiene más respuestas');
      return next;
    }),
  };
  return { model, calls, options };
}

const embedQuery = vi.fn<EmbedQuery>(async () => vectorWithSimilarity(1, 1));

describe('descomposición del negocio en capacidades', () => {
  let t: TestDb;
  const prompt = loadCapabilitiesPrompt();

  beforeAll(async () => {
    t = await createTestDb();
    await seedCategories(t.db);
    const categories = await t.db.select().from(category);
    const idOf = (slug: string) => categories.find((c) => c.slug === slug)!.id;

    // nombre, categoría, salud, similitud con cualquier consulta
    const repos: Array<[string, string, number, number]> = [
      ['keycloak', 'auth', 95, 0.9],
      ['authelia', 'auth', 50, 0.95],
      ['lago', 'payments', 90, 0.7],
      ['meilisearch', 'search', 98, 0.8],
    ];
    for (const [index, [name, slug, healthScore, similarity]] of repos.entries()) {
      const saved = await upsertRepository(
        t.db,
        {
          githubId: index + 1,
          fullName: `acme/${name}`,
          name,
          url: `https://github.com/acme/${name}`,
          healthScore,
        },
        [idOf(slug)],
      );
      await upsertEmbedding(t.db, {
        entityType: 'REPOSITORY',
        entityId: saved.id,
        content: name,
        vector: vectorWithSimilarity(similarity, index + 2),
        model: 'bge-m3',
      });
    }
  });

  afterAll(async () => {
    await t?.close();
  });

  const candidateNames = (capability: { candidates: Array<{ title: string }> }) =>
    capability.candidates.map(({ title }) => title);

  describe('decomposeBusiness', () => {
    it('devuelve cada capacidad con su justificación y sus candidatos del catálogo', async () => {
      embedQuery.mockClear();
      const { model } = fakeModel(JSON.stringify(OUTPUT));

      const result = await decomposeBusiness(
        t.db,
        { description: DESCRIPTION },
        { model, prompt, embedQuery },
      );

      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;
      expect(result.capabilities.map(({ key, reason }) => [key, reason])).toEqual(
        OUTPUT.capabilities.map(({ key, reason }) => [key, reason]),
      );
      const [auth, payments, video] = result.capabilities;
      expect(candidateNames(auth)).toEqual(['acme/authelia', 'acme/keycloak']);
      expect(candidateNames(payments)).toEqual(['acme/lago']);
      // Sin categoría, busca en todo el catálogo.
      expect(candidateNames(video)).toEqual(['acme/authelia', 'acme/keycloak', 'acme/meilisearch']);
    });

    it('hace una búsqueda independiente por capacidad, con su propia consulta', async () => {
      embedQuery.mockClear();
      const { model } = fakeModel(JSON.stringify(OUTPUT));

      await decomposeBusiness(t.db, { description: DESCRIPTION }, { model, prompt, embedQuery });

      expect(embedQuery.mock.calls.map(([query]) => query)).toEqual([
        'B2B single sign-on',
        'online payments',
        'video calls',
      ]);
    });

    it('aplica la salud mínima a los candidatos', async () => {
      const { model } = fakeModel(JSON.stringify(OUTPUT));

      const result = await decomposeBusiness(
        t.db,
        { description: DESCRIPTION, constraints: { minHealth: 60 } },
        { model, prompt, embedQuery },
      );

      if (result.status !== 'OK') throw new Error('se esperaba OK');
      expect(candidateNames(result.capabilities[0])).toEqual(['acme/keycloak']);
    });

    it('ante una descripción vaga pide más contexto en lugar de inventar', async () => {
      embedQuery.mockClear();
      const { model } = fakeModel(JSON.stringify(NEEDS_CONTEXT));

      const result = await decomposeBusiness(
        t.db,
        { description: 'Quiero hacer una app para mi negocio' },
        { model, prompt, embedQuery },
      );

      expect(result).toEqual({ status: 'NEEDS_CONTEXT', questions: NEEDS_CONTEXT.missingContext });
      expect(embedQuery).not.toHaveBeenCalled();
    });

    it('si la respuesta no cumple el esquema, reintenta una vez mostrándole el error', async () => {
      const invalid = { ...OUTPUT, capabilities: [{ ...OUTPUT.capabilities[0], key: 'Auth!' }] };
      const { model, calls } = fakeModel(JSON.stringify(invalid), JSON.stringify(OUTPUT));

      const result = await decomposeBusiness(
        t.db,
        { description: DESCRIPTION },
        { model, prompt, embedQuery },
      );

      expect(result.status).toBe('OK');
      expect(calls).toHaveLength(2);
      expect(calls[1].at(-2)).toEqual({ role: 'assistant', content: JSON.stringify(invalid) });
      expect(calls[1].at(-1)?.content).toContain('key');
    });

    it('con contexto suficiente exige al menos 3 capacidades', async () => {
      const short = { ...OUTPUT, capabilities: OUTPUT.capabilities.slice(0, 2) };
      const { model, calls } = fakeModel(JSON.stringify(short), JSON.stringify(OUTPUT));

      const result = await decomposeBusiness(
        t.db,
        { description: DESCRIPTION },
        { model, prompt, embedQuery },
      );

      expect(result.status).toBe('OK');
      expect(calls).toHaveLength(2);
    });

    it('cada intento usa como timeout lo que queda del presupuesto total', async () => {
      const { model, options } = fakeModel('no es JSON', JSON.stringify(OUTPUT));

      await decomposeBusiness(
        t.db,
        { description: DESCRIPTION },
        { model, prompt, embedQuery, budgetMs: 5_000 },
      );

      expect(options).toHaveLength(2);
      expect(options[0]?.timeoutMs).toBeLessThanOrEqual(5_000);
      expect(options[0]?.timeoutMs).toBeGreaterThan(4_000);
      expect(options[1]?.timeoutMs).toBeLessThanOrEqual(options[0]!.timeoutMs!);
    });

    it('si el presupuesto se agotó, no reintenta y responde timeout', async () => {
      const model: IdeaModel = {
        name: 'lento',
        complete: vi.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 30));
          return 'no es JSON';
        }),
      };

      await expect(
        decomposeBusiness(
          t.db,
          { description: DESCRIPTION },
          { model, prompt, embedQuery, budgetMs: 20 },
        ),
      ).rejects.toBeInstanceOf(ModelTimeoutError);
      expect(model.complete).toHaveBeenCalledTimes(1);
    });

    it('si vuelve a fallar, lanza un error con la respuesta del modelo', async () => {
      const { model } = fakeModel('no es JSON', '{"sufficientContext": true}');

      await expect(
        decomposeBusiness(t.db, { description: DESCRIPTION }, { model, prompt, embedQuery }),
      ).rejects.toBeInstanceOf(InvalidModelResponseError);
    });
  });

  describe('POST /api/v1/assistant/capabilities', () => {
    const post = (model: IdeaModel, body: object, embed: EmbedQuery = embedQuery) =>
      request(createApp({ db: t.db, embedQuery: embed, assistantModel: model }))
        .post('/api/v1/assistant/capabilities')
        .send(body);

    it('responde las capacidades con sus candidatos', async () => {
      const res = await post(fakeModel(JSON.stringify(OUTPUT)).model, {
        description: DESCRIPTION,
        constraints: { minHealth: 60 },
      });

      expect(res.status).toBe(200);
      expect(res.body.data.capabilities).toHaveLength(3);
      expect(res.body.data.capabilities[0]).toMatchObject({
        key: 'auth',
        name: 'Inicio de sesión',
        reason: OUTPUT.capabilities[0].reason,
        query: 'B2B single sign-on',
        category: 'auth',
        candidates: [{ type: 'REPOSITORY', title: 'acme/keycloak' }],
      });
    });

    it('responde 422 INSUFFICIENT_CONTEXT con las preguntas', async () => {
      const res = await post(fakeModel(JSON.stringify(NEEDS_CONTEXT)).model, {
        description: 'Quiero hacer una app para mi negocio',
      });

      expect(res.status).toBe(422);
      expect(res.body.error).toEqual({
        code: 'INSUFFICIENT_CONTEXT',
        message: expect.any(String),
        details: NEEDS_CONTEXT.missingContext.map((issue) => ({ field: 'description', issue })),
      });
    });

    it.each<{ reason: string; body: object }>([
      { reason: 'sin descripción', body: {} },
      { reason: 'descripción corta', body: { description: 'una app' } },
      { reason: 'descripción larga', body: { description: 'x'.repeat(2001) } },
      {
        reason: 'salud fuera de rango',
        body: { description: DESCRIPTION, constraints: { minHealth: 200 } },
      },
    ])('responde 400 VALIDATION_ERROR: $reason', async ({ body }) => {
      const { model } = fakeModel();
      const res = await post(model, body);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.length).toBeGreaterThan(0);
      expect(model.complete).not.toHaveBeenCalled();
    });

    const postRaw = (model: IdeaModel, body: string) =>
      request(createApp({ db: t.db, embedQuery, assistantModel: model }))
        .post('/api/v1/assistant/capabilities')
        .set('Content-Type', 'application/json')
        .send(body);

    it('responde 400 VALIDATION_ERROR con details si el cuerpo no es JSON', async () => {
      const res = await postRaw(fakeModel().model, '{"description": ');

      expect(res.status).toBe(400);
      expect(res.body.error).toEqual({
        code: 'VALIDATION_ERROR',
        message: expect.any(String),
        details: [],
      });
    });

    it('acepta una descripción válida con escapes y responde 413 con details si el cuerpo es enorme', async () => {
      // 2.000 caracteres escapados como é ocupan 12 KB.
      const escaped = `{"description": "${'\\u00e9'.repeat(MAX_DESCRIPTION)}"}`;
      const ok = await postRaw(fakeModel(JSON.stringify(OUTPUT)).model, escaped);
      expect(ok.status).toBe(200);

      const res = await post(fakeModel().model, { description: 'x'.repeat(100_000) });
      expect(res.status).toBe(413);
      expect(res.body.error).toEqual({
        code: 'PAYLOAD_TOO_LARGE',
        message: expect.any(String),
        details: [],
      });
    });

    it('responde 502 si el modelo no cumple el formato dos veces', async () => {
      const res = await post(fakeModel('no', 'tampoco').model, { description: DESCRIPTION });

      expect(res.status).toBe(502);
      expect(res.body.error.code).toBe('MODEL_INVALID_RESPONSE');
    });

    it('responde 504 UPSTREAM_TIMEOUT si el modelo no responde a tiempo', async () => {
      const model: IdeaModel = {
        name: 'lento',
        complete: async () => {
          throw new ModelTimeoutError(20_000);
        },
      };

      const res = await post(model, { description: DESCRIPTION });

      expect(res.status).toBe(504);
      expect(res.body.error.code).toBe('UPSTREAM_TIMEOUT');
    });

    it('responde 503 si Ollama no está disponible', async () => {
      const down: IdeaModel = {
        name: 'caído',
        complete: async () => {
          throw new Error('fetch failed');
        },
      };
      expect((await post(down, { description: DESCRIPTION })).status).toBe(503);

      const res = await post(
        fakeModel(JSON.stringify(OUTPUT)).model,
        { description: DESCRIPTION },
        async () => {
          throw new Error('No se pudo conectar con Ollama');
        },
      );
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('UPSTREAM_UNAVAILABLE');
    });

    it('documenta el servicio en OpenAPI', async () => {
      const res = await request(createApp({ db: t.db })).get('/api/v1/openapi.json');

      const operation = res.body.paths['/api/v1/assistant/capabilities'].post;
      expect(Object.keys(operation.responses)).toEqual([
        '200',
        '400',
        '413',
        '422',
        '502',
        '503',
        '504',
      ]);
      expect(res.body.components.schemas).toHaveProperty('CapabilitiesResponse');
    });
  });
});
