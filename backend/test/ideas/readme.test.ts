import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanReadme, fetchReadme } from '../../src/ideas/readme.js';

describe('cleanReadme', () => {
  it('saca badges, imágenes, comentarios y etiquetas HTML', () => {
    const readme = [
      '<!-- comentario interno -->',
      '<p align="center"><img src="logo.png" /></p>',
      '[![build](https://ci/badge.svg)](https://ci) ![logo](logo.png)',
      '# Tool',
      '',
      '',
      '',
      'Hace <b>cosas</b> útiles.',
    ].join('\n');

    expect(cleanReadme(readme)).toBe('# Tool\n\nHace cosas útiles.');
  });

  it('no toca el código: genéricos, comparaciones ni enlaces automáticos', () => {
    const readme = [
      'Devuelve `Promise<void>` y acepta <https://ejemplo.com>.',
      '```rust',
      'let items: Vec<String> = vec![];',
      'if a < b && c > d {}',
      '```',
    ].join('\n');

    expect(cleanReadme(readme)).toBe(readme);
  });

  it('cierra un bloque de código que quedó abierto al recortar', () => {
    const readme = ['# Uso', '```bash', 'npm install tool', 'tool run', '```'].join('\n');

    expect(cleanReadme(readme, 30)).toBe('# Uso\n```bash\nnpm install tool\n```');
  });

  it('recorta en un salto de línea sin pasarse del máximo', () => {
    const readme = ['linea uno', 'linea dos', 'linea tres'].join('\n');

    expect(cleanReadme(readme, 22)).toBe('linea uno\nlinea dos');
  });
});

describe('fetchReadme', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('pide el README en crudo con el token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('# Tool', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const readme = await fetchReadme({ owner: 'acme', name: 'tool' }, { token: 'test-token' });

    expect(readme).toBe('# Tool');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.github.com/repos/acme/tool/readme');
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      Accept: 'application/vnd.github.raw+json',
      Authorization: 'Bearer test-token',
    });
  });

  it('devuelve null si el repo no tiene README', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));

    expect(await fetchReadme({ owner: 'acme', name: 'tool' }, { token: 'test-token' })).toBeNull();
  });

  it('falla ante otros errores sin exponer el token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));

    const error = await fetchReadme(
      { owner: 'acme', name: 'tool' },
      { token: 'secret-token' },
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('500');
    expect((error as Error).message).not.toContain('secret-token');
  });
});
