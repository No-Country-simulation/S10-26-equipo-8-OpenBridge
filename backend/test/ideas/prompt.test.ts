import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import {
  buildIdeaMessages,
  IDEA_PROMPT_VERSION,
  ideasJsonSchema,
  listIdeaPromptVersions,
  loadIdeaPrompt,
} from '../../src/ideas/prompt.js';
import { generatedIdeasSchema } from '../../src/ideas/schema.js';

const prompt = loadIdeaPrompt();

describe.each(listIdeaPromptVersions())('instrucciones %s', (version) => {
  const versioned = loadIdeaPrompt(version);

  it('tiene instrucciones y 3 ejemplos de referencia', () => {
    expect(versioned.system.length).toBeGreaterThan(0);
    expect(versioned.examples).toHaveLength(3);
  });

  it.each(versioned.examples.map((example) => [example.repository.fullName, example]))(
    'el ejemplo de %s cumple el esquema',
    (_name, example) => {
      expect(generatedIdeasSchema.safeParse({ ideas: example.ideas }).success).toBe(true);
    },
  );

  it('los ejemplos cubren webhooks, SDK y Docker', () => {
    const types = new Set(versioned.examples.flatMap((e) => e.ideas.map((i) => i.integrationType)));
    expect([...types]).toEqual(expect.arrayContaining(['WEBHOOK', 'SDK', 'DOCKER']));
  });

  it('algún ejemplo muestra que el fragmento puede quedar en null', () => {
    expect(versioned.examples.some((e) => e.ideas.some((i) => i.snippet === null))).toBe(true);
  });
});

describe('instrucciones v2', () => {
  const v2 = loadIdeaPrompt('v2');

  it('es la versión por defecto', () => {
    expect(IDEA_PROMPT_VERSION).toBe('v2');
    expect(prompt.version).toBe('v2');
  });

  it('cada ejemplo muestra al menos 2 ideas, con tipos de integración distintos', () => {
    for (const example of v2.examples) {
      expect(example.ideas.length).toBeGreaterThanOrEqual(2);
      const types = example.ideas.map((idea) => idea.integrationType);
      expect(new Set(types).size).toBe(types.length);
    }
  });

  it('ningún título de ejemplo se repite entre repos (temas variados)', () => {
    const titles = v2.examples.flatMap((e) => e.ideas.map((i) => i.title));
    expect(new Set(titles).size).toBe(titles.length);
    expect(titles.join(' ')).not.toMatch(/soporte|tickets/i);
  });

  // Si un ejemplo es un repo del catálogo, al generar ideas para ese repo el
  // modelo ve dos README distintos y los mezcla.
  it('ningún ejemplo es un repo del catálogo', () => {
    const seed = parse(
      readFileSync(new URL('../../../seed/repos.yaml', import.meta.url), 'utf-8'),
    ) as { repositories: Array<{ repo: string }> };
    const catalog = new Set(seed.repositories.map(({ repo }) => repo.toLowerCase()));

    const overlapping = v2.examples
      .map((example) => example.repository.fullName)
      .filter((name) => catalog.has(name.toLowerCase()));
    expect(overlapping).toEqual([]);
  });
});

describe('carga de instrucciones', () => {
  it('falla con un mensaje claro si la versión no existe', () => {
    expect(() => loadIdeaPrompt('v99')).toThrow('No existe la versión de prompt "v99"');
  });
});

describe('mensajes para el modelo', () => {
  it('arma los mensajes: instrucciones, ejemplos y al final el repo pedido', () => {
    const messages = buildIdeaMessages(prompt, {
      fullName: 'acme/tool',
      description: 'Una herramienta',
      primaryLanguage: 'Go',
      topics: ['cli'],
      readme: '# Tool\n\nHace cosas.',
    });

    expect(messages[0]).toEqual({ role: 'system', content: prompt.system });
    expect(messages.slice(1, -1).map(({ role }) => role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
      'user',
      'assistant',
    ]);
    expect(JSON.parse(messages[2].content)).toEqual({ ideas: prompt.examples[0].ideas });
    const last = messages.at(-1);
    expect(last?.role).toBe('user');
    expect(last?.content).toContain('acme/tool');
    expect(last?.content).toContain('Hace cosas.');
  });

  it('expone el esquema JSON que recibe el modelo', () => {
    expect(ideasJsonSchema).toMatchObject({
      type: 'object',
      properties: { ideas: { type: 'array', minItems: 1, maxItems: 3 } },
    });
  });

  // Sin topes, el modelo puede enumerar sin fin dentro de una lista.
  it('acota los largos que Ollama fuerza al generar', () => {
    expect(ideasJsonSchema).toMatchObject({
      properties: {
        ideas: {
          items: {
            properties: {
              title: { maxLength: 100 },
              triggers: { maxItems: 5 },
              stackCompatibility: { minItems: 1, maxItems: 5, items: { maxLength: 30 } },
            },
          },
        },
      },
    });
  });

  // Con la salida forzada, el modelo saltea todo campo opcional.
  it('obliga al modelo a escribir el fragmento y los disparadores', () => {
    expect(ideasJsonSchema).toMatchObject({
      properties: {
        ideas: { items: { required: expect.arrayContaining(['snippet', 'triggers']) } },
      },
    });
  });
});
