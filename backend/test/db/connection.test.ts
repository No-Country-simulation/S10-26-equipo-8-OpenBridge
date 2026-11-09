import { describe, expect, it } from 'vitest';
import { getDatabaseUrl } from '../../src/db/connection.js';

describe('getDatabaseUrl', () => {
  it('prefers DATABASE_URL when it is configured', () => {
    const url = getDatabaseUrl({
      DATABASE_URL: 'postgresql://user:password@database:5432/catalog',
      DB_HOST: 'localhost',
      DB_USER: 'local-user',
      DB_NAME: 'local-db',
    });

    expect(url).toBe('postgresql://user:password@database:5432/catalog');
  });

  it('builds a connection URL from separate database settings', () => {
    const url = getDatabaseUrl({
      DB_HOST: 'localhost',
      DB_USER: 'open bridge',
      DB_PASSWORD: 'pass@word',
      DB_NAME: 'catalog',
      DB_PORT: '5433',
    });

    expect(url).toBe('postgresql://open%20bridge:pass%40word@localhost:5433/catalog');
  });

  it('returns undefined when required database settings are missing', () => {
    expect(getDatabaseUrl({ DB_HOST: 'localhost', DB_USER: 'openbridge' })).toBeUndefined();
  });
});
