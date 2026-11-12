import { eq, sql } from 'drizzle-orm';
import { ZodError } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createIntegrationIdea } from '../../src/db/integration-ideas.js';
import { upsertRepository } from '../../src/db/repositories.js';
import { integrationIdea, repository } from '../../src/db/schema.js';
import { createTestDb, type TestDb } from '../helpers/test-db.js';

describe('createIntegrationIdea', () => {
  let t: TestDb;
  let repositoryId: string;

  beforeAll(async () => {
    t = await createTestDb();
    const saved = await upsertRepository(t.db, {
      githubId: 1,
      fullName: 'stripe/stripe-node',
      name: 'stripe-node',
      url: 'https://github.com/stripe/stripe-node',
    });
    repositoryId = saved.id;
  });

  afterAll(async () => {
    await t?.close();
  });

  const webhookIdea = () => ({
    repositoryId,
    title: 'Notificar pagos aprobados',
    summary: 'Escuchar el webhook de pagos y actualizar el pedido.',
    integrationType: 'WEBHOOK',
    triggers: [{ event: 'payment.succeeded', description: 'Se aprobó un cobro' }],
    snippet: { language: 'typescript', code: "app.post('/webhooks/pagos', handler);" },
    stackCompatibility: ['nextjs'],
    difficulty: 'MEDIUM',
    source: 'LLM',
  });

  it('crea la idea en estado DRAFT aunque pidan otro estado', async () => {
    const saved = await createIntegrationIdea(t.db, { ...webhookIdea(), status: 'APPROVED' });

    expect(saved.status).toBe('DRAFT');
    expect(saved.triggers).toEqual(webhookIdea().triggers);
    expect(saved.snippet).toEqual(webhookIdea().snippet);
  });

  it('valida antes de persistir', async () => {
    const before = await t.db.select().from(integrationIdea);

    await expect(
      createIntegrationIdea(t.db, { ...webhookIdea(), integrationType: 'GRPC' }),
    ).rejects.toBeInstanceOf(ZodError);

    expect(await t.db.select().from(integrationIdea)).toHaveLength(before.length);
  });

  it('la base también rechaza un WEBHOOK sin disparadores', async () => {
    await expect(
      t.db.insert(integrationIdea).values({
        repositoryId,
        title: 't',
        summary: 's',
        integrationType: 'WEBHOOK',
        triggers: [],
        difficulty: 'LOW',
        source: 'HUMAN',
      }),
    ).rejects.toMatchObject({ cause: { constraint: 'integration_idea_webhook_triggers' } });
  });

  it('la base también rechaza un fragmento sin lenguaje', async () => {
    await expect(
      t.db.execute(sql`
        INSERT INTO integration_idea (repository_id, title, summary, integration_type, difficulty, source, snippet)
        VALUES (${repositoryId}, 't', 's', 'SDK', 'LOW', 'HUMAN', '{"code": "npm i"}'::jsonb)
      `),
    ).rejects.toMatchObject({ cause: { constraint: 'integration_idea_snippet_language' } });
  });

  it('borra las ideas cuando se borra el repositorio', async () => {
    const other = await upsertRepository(t.db, {
      githubId: 2,
      fullName: 'acme/lib',
      name: 'lib',
      url: 'https://github.com/acme/lib',
    });
    await createIntegrationIdea(t.db, { ...webhookIdea(), repositoryId: other.id });

    await t.db.delete(repository).where(eq(repository.id, other.id));

    const ideas = await t.db
      .select()
      .from(integrationIdea)
      .where(eq(integrationIdea.repositoryId, other.id));
    expect(ideas).toHaveLength(0);
  });
});
