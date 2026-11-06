import { describe, expect, it, vi } from 'vitest';
import { createOllamaEmbedder, repositoryEmbeddingContent } from '../../src/ingest/embeddings.js';
import { EMBEDDING_DIMENSIONS } from '../../src/db/schema.js';

describe('generación de embeddings con Ollama', () => {
  it('envía el lote al modelo configurado y valida las dimensiones', async () => {
    const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.25);
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ embeddings: [vector] }), { status: 200 }));
    const embed = createOllamaEmbedder({
      baseUrl: 'http://ollama.local/',
      model: 'test-model',
      request,
    });

    await expect(embed(['repo de prueba'])).resolves.toEqual([vector]);
    expect(request).toHaveBeenCalledWith(
      'http://ollama.local/api/embed',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ model: 'test-model', input: ['repo de prueba'] }),
      }),
    );
  });

  it('rechaza respuestas con dimensión incorrecta', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ embeddings: [[0.1, 0.2]] })));
    const embed = createOllamaEmbedder({ request });

    await expect(embed(['repo de prueba'])).rejects.toThrow(
      'Ollama devolvió embeddings inválidos o con dimensión incorrecta',
    );
  });

  it('incluye datos relevantes del repositorio y omite los campos vacíos', () => {
    expect(
      repositoryEmbeddingContent({
        id: 'repo-id',
        fullName: 'acme/tool',
        description: 'Useful tool',
        primaryLanguage: 'TypeScript',
        licenseSpdx: null,
        categories: ['ai', 'search'],
        topics: ['rag'],
      }),
    ).toBe(
      [
        'Repository: acme/tool',
        'Description: Useful tool',
        'Language: TypeScript',
        'Categories: ai, search',
        'Topics: rag',
      ].join('\n'),
    );
  });
});
