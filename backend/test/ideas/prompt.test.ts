import { describe, expect, it } from 'vitest';
import { buildIdeaMessages, ideasJsonSchema, loadIdeaPrompt } from '../../src/ideas/prompt.js';
import { generatedIdeasSchema } from '../../src/ideas/schema.js';

const prompt = loadIdeaPrompt();

describe('instrucciones del generador de ideas', () => {
  it('carga la versión v1 con 3 ejemplos de referencia', () => {
    expect(prompt.version).toBe('v1');
    expect(prompt.system).toContain('de 1 a 3 ideas');
    expect(prompt.examples).toHaveLength(3);
  });

  it.each(prompt.examples.map((example) => [example.repository.fullName, example]))(
    'el ejemplo de %s cumple el esquema',
    (_name, example) => {
      expect(generatedIdeasSchema.safeParse({ ideas: example.ideas }).success).toBe(true);
    },
  );

  it('los ejemplos cubren webhooks, SDK y Docker', () => {
    const types = new Set(prompt.examples.flatMap((e) => e.ideas.map((i) => i.integrationType)));
    expect([...types]).toEqual(expect.arrayContaining(['WEBHOOK', 'SDK', 'DOCKER']));
  });

  it('algún ejemplo muestra que el fragmento puede quedar en null', () => {
    expect(prompt.examples.some((e) => e.ideas.some((i) => i.snippet === null))).toBe(true);
  });

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
});
