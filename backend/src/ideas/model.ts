import { ChatOllama } from '@langchain/ollama';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Lo que el generador necesita del modelo: mensajes de entrada y el texto
// crudo de salida. Validar es cosa del generador, así se puede reintentar
// con el error y registrar la respuesta descartada.
export interface IdeaModel {
  name: string;
  complete: (messages: ChatMessage[]) => Promise<string>;
}

export interface OllamaIdeaModelOptions {
  // Esquema JSON de la respuesta: Ollama restringe la salida a esa forma.
  format: Record<string, unknown>;
  baseUrl?: string;
  model?: string;
}

const LANGCHAIN_ROLES = { system: 'system', user: 'human', assistant: 'ai' } as const;

export function createOllamaIdeaModel({
  format,
  baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
  model = process.env.OLLAMA_MODEL ?? 'qwen2.5:7b',
}: OllamaIdeaModelOptions): IdeaModel {
  const chat = new ChatOllama({
    baseUrl,
    model,
    format,
    // Ollama usa un contexto chico por defecto y recorta en silencio lo que
    // no entra: sin esto, el README llega cortado y el modelo inventa.
    numCtx: 8192,
    temperature: 0.2,
  });

  return {
    name: model,
    complete: async (messages) => {
      const response = await chat.invoke(
        messages.map(({ role, content }) => [LANGCHAIN_ROLES[role], content] as const),
      );
      return response.text;
    },
  };
}
