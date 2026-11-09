import { ChatOllama } from '@langchain/ollama';
import { ollamaConfig } from '../ollama.js';

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

// Una respuesta normal tarda segundos en GPU. Incluye la primera carga del
// modelo en memoria, que puede llevar más de un minuto.
const REQUEST_TIMEOUT_MS = 3 * 60 * 1000;

const LANGCHAIN_ROLES = { system: 'system', user: 'human', assistant: 'ai' } as const;

// ChatOllama ignora el AbortSignal: la solicitud sigue viva en Ollama, pero
// el generador deja de esperarla y pasa al próximo repo. Lo que corta la
// generación en el servidor es numPredict.
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`El modelo no respondió en ${ms / 1000} s`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function createOllamaIdeaModel({
  format,
  baseUrl = ollamaConfig().baseUrl,
  model = process.env.OLLAMA_MODEL ?? 'qwen2.5:7b',
}: OllamaIdeaModelOptions): IdeaModel {
  const chat = new ChatOllama({
    baseUrl,
    model,
    format,
    // La clave del Ollama expuesto, si hay (ver src/ollama.ts).
    headers: ollamaConfig().headers,
    // Ollama usa un contexto chico por defecto y recorta en silencio lo que
    // no entra, empezando por las instrucciones. El prompt ocupa ~6.000
    // tokens; el reintento le suma la respuesta anterior (hasta numPredict) y
    // la corrección, y la salida necesita su lugar. qwen2.5:7b entra en 8 GB
    // de VRAM con este contexto.
    numCtx: 12_288,
    // Con la salida JSON forzada, un modelo chico puede entrar en bucle y no
    // parar nunca. 3 ideas ocupan ~1.000 tokens: si se pasa, la respuesta
    // queda cortada, no valida y el generador reintenta.
    numPredict: 2048,
    temperature: 0.2,
  });

  return {
    name: model,
    complete: async (messages) => {
      const response = await withTimeout(
        chat.invoke(messages.map(({ role, content }) => [LANGCHAIN_ROLES[role], content] as const)),
        REQUEST_TIMEOUT_MS,
      );
      return response.text;
    },
  };
}
