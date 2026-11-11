// Dónde está Ollama y cómo autenticarse. En local corre en la misma máquina
// sin clave. En producción (Render no tiene GPU) el servidor usa un Ollama
// expuesto por el equipo detrás de un proxy que exige la clave: Ollama no
// tiene autenticación propia (ver docs/deploy.md).
const LOCAL_OLLAMA = 'http://127.0.0.1:11434';

export interface OllamaConfig {
  baseUrl: string;
  headers: Record<string, string>;
}

export function ollamaConfig(): OllamaConfig {
  const baseUrl = process.env.OLLAMA_BASE_URL?.trim() || LOCAL_OLLAMA;
  const apiKey = process.env.OLLAMA_API_KEY?.trim();
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    headers: authHeaders(apiKey),
  };
}

export const authHeaders = (apiKey: string | undefined): Record<string, string> =>
  apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
