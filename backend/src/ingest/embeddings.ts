import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { upsertEmbedding } from '../db/embeddings.js';
import { EMBEDDING_DIMENSIONS, category, repository, repositoryCategory } from '../db/schema.js';

const EMBEDDING_MODEL = 'nomic-embed-text';
const EMBEDDING_BATCH_SIZE = 32;

type EmbedBatch = (inputs: string[]) => Promise<number[][]>;

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
  model = process.env.OLLAMA_EMBEDDING_MODEL ?? EMBEDDING_MODEL,
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

interface RepositoryEmbedding {
  id: string;
  fullName: string;
  description: string | null;
  primaryLanguage: string | null;
  licenseSpdx: string | null;
  topics: string[];
  categories: string[];
}

export function repositoryEmbeddingContent(repositoryData: RepositoryEmbedding): string {
  return [
    `Repository: ${repositoryData.fullName}`,
    repositoryData.description && `Description: ${repositoryData.description}`,
    repositoryData.primaryLanguage && `Language: ${repositoryData.primaryLanguage}`,
    repositoryData.licenseSpdx && `License: ${repositoryData.licenseSpdx}`,
    repositoryData.categories.length > 0 && `Categories: ${repositoryData.categories.join(', ')}`,
    repositoryData.topics.length > 0 && `Topics: ${repositoryData.topics.join(', ')}`,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n');
}

export async function generateRepositoryEmbeddings(
  db: Db,
  embedBatch: EmbedBatch = createOllamaEmbedder(),
): Promise<number> {
  const rows = await db
    .select({
      id: repository.id,
      fullName: repository.fullName,
      description: repository.description,
      primaryLanguage: repository.primaryLanguage,
      licenseSpdx: repository.licenseSpdx,
      topics: repository.topics,
      categorySlug: category.slug,
    })
    .from(repository)
    .leftJoin(repositoryCategory, eq(repositoryCategory.repositoryId, repository.id))
    .leftJoin(category, eq(category.id, repositoryCategory.categoryId));

  const repositories = new Map<string, RepositoryEmbedding>();
  for (const row of rows) {
    let repositoryData = repositories.get(row.id);
    if (!repositoryData) {
      repositoryData = {
        id: row.id,
        fullName: row.fullName,
        description: row.description,
        primaryLanguage: row.primaryLanguage,
        licenseSpdx: row.licenseSpdx,
        topics: row.topics,
        categories: [],
      };
      repositories.set(row.id, repositoryData);
    }
    if (row.categorySlug) repositoryData.categories.push(row.categorySlug);
  }

  const entries = [...repositories.values()];
  for (let start = 0; start < entries.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = entries.slice(start, start + EMBEDDING_BATCH_SIZE);
    const contents = batch.map(repositoryEmbeddingContent);
    const vectors = await embedBatch(contents);
    if (vectors.length !== batch.length) {
      throw new Error('El proveedor devolvió una cantidad de embeddings inesperada');
    }

    for (let index = 0; index < batch.length; index += 1) {
      await upsertEmbedding(db, {
        entityType: 'REPOSITORY',
        entityId: batch[index].id,
        content: contents[index],
        vector: vectors[index],
        model: process.env.OLLAMA_EMBEDDING_MODEL ?? EMBEDDING_MODEL,
      });
    }
  }
  return entries.length;
}
