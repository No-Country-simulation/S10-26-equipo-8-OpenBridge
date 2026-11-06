import { createHash } from 'node:crypto';
import { and, asc, eq, notExists, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { upsertEmbedding, type EmbeddingEntityType } from '../db/embeddings.js';
import {
  EMBEDDING_DIMENSIONS,
  category,
  embedding,
  integrationIdea,
  repository,
  repositoryCategory,
} from '../db/schema.js';

// bge-m3: multilingüe (las consultas llegan en español y los README en
// inglés) y sin prefijos de tarea; documentos y consultas se envían tal cual.
// Se eligió sobre nomic-embed-text comparando el top 5 en consultas reales
// (ver PR de OB-12). Cambiarlo exige migrar EMBEDDING_DIMENSIONS.
const DEFAULT_EMBEDDING_MODEL = 'bge-m3';
const DEFAULT_BATCH_SIZE = 32;
const DEFAULT_RETRY_DELAY_MS = 2000;
// Tope de ideas aprobadas en el perfil de un repo: más diluye su significado.
const MAX_PROFILE_IDEAS = 5;

export type EmbedBatch = (inputs: string[]) => Promise<number[][]>;

export const embeddingModel = () => process.env.OLLAMA_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;

interface OllamaEmbedResponse {
  embeddings: number[][];
}

function isEmbedResponse(value: unknown): value is OllamaEmbedResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'embeddings' in value &&
    Array.isArray(value.embeddings) &&
    value.embeddings.every(
      (vector) =>
        Array.isArray(vector) &&
        vector.length === EMBEDDING_DIMENSIONS &&
        vector.every((component) => typeof component === 'number' && Number.isFinite(component)),
    )
  );
}

export function createOllamaEmbedder({
  baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
  model = embeddingModel(),
  request = fetch,
}: {
  baseUrl?: string;
  model?: string;
  request?: typeof fetch;
} = {}): EmbedBatch {
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/api/embed`;

  return async (inputs) => {
    let response: Response;
    try {
      response = await request(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input: inputs }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`No se pudo conectar con Ollama: ${message}`, { cause: error });
    }

    if (!response.ok) throw new Error(`Ollama respondió ${response.status}`);

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error('Ollama devolvió una respuesta de embeddings ilegible');
    }
    if (!isEmbedResponse(payload)) {
      throw new Error('Ollama devolvió embeddings inválidos o con dimensión incorrecta');
    }
    if (payload.embeddings.length !== inputs.length) {
      throw new Error('Ollama devolvió una cantidad de embeddings inesperada');
    }
    return payload.embeddings;
  };
}

// Vector de una consulta del asistente (OB-32), comparable con los guardados.
export async function embedQuery(
  text: string,
  { embedBatch = createOllamaEmbedder() }: { embedBatch?: EmbedBatch } = {},
): Promise<number[]> {
  const [vector] = await embedBatch([text]);
  return vector;
}

export interface RepositoryProfile {
  fullName: string;
  description: string | null;
  primaryLanguage: string | null;
  // Nombre y descripción en español: le dan al perfil las palabras con las
  // que se busca, que la descripción de GitHub suele no tener.
  categories: { name: string; description: string | null }[];
  topics: string[];
  approvedIdeas: { title: string; summary: string }[];
}

export function repositoryEmbeddingContent(profile: RepositoryProfile): string {
  const ideas = profile.approvedIdeas.slice(0, MAX_PROFILE_IDEAS);
  return [
    `Repository: ${profile.fullName}`,
    profile.description && `Description: ${profile.description}`,
    profile.primaryLanguage && `Language: ${profile.primaryLanguage}`,
    profile.categories.length > 0 &&
      `Categories: ${profile.categories
        .map(({ name, description }) => (description ? `${name} (${description})` : name))
        .join(', ')}`,
    profile.topics.length > 0 && `Topics: ${profile.topics.join(', ')}`,
    ideas.length > 0 && 'Integration ideas:',
    ...ideas.map(({ title, summary }) => `- ${title}: ${summary}`),
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n');
}

export function ideaEmbeddingContent(idea: {
  title: string;
  summary: string;
  integrationType: string;
  repositoryFullName: string;
}): string {
  return [
    `Integration idea: ${idea.title}`,
    `Repository: ${idea.repositoryFullName}`,
    `Integration type: ${idea.integrationType}`,
    `Summary: ${idea.summary}`,
  ].join('\n');
}

export function embeddingContentHash(model: string, text: string): string {
  return createHash('sha256').update(`${model}\n${text}`).digest('hex');
}

interface EmbeddingEntry {
  entityType: EmbeddingEntityType;
  entityId: string;
  name: string;
  content: string;
}

export interface EmbeddingFailure {
  entityType: EmbeddingEntityType;
  entityId: string;
  name: string;
  reason: string;
}

export interface EmbeddingReport {
  generated: number;
  skipped: number;
  removed: number;
  failed: EmbeddingFailure[];
}

export interface GenerateEmbeddingsOptions {
  embedBatch?: EmbedBatch;
  model?: string;
  batchSize?: number;
  retryDelayMs?: number;
}

function groupByRepository<T extends { repositoryId: string }>(rows: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(row.repositoryId);
    if (group) group.push(row);
    else groups.set(row.repositoryId, [row]);
  }
  return groups;
}

// Repos del catálogo e ideas aprobadas, con el texto que representa a cada uno.
async function loadEntries(db: Db): Promise<EmbeddingEntry[]> {
  const repositories = await db
    .select({
      id: repository.id,
      fullName: repository.fullName,
      description: repository.description,
      primaryLanguage: repository.primaryLanguage,
      topics: repository.topics,
    })
    .from(repository)
    .orderBy(asc(repository.fullName), asc(repository.id));

  const categories = await db
    .select({
      repositoryId: repositoryCategory.repositoryId,
      name: category.name,
      description: category.description,
    })
    .from(repositoryCategory)
    .innerJoin(category, eq(category.id, repositoryCategory.categoryId))
    .orderBy(asc(category.slug));

  const ideas = await db
    .select({
      id: integrationIdea.id,
      repositoryId: integrationIdea.repositoryId,
      title: integrationIdea.title,
      summary: integrationIdea.summary,
      integrationType: integrationIdea.integrationType,
    })
    .from(integrationIdea)
    .where(eq(integrationIdea.status, 'APPROVED'))
    .orderBy(asc(integrationIdea.createdAt), asc(integrationIdea.id));

  const categoriesByRepo = groupByRepository(categories);
  const ideasByRepo = groupByRepository(ideas);
  const fullNames = new Map(repositories.map(({ id, fullName }) => [id, fullName]));

  const repositoryEntries = repositories.map((repo): EmbeddingEntry => ({
    entityType: 'REPOSITORY',
    entityId: repo.id,
    name: repo.fullName,
    content: repositoryEmbeddingContent({
      fullName: repo.fullName,
      description: repo.description,
      primaryLanguage: repo.primaryLanguage,
      topics: repo.topics,
      categories: categoriesByRepo.get(repo.id) ?? [],
      approvedIdeas: ideasByRepo.get(repo.id) ?? [],
    }),
  }));

  const ideaEntries = ideas.map((idea): EmbeddingEntry => ({
    entityType: 'INTEGRATION_IDEA',
    entityId: idea.id,
    name: idea.title,
    content: ideaEmbeddingContent({
      ...idea,
      repositoryFullName: fullNames.get(idea.repositoryId) ?? '',
    }),
  }));

  return [...repositoryEntries, ...ideaEntries];
}

// entity_id no tiene FK: los vectores de repos borrados o de ideas que ya no
// están aprobadas se limpian acá para que la búsqueda no los devuelva.
async function removeStaleEmbeddings(db: Db): Promise<number> {
  const staleRepositories = and(
    eq(embedding.entityType, 'REPOSITORY'),
    notExists(
      db
        .select({ one: sql`1` })
        .from(repository)
        .where(eq(repository.id, embedding.entityId)),
    ),
  );
  const staleIdeas = and(
    eq(embedding.entityType, 'INTEGRATION_IDEA'),
    notExists(
      db
        .select({ one: sql`1` })
        .from(integrationIdea)
        .where(
          and(eq(integrationIdea.id, embedding.entityId), eq(integrationIdea.status, 'APPROVED')),
        ),
    ),
  );
  const removed = await db
    .delete(embedding)
    .where(sql`${staleRepositories} OR ${staleIdeas}`)
    .returning({ id: embedding.id });
  return removed.length;
}

async function embedWithRetry(
  embedBatch: EmbedBatch,
  inputs: string[],
  retryDelayMs: number,
): Promise<number[][]> {
  const attempt = async () => {
    const vectors = await embedBatch(inputs);
    if (vectors.length !== inputs.length) {
      throw new Error('El proveedor devolvió una cantidad de embeddings inesperada');
    }
    return vectors;
  };
  try {
    return await attempt();
  } catch {
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    return attempt();
  }
}

// Resumen para la consola (y el log de GitHub Actions), con cada fallo.
export function formatEmbeddingReport(report: EmbeddingReport): string {
  return [
    `Embeddings: ${report.generated} generados, ${report.skipped} sin cambios, ` +
      `${report.removed} eliminados, ${report.failed.length} fallidos.`,
    ...report.failed.map(({ entityType, name, reason }) => `  ✗ ${entityType} ${name}: ${reason}`),
  ].join('\n');
}

const entityKey = (entityType: string, entityId: string) => `${entityType}:${entityId}`;

// Genera los vectores de repos e ideas aprobadas. Solo llama al proveedor
// para lo que cambió (texto o modelo). Un lote que falla dos veces queda en
// `failed` y la ejecución sigue con el próximo.
export async function generateEmbeddings(
  db: Db,
  {
    embedBatch = createOllamaEmbedder(),
    model = embeddingModel(),
    batchSize = DEFAULT_BATCH_SIZE,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  }: GenerateEmbeddingsOptions = {},
): Promise<EmbeddingReport> {
  const removed = await removeStaleEmbeddings(db);
  const entries = await loadEntries(db);

  const existing = await db
    .select({
      entityType: embedding.entityType,
      entityId: embedding.entityId,
      contentHash: embedding.contentHash,
    })
    .from(embedding);
  const storedHashes = new Map(
    existing.map(({ entityType, entityId, contentHash }) => [
      entityKey(entityType, entityId),
      contentHash,
    ]),
  );

  const pending = entries
    .map((entry) => ({ ...entry, contentHash: embeddingContentHash(model, entry.content) }))
    .filter(
      ({ entityType, entityId, contentHash }) =>
        storedHashes.get(entityKey(entityType, entityId)) !== contentHash,
    );

  const report: EmbeddingReport = {
    generated: 0,
    skipped: entries.length - pending.length,
    removed,
    failed: [],
  };

  for (let start = 0; start < pending.length; start += batchSize) {
    const batch = pending.slice(start, start + batchSize);
    let vectors: number[][];
    try {
      vectors = await embedWithRetry(
        embedBatch,
        batch.map(({ content }) => content),
        retryDelayMs,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      report.failed.push(
        ...batch.map(({ entityType, entityId, name }) => ({ entityType, entityId, name, reason })),
      );
      continue;
    }

    for (const [index, entry] of batch.entries()) {
      await upsertEmbedding(db, {
        entityType: entry.entityType,
        entityId: entry.entityId,
        content: entry.content,
        contentHash: entry.contentHash,
        vector: vectors[index],
        model,
      });
    }
    report.generated += batch.length;
  }

  return report;
}
