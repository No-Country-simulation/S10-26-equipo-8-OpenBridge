import { vi } from 'vitest';
import { EMBEDDING_DIMENSIONS } from '../../src/db/schema.js';
import type { ChatMessage, CompleteOptions, IdeaModel } from '../../src/ideas/model.js';

// Vector unitario con la similitud coseno pedida respecto de vectorWithSimilarity(1, x):
// el eje 0 lleva la similitud y `axis` el resto, distinto por repo.
export function vectorWithSimilarity(similarity: number, axis: number): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  vector[0] = similarity;
  vector[axis] = Math.sqrt(1 - similarity ** 2);
  return vector;
}

// Modelo falso que devuelve las respuestas en orden y registra los mensajes.
export function fakeModel(...responses: string[]) {
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
