import { afterEach, describe, expect, it, vi } from 'vitest';
import { ollamaConfig } from '../src/ollama.js';

describe('configuración de Ollama', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('por defecto usa el Ollama local, sin clave', () => {
    vi.stubEnv('OLLAMA_BASE_URL', '');
    vi.stubEnv('OLLAMA_API_KEY', '');

    expect(ollamaConfig()).toEqual({ baseUrl: 'http://127.0.0.1:11434', headers: {} });
  });

  it('una dirección vacía cuenta como no configurada', () => {
    vi.stubEnv('OLLAMA_BASE_URL', '   ');

    expect(ollamaConfig().baseUrl).toBe('http://127.0.0.1:11434');
  });

  it('con un Ollama expuesto, usa su dirección y manda la clave', () => {
    vi.stubEnv('OLLAMA_BASE_URL', 'https://ollama.equipo8.example/');
    vi.stubEnv('OLLAMA_API_KEY', 'secreto');

    expect(ollamaConfig()).toEqual({
      baseUrl: 'https://ollama.equipo8.example',
      headers: { Authorization: 'Bearer secreto' },
    });
  });
});
