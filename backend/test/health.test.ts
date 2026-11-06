import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('GET /health', () => {
  it('responde 200 con status ok', async () => {
    // /health no toca la base.
    const res = await request(createApp({ db: {} as never })).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
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
