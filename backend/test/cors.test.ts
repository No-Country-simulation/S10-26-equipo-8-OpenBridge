import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { parseAllowedOrigins } from '../src/cors.js';

const FRONT = 'https://openbridge.vercel.app';

// /health hace un `select 1` (OB-42): una base que siempre responde alcanza
// para probar los encabezados.
const db = { execute: async () => [] } as never;
const app = (allowedOrigins = [FRONT, 'https://openbridge-*-equipo-8.vercel.app']) =>
  createApp({ db, allowedOrigins });

describe('orígenes permitidos (CORS)', () => {
  it('permite el origen de la interfaz', async () => {
    const res = await request(app()).get('/health').set('Origin', FRONT);

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(FRONT);
    expect(res.headers.vary).toContain('Origin');
  });

  it('rechaza con 403 un origen distinto al de la interfaz', async () => {
    const res = await request(app()).get('/api/v1/filters').set('Origin', 'https://evil.example');

    expect(res.status).toBe(403);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.body).toEqual({
      error: {
        code: 'ORIGIN_NOT_ALLOWED',
        message: 'El origen https://evil.example no tiene permitido usar la API',
      },
    });
  });

  it('acepta las direcciones de prueba con comodín, pero solo en ese segmento', async () => {
    const preview = 'https://openbridge-git-feature-x-equipo-8.vercel.app';
    const ok = await request(app()).get('/health').set('Origin', preview);
    expect(ok.status).toBe(200);
    expect(ok.headers['access-control-allow-origin']).toBe(preview);

    for (const origin of [
      'https://openbridge-x.evil.example/-equipo-8.vercel.app',
      'https://openbridge-a.b-equipo-8.vercel.app',
      'http://openbridge-x-equipo-8.vercel.app',
    ]) {
      const res = await request(app()).get('/health').set('Origin', origin);
      expect(res.status, origin).toBe(403);
    }
  });

  it('responde la verificación previa (preflight) del navegador', async () => {
    const res = await request(app())
      .options('/api/v1/search')
      .set('Origin', FRONT)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(FRONT);
    expect(res.headers['access-control-allow-methods']).toBe('GET, POST, OPTIONS');
    expect(res.headers['access-control-allow-headers']).toBe('Content-Type, Accept');
  });

  it('rechaza la verificación previa de un origen no permitido, sin encabezados CORS', async () => {
    const res = await request(app())
      .options('/api/v1/search')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');

    expect(res.status).toBe(403);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['access-control-allow-methods']).toBeUndefined();
  });

  it('deja que la interfaz lea Retry-After (lo usa ante un 429)', async () => {
    const res = await request(app()).get('/health').set('Origin', FRONT);

    expect(res.headers['access-control-expose-headers']).toBe('Retry-After');
  });

  it('varía por Origin también cuando no viene, para que un caché no mezcle respuestas', async () => {
    const res = await request(app()).get('/health');

    expect(res.headers.vary).toContain('Origin');
  });

  it('no exige origen a las consultas sin navegador (health check, curl, GitHub Actions)', async () => {
    const res = await request(app()).get('/health');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('parseAllowedOrigins', () => {
  it('lee la lista separada por comas, sin espacios ni barra final', () => {
    expect(parseAllowedOrigins(` ${FRONT}/ , http://localhost:3000,,`)).toEqual([
      FRONT,
      'http://localhost:3000',
    ]);
  });

  it('sin la variable, permite solo la interfaz local', () => {
    expect(parseAllowedOrigins(undefined)).toEqual(['http://localhost:3000']);
    expect(parseAllowedOrigins('  ')).toEqual(['http://localhost:3000']);
  });
});
