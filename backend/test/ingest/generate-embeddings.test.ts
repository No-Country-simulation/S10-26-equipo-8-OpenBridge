import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EMBEDDING_DIMENSIONS,
  category,
  embedding,
  integrationIdea,
  repository,
  repositoryCategory,
} from '../../src/db/schema.js';
import { generateEmbeddings } from '../../src/ingest/embeddings.js';
import { createTestDb, type TestDb } from '../helpers/test-db.js';

const MODEL = 'nomic-embed-text';

// Devuelve un vector fijo por texto y registra lo que recibe.
function fakeEmbedder() {
  return vi.fn(async (inputs: string[]) =>
    inputs.map(() => Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1)),
  );
}

const sentTexts = (embed: ReturnType<typeof fakeEmbedder>) => embed.mock.calls.flat(2);

describe('generación incremental de embeddings', () => {
  let t: TestDb;
  let githubId = 0;

  async function addRepo(fullName: string) {
    githubId += 1;
    const [saved] = await t.db
      .insert(repository)
      .values({
        githubId,
        fullName,
        name: fullName.split('/')[1],
        url: `https://github.com/${fullName}`,
        description: `Descripción de ${fullName}`,
        topics: ['sso'],
      })
      .returning();
    return saved;
  }

  async function addIdea(
    repositoryId: string,
    title: string,
    status: 'DRAFT' | 'APPROVED' | 'REJECTED',
  ) {
    const [saved] = await t.db
      .insert(integrationIdea)
      .values({
        repositoryId,
        title,
        summary: `Resumen de ${title}`,
        integrationType: 'REST_API',
        difficulty: 'LOW',
        status,
        source: 'HUMAN',
      })
      .returning();
    return saved;
  }

  const stored = () =>
    t.db
      .select({
        entityType: embedding.entityType,
        entityId: embedding.entityId,
        content: embedding.content,
        contentHash: embedding.contentHash,
        model: embedding.model,
      })
      .from(embedding);

  beforeAll(async () => {
    t = await createTestDb();
  });

  afterAll(async () => {
    await t?.close();
  });

  beforeEach(async () => {
    await t.db.delete(embedding);
    await t.db.delete(repository);
    await t.db.delete(category);
  });

  it('vectoriza repos e ideas aprobadas con el prefijo search_document', async () => {
    const repo = await addRepo('acme/auth');
    const [auth] = await t.db.insert(category).values({ slug: 'auth', name: 'Auth' }).returning();
    await t.db.insert(repositoryCategory).values({ repositoryId: repo.id, categoryId: auth.id });
    const approved = await addIdea(repo.id, 'Login único', 'APPROVED');
    await addIdea(repo.id, 'Borrador', 'DRAFT');
    await addIdea(repo.id, 'Rechazada', 'REJECTED');
    const embed = fakeEmbedder();

    const report = await generateEmbeddings(t.db, { embedBatch: embed, model: MODEL });

    expect(report).toMatchObject({ generated: 2, skipped: 0, removed: 0, failed: [] });
    const texts = sentTexts(embed);
    expect(texts).toHaveLength(2);
    expect(texts.every((text) => text.startsWith('search_document: '))).toBe(true);
    expect(texts.join('\n')).not.toMatch(/Borrador|Rechazada/);

    const rows = await stored();
    const repoRow = rows.find(({ entityId }) => entityId === repo.id);
    expect(repoRow?.content).toContain('Categories: auth');
    expect(repoRow?.content).toContain('- Login único: Resumen de Login único');
    expect(repoRow?.content.startsWith('search_document:')).toBe(false);
    expect(rows.find(({ entityId }) => entityId === approved.id)).toMatchObject({
      entityType: 'INTEGRATION_IDEA',
      model: MODEL,
      contentHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it('no recalcula los vectores cuyo contenido no cambió', async () => {
    const repo = await addRepo('acme/auth');
    await addIdea(repo.id, 'Login único', 'APPROVED');
    await generateEmbeddings(t.db, { embedBatch: fakeEmbedder(), model: MODEL });
    const embed = fakeEmbedder();

    const report = await generateEmbeddings(t.db, { embedBatch: embed, model: MODEL });

    expect(report).toMatchObject({ generated: 0, skipped: 2, removed: 0 });
    expect(embed).not.toHaveBeenCalled();
  });

  it('regenera el perfil del repo cuando se aprueba una idea nueva', async () => {
    const repo = await addRepo('acme/auth');
    const idea = await addIdea(repo.id, 'Login único', 'DRAFT');
    await generateEmbeddings(t.db, { embedBatch: fakeEmbedder(), model: MODEL });
    await t.db
      .update(integrationIdea)
      .set({ status: 'APPROVED' })
      .where(eq(integrationIdea.id, idea.id));
    const embed = fakeEmbedder();

    const report = await generateEmbeddings(t.db, { embedBatch: embed, model: MODEL });

    expect(report).toMatchObject({ generated: 2, skipped: 0 });
  });

  it('borra el vector de una idea que dejó de estar aprobada', async () => {
    const repo = await addRepo('acme/auth');
    const idea = await addIdea(repo.id, 'Login único', 'APPROVED');
    await generateEmbeddings(t.db, { embedBatch: fakeEmbedder(), model: MODEL });
    await t.db
      .update(integrationIdea)
      .set({ status: 'REJECTED' })
      .where(eq(integrationIdea.id, idea.id));

    const report = await generateEmbeddings(t.db, { embedBatch: fakeEmbedder(), model: MODEL });

    expect(report).toMatchObject({ generated: 1, removed: 1 });
    const rows = await stored();
    expect(rows.map(({ entityId }) => entityId)).toEqual([repo.id]);
    expect(rows[0].content).not.toContain('Login único');
  });

  it('borra los vectores de repos que ya no están en el catálogo', async () => {
    const kept = await addRepo('acme/kept');
    const gone = await addRepo('acme/gone');
    await addIdea(gone.id, 'Idea del repo borrado', 'APPROVED');
    await generateEmbeddings(t.db, { embedBatch: fakeEmbedder(), model: MODEL });
    await t.db.delete(repository).where(eq(repository.id, gone.id));

    const report = await generateEmbeddings(t.db, { embedBatch: fakeEmbedder(), model: MODEL });

    expect(report).toMatchObject({ removed: 2, skipped: 1 });
    expect((await stored()).map(({ entityId }) => entityId)).toEqual([kept.id]);
  });

  it('regenera todo cuando cambia el modelo', async () => {
    const repo = await addRepo('acme/auth');
    await generateEmbeddings(t.db, { embedBatch: fakeEmbedder(), model: MODEL });

    const report = await generateEmbeddings(t.db, {
      embedBatch: fakeEmbedder(),
      model: 'otro-modelo',
    });

    expect(report).toMatchObject({ generated: 1, skipped: 0 });
    expect((await stored()).find(({ entityId }) => entityId === repo.id)?.model).toBe(
      'otro-modelo',
    );
  });

  it('reintenta un lote fallido y sigue con el resto si vuelve a fallar', async () => {
    await addRepo('acme/one');
    await addRepo('acme/two');
    await addRepo('acme/three');
    const ok = fakeEmbedder();
    const embed = vi.fn(async (inputs: string[]) => {
      if (inputs[0].includes('acme/two')) throw new Error('Ollama respondió 500');
      return ok(inputs);
    });

    const report = await generateEmbeddings(t.db, {
      embedBatch: embed,
      model: MODEL,
      batchSize: 1,
      retryDelayMs: 0,
    });

    expect(report.generated).toBe(2);
    expect(report.failed).toEqual([
      {
        entityType: 'REPOSITORY',
        entityId: expect.any(String),
        name: 'acme/two',
        reason: 'Ollama respondió 500',
      },
    ]);
    const callsForTwo = embed.mock.calls.filter(([inputs]) => inputs[0].includes('acme/two'));
    expect(callsForTwo).toHaveLength(2);
  });

  it('se recupera si el reintento funciona', async () => {
    await addRepo('acme/one');
    const ok = fakeEmbedder();
    const embed = vi
      .fn<(inputs: string[]) => Promise<number[][]>>()
      .mockRejectedValueOnce(new Error('Ollama respondió 503'))
      .mockImplementation(ok);

    const report = await generateEmbeddings(t.db, {
      embedBatch: embed,
      model: MODEL,
      retryDelayMs: 0,
    });

    expect(report).toMatchObject({ generated: 1, failed: [] });
    expect(embed).toHaveBeenCalledTimes(2);
  });
});
