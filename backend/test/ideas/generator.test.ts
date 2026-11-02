import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createIntegrationIdea } from '../../src/db/integration-ideas.js';
import { upsertRepository } from '../../src/db/repositories.js';
import { integrationIdea, repository } from '../../src/db/schema.js';
import {
  generateIdeas,
  selectRepositoriesWithoutIdeas,
  type RepoContext,
} from '../../src/ideas/generator.js';
import type { ChatMessage, IdeaModel } from '../../src/ideas/model.js';
import { loadIdeaPrompt } from '../../src/ideas/prompt.js';
import { createTestDb, type TestDb } from '../helpers/test-db.js';

const prompt = loadIdeaPrompt();

const validIdea = {
  title: 'Notificar despliegues',
  summary: 'Escuchar el webhook de despliegues y avisar al equipo.',
  integrationType: 'WEBHOOK',
  triggers: [{ event: 'deploy.succeeded', description: 'Terminó un despliegue' }],
  snippet: { language: 'typescript', code: "app.post('/webhooks', handler);" },
  stackCompatibility: ['node'],
  difficulty: 'LOW',
};

// Devuelve las respuestas en orden y guarda los mensajes que recibió.
function fakeModel(...responses: string[]) {
  const calls: ChatMessage[][] = [];
  const model: IdeaModel = {
    name: 'fake',
    complete: async (messages) => {
      calls.push(messages);
      const next = responses.shift();
      if (next === undefined) throw new Error('El modelo falso se quedó sin respuestas');
      return next;
    },
  };
  return { model, calls };
}

const context: RepoContext = {
  fullName: 'acme/deployer',
  description: 'Despliegues automáticos',
  primaryLanguage: 'Go',
  topics: [],
  readme: '# Deployer\n\nEnvía webhooks cuando termina un despliegue.',
};

describe('generateIdeas', () => {
  let t: TestDb;
  let repositoryId: string;

  beforeAll(async () => {
    t = await createTestDb();
    const saved = await upsertRepository(t.db, {
      githubId: 1,
      fullName: 'acme/deployer',
      name: 'deployer',
      url: 'https://github.com/acme/deployer',
    });
    repositoryId = saved.id;
  });

  beforeEach(async () => {
    await t.db.delete(integrationIdea);
  });

  afterAll(async () => {
    await t?.close();
  });

  const savedIdeas = () =>
    t.db.select().from(integrationIdea).where(eq(integrationIdea.repositoryId, repositoryId));

  it('guarda de 1 a 3 ideas en borrador con origen LLM', async () => {
    const { model } = fakeModel(
      JSON.stringify({ ideas: [validIdea, { ...validIdea, title: 'Otra' }] }),
    );

    const result = await generateIdeas(t.db, { repositoryId, context }, { model, prompt });

    expect(result.status).toBe('created');
    const ideas = await savedIdeas();
    expect(ideas).toHaveLength(2);
    expect(ideas.every((idea) => idea.status === 'DRAFT' && idea.source === 'LLM')).toBe(true);
    expect(ideas[0]).toMatchObject({ title: 'Notificar despliegues', connectsWith: [] });
  });

  it('si la respuesta no cumple el esquema, reintenta una vez con el error', async () => {
    const invalid = JSON.stringify({ ideas: [{ ...validIdea, triggers: [] }] });
    const { model, calls } = fakeModel(invalid, JSON.stringify({ ideas: [validIdea] }));

    const result = await generateIdeas(t.db, { repositoryId, context }, { model, prompt });

    expect(result.status).toBe('created');
    expect(calls).toHaveLength(2);
    const retry = calls[1];
    expect(retry.at(-2)).toEqual({ role: 'assistant', content: invalid });
    expect(retry.at(-1)?.role).toBe('user');
    expect(retry.at(-1)?.content).toContain('triggers');
    expect(await savedIdeas()).toHaveLength(1);
  });

  it('si vuelve a fallar, descarta y devuelve el motivo y la respuesta', async () => {
    const tooMany = JSON.stringify({ ideas: [validIdea, validIdea, validIdea, validIdea] });
    const { model } = fakeModel('esto no es JSON', tooMany);

    const result = await generateIdeas(t.db, { repositoryId, context }, { model, prompt });

    expect(result).toMatchObject({ status: 'discarded', raw: tooMany });
    if (result.status === 'discarded') expect(result.error).toContain('ideas');
    expect(await savedIdeas()).toHaveLength(0);
  });

  it('explica cuando la respuesta no es JSON', async () => {
    const { model, calls } = fakeModel('esto no es JSON', JSON.stringify({ ideas: [validIdea] }));

    await generateIdeas(t.db, { repositoryId, context }, { model, prompt });

    expect(calls[1].at(-1)?.content).toContain('JSON');
  });
});

describe('selectRepositoriesWithoutIdeas', () => {
  let t: TestDb;

  beforeAll(async () => {
    t = await createTestDb();
    const repo = (githubId: number, name: string, stars: number) =>
      upsertRepository(t.db, {
        githubId,
        fullName: `acme/${name}`,
        name,
        url: `https://github.com/acme/${name}`,
        stars,
      });
    const withLlm = await repo(1, 'with-llm', 500);
    const withHuman = await repo(2, 'with-human', 100);
    await repo(3, 'popular', 1000);
    await repo(4, 'small', 10);
    const idea = {
      title: 't',
      summary: 's',
      integrationType: 'SDK',
      difficulty: 'LOW',
    };
    await createIntegrationIdea(t.db, { ...idea, repositoryId: withLlm.id, source: 'LLM' });
    await createIntegrationIdea(t.db, { ...idea, repositoryId: withHuman.id, source: 'HUMAN' });
  });

  afterAll(async () => {
    await t?.close();
  });

  const names = (rows: Array<typeof repository.$inferSelect>) => rows.map((r) => r.fullName);

  it('saltea los repos que ya tienen ideas generadas y ordena por estrellas', async () => {
    expect(names(await selectRepositoriesWithoutIdeas(t.db))).toEqual([
      'acme/popular',
      'acme/with-human',
      'acme/small',
    ]);
  });

  it('acepta un límite y un repo puntual', async () => {
    expect(names(await selectRepositoriesWithoutIdeas(t.db, { limit: 1 }))).toEqual([
      'acme/popular',
    ]);
    expect(names(await selectRepositoriesWithoutIdeas(t.db, { fullName: 'ACME/Small' }))).toEqual([
      'acme/small',
    ]);
  });
});
