function normalizeQuery(query: string): string {
  return query
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function expandSearchQuery(query: string): string {
  const normalized = normalizeQuery(query);
  const isLoginIntent = /\b(inicio de sesion|iniciar sesion|login|autenticacion)\b/.test(
    normalized,
  );
  const mentionsSocialProvider = /\b(redes sociales|social|google|facebook|apple|github)\b/.test(
    normalized,
  );

  if (!isLoginIntent || !mentionsSocialProvider) return query;

  return `${query}\nAutenticación con proveedores de identidad sociales, social login, OAuth 2.0, OpenID Connect, Keycloak, Auth.js y NextAuth.js`;
}
