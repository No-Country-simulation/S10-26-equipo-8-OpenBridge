import { describe, expect, it, vi } from 'vitest';
import {
  createOllamaEmbedder,
  embedQuery,
  embeddingContentHash,
  ideaEmbeddingContent,
  repositoryEmbeddingContent,
} from '../../src/ingest/embeddings.js';
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

  it('manda la clave de Ollama cuando está configurada', async () => {
    const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.25);
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ embeddings: [vector] })));
    const embed = createOllamaEmbedder({ apiKey: 'secreto', request });

    await embed(['repo de prueba']);

    expect(request.mock.calls[0][1]?.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer secreto',
    });
  });

  it('vectoriza las consultas tal cual, sin prefijo (bge-m3 no los usa)', async () => {
    const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.5);
    const embedBatch = vi.fn().mockResolvedValue([vector]);

    await expect(embedQuery('login único para empresas', { embedBatch })).resolves.toEqual(vector);
    expect(embedBatch).toHaveBeenCalledWith(['login único para empresas']);
  });
});

describe('textos a vectorizar', () => {
  it('arma el perfil del repo con sus datos y sus ideas aprobadas, sin campos vacíos', () => {
    expect(
      repositoryEmbeddingContent({
        fullName: 'acme/tool',
        description: 'Useful tool',
        primaryLanguage: 'TypeScript',
        categories: [
          { name: 'IA', description: 'Modelos, orquestación y herramientas de IA' },
          { name: 'Búsqueda', description: null },
        ],
        topics: ['rag'],
        approvedIdeas: [
          { title: 'Buscador de documentos', summary: 'Indexar manuales internos.' },
          { title: 'Asistente de soporte', summary: 'Responder tickets con contexto.' },
        ],
      }),
    ).toBe(
      [
        'Repository: acme/tool',
        'Description: Useful tool',
        'Language: TypeScript',
        'Categories: IA (Modelos, orquestación y herramientas de IA), Búsqueda',
        'Topics: rag',
        'Integration ideas:',
        '- Buscador de documentos: Indexar manuales internos.',
        '- Asistente de soporte: Responder tickets con contexto.',
      ].join('\n'),
    );
  });

  it('omite la sección de ideas cuando el repo no tiene aprobadas', () => {
    expect(
      repositoryEmbeddingContent({
        fullName: 'acme/tool',
        description: null,
        primaryLanguage: null,
        categories: [],
        topics: [],
        approvedIdeas: [],
      }),
    ).toBe('Repository: acme/tool');
  });

  it('limita la cantidad de ideas en el perfil', () => {
    const approvedIdeas = Array.from({ length: 8 }, (_, index) => ({
      title: `Idea ${index}`,
      summary: 'Resumen.',
    }));
    const content = repositoryEmbeddingContent({
      fullName: 'acme/tool',
      description: null,
      primaryLanguage: null,
      categories: [],
      topics: [],
      approvedIdeas,
    });

    expect(content.match(/^- Idea/gm)).toHaveLength(5);
  });

  it('arma el texto de una idea con su repo y tipo de integración', () => {
    expect(
      ideaEmbeddingContent({
        title: 'Buscador de documentos',
        summary: 'Indexar manuales internos.',
        integrationType: 'REST_API',
        repositoryFullName: 'acme/tool',
      }),
    ).toBe(
      [
        'Integration idea: Buscador de documentos',
        'Repository: acme/tool',
        'Integration type: REST_API',
        'Summary: Indexar manuales internos.',
      ].join('\n'),
    );
  });

  it('calcula un hash estable que cambia con el texto o el modelo', () => {
    const hash = embeddingContentHash('bge-m3', 'texto');

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(embeddingContentHash('bge-m3', 'texto')).toBe(hash);
    expect(embeddingContentHash('bge-m3', 'otro texto')).not.toBe(hash);
    expect(embeddingContentHash('otro-modelo', 'texto')).not.toBe(hash);
  });
});
