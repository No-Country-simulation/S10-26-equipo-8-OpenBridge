import { describe, expect, it } from 'vitest';
import { expandSearchQuery } from '../../src/search/query-expansion.js';

describe('expansión de consultas', () => {
  it('agrega sinónimos de autenticación social a consultas en español', () => {
    expect(expandSearchQuery('inicio de sesión con redes sociales')).toBe(
      'inicio de sesión con redes sociales\n' +
        'Autenticación con proveedores de identidad sociales, social login, OAuth 2.0, ' +
        'OpenID Connect, Keycloak, Auth.js y NextAuth.js',
    );
  });

  it('detecta variantes sin depender de mayúsculas ni tildes', () => {
    expect(expandSearchQuery('LOGIN CON GOOGLE')).toContain('Keycloak, Auth.js y NextAuth.js');
  });

  it('mantiene intactas las consultas que no expresan autenticación social', () => {
    expect(expandSearchQuery('motor de búsqueda')).toBe('motor de búsqueda');
  });
});
