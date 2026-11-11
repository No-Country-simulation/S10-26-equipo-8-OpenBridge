import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';

describe('GET /health', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('responde 200 cuando la base de datos está accesible', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const res = await request(createApp({ db: { execute } as never })).get('/health');

    expect(execute).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('responde 503 cuando la base de datos no está accesible', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const execute = vi.fn().mockRejectedValue(new Error('database unavailable'));
    const res = await request(createApp({ db: { execute } as never })).get('/health');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'error' });
  });
});

describe('registro de consultas', () => {
  it('registra método, ruta, código, duración e identificador en JSON', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const execute = vi.fn().mockResolvedValue(undefined);
    const res = await request(createApp({ db: { execute } as never })).get('/health?probe=1');

    expect(log).toHaveBeenCalledOnce();
    const entry = JSON.parse(log.mock.calls[0][0] as string);
    expect(entry).toEqual({
      requestId: expect.any(String),
      method: 'GET',
      path: '/health',
      statusCode: 200,
      durationMs: expect.any(Number),
    });
    expect(entry.durationMs).toBeGreaterThanOrEqual(0);
    expect(res.headers['x-request-id']).toBe(entry.requestId);
  });
});

describe('rutas inexistentes', () => {
  it('responden 404 en JSON', async () => {
    const res = await request(createApp({ db: {} as never })).get('/api/v1/nope');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'No existe la ruta GET /api/v1/nope' },
    });
  });
});
