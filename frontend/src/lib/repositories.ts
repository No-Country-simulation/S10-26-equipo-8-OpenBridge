export type MaintenanceLevel = 'ACTIVE' | 'MODERATE' | 'AT_RISK' | 'ARCHIVED';

// Elemento de la lista de GET /api/v1/repositories (contrato v1).
export type Repository = {
  id: string;
  fullName: string;
  name: string;
  description: string | null;
  primaryLanguage: string | null;
  licenseSpdx: string | null;
  stars: number;
  healthScore: number;
  maintenanceLevel: MaintenanceLevel;
  categories: { slug: string; name: string }[];
  lastCommitAt: string;
};

const mockRepositories: Repository[] = [
  {
    id: 'mock-supabase',
    fullName: 'supabase/supabase',
    name: 'supabase',
    description: 'Backend open source sobre Postgres: auth, storage, realtime y APIs.',
    primaryLanguage: 'TypeScript',
    licenseSpdx: 'Apache-2.0',
    stars: 92400,
    healthScore: 94,
    maintenanceLevel: 'ACTIVE',
    categories: [{ slug: 'database', name: 'Base de datos' }],
    lastCommitAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  },
  {
    id: 'mock-keycloak',
    fullName: 'keycloak/keycloak',
    name: 'keycloak',
    description: 'Gestión de identidades y accesos open source, con SSO y federación.',
    primaryLanguage: 'Java',
    licenseSpdx: 'Apache-2.0',
    stars: 24500,
    healthScore: 88,
    maintenanceLevel: 'ACTIVE',
    categories: [{ slug: 'auth', name: 'Autenticación' }],
    lastCommitAt: new Date(Date.now() - 20 * 3_600_000).toISOString(),
  },
  {
    id: 'mock-meilisearch',
    fullName: 'meilisearch/meilisearch',
    name: 'meilisearch',
    description: 'Motor de búsqueda full-text rápido y tolerante a errores de tipeo.',
    primaryLanguage: 'Rust',
    licenseSpdx: 'MIT',
    stars: 47800,
    healthScore: 55,
    maintenanceLevel: 'MODERATE',
    categories: [{ slug: 'search', name: 'Búsqueda' }],
    lastCommitAt: new Date(Date.now() - 12 * 86_400_000).toISOString(),
  },
  {
    id: 'mock-plausible',
    fullName: 'plausible/analytics',
    name: 'analytics',
    description: 'Analítica web simple y respetuosa con la privacidad, alternativa a Google Analytics.',
    primaryLanguage: 'Elixir',
    licenseSpdx: 'AGPL-3.0',
    stars: 19600,
    healthScore: 28,
    maintenanceLevel: 'AT_RISK',
    categories: [{ slug: 'analytics', name: 'Analítica' }],
    lastCommitAt: new Date(Date.now() - 120 * 86_400_000).toISOString(),
  },
  {
    id: 'mock-ollama',
    fullName: 'ollama/ollama',
    name: 'ollama',
    description: 'Ejecutá modelos de lenguaje abiertos en tu propia máquina con una API simple.',
    primaryLanguage: 'Go',
    licenseSpdx: 'MIT',
    stars: 128000,
    healthScore: 91,
    maintenanceLevel: 'ACTIVE',
    categories: [{ slug: 'ai', name: 'IA' }],
    lastCommitAt: new Date(Date.now() - 5 * 3_600_000).toISOString(),
  },
  {
    id: 'mock-sin-licencia',
    fullName: 'acme/payments-kit',
    name: 'payments-kit',
    description: null,
    primaryLanguage: null,
    licenseSpdx: null,
    stars: 340,
    healthScore: 61,
    maintenanceLevel: 'MODERATE',
    categories: [],
    lastCommitAt: new Date(Date.now() - 40 * 86_400_000).toISOString(),
  },
];

// Mientras el backend (OB-22) no esté listo devuelve datos de prueba;
// después se cambia por el fetch a GET /api/v1/repositories.
export async function getRepositories(): Promise<Repository[]> {
  return mockRepositories;
}

// Solo para el catálogo: da más peso a las categorías y permite probar la paginación.
// No entran en getRepositories() para no cambiar los destacados del home.
const catalogOnlyRepositories: Repository[] = [
  {
    id: 'mock-authentik',
    fullName: 'goauthentik/authentik',
    name: 'authentik',
    description: 'Proveedor de identidad con SSO, MFA y flujos de autenticación configurables.',
    primaryLanguage: 'Python',
    licenseSpdx: 'MIT',
    stars: 15200,
    healthScore: 82,
    maintenanceLevel: 'ACTIVE',
    categories: [{ slug: 'auth', name: 'Autenticación' }],
    lastCommitAt: new Date(Date.now() - 8 * 3_600_000).toISOString(),
  },
  {
    id: 'mock-zitadel',
    fullName: 'zitadel/zitadel',
    name: 'zitadel',
    description: 'Gestión de identidades multi-tenant con OIDC, SAML y passkeys.',
    primaryLanguage: 'Go',
    licenseSpdx: 'Apache-2.0',
    stars: 9200,
    healthScore: 79,
    maintenanceLevel: 'ACTIVE',
    categories: [{ slug: 'auth', name: 'Autenticación' }],
    lastCommitAt: new Date(Date.now() - 30 * 3_600_000).toISOString(),
  },
  {
    id: 'mock-kratos',
    fullName: 'ory/kratos',
    name: 'kratos',
    description: 'Servidor de identidad y gestión de usuarios pensado para la nube.',
    primaryLanguage: 'Go',
    licenseSpdx: 'Apache-2.0',
    stars: 11500,
    healthScore: 58,
    maintenanceLevel: 'MODERATE',
    categories: [{ slug: 'auth', name: 'Autenticación' }],
    lastCommitAt: new Date(Date.now() - 25 * 86_400_000).toISOString(),
  },
  {
    id: 'mock-lago',
    fullName: 'getlago/lago',
    name: 'lago',
    description: 'Facturación basada en uso y suscripciones, alternativa abierta a Stripe Billing.',
    primaryLanguage: 'Ruby',
    licenseSpdx: 'AGPL-3.0',
    stars: 7800,
    healthScore: 76,
    maintenanceLevel: 'ACTIVE',
    categories: [{ slug: 'payments', name: 'Pagos' }],
    lastCommitAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  },
  {
    id: 'mock-killbill',
    fullName: 'killbill/killbill',
    name: 'killbill',
    description: 'Plataforma de facturación y pagos recurrentes.',
    primaryLanguage: 'Java',
    licenseSpdx: 'Apache-2.0',
    stars: 4100,
    healthScore: 34,
    maintenanceLevel: 'AT_RISK',
    categories: [{ slug: 'payments', name: 'Pagos' }],
    lastCommitAt: new Date(Date.now() - 95 * 86_400_000).toISOString(),
  },
];

export type Paginated<T> = {
  data: T[];
  meta: { page: number; size: number; total: number; totalPages: number };
};

export type RepositorySort = 'health' | 'stars' | 'updated' | 'relevance';

export type ListParams = {
  category?: string;
  q?: string;
  sort?: RepositorySort;
  page?: number;
  size?: number;
};

export const DEFAULT_PAGE_SIZE = 20;

// Mínimo de caracteres para buscar por texto (contrato v1).
export const MIN_QUERY_LENGTH = 2;

const sorters: Record<
  Exclude<RepositorySort, 'relevance'>,
  (a: Repository, b: Repository) => number
> = {
  health: (a, b) => b.healthScore - a.healthScore,
  stars: (a, b) => b.stars - a.stars,
  updated: (a, b) => b.lastCommitAt.localeCompare(a.lastCommitAt),
};

const searchableText = (r: Repository) =>
  normalize(
    [
      r.fullName,
      r.description ?? '',
      r.primaryLanguage ?? '',
      ...r.categories.map((c) => c.name),
    ].join(' '),
  );

// Relevancia de prueba: pesa más que el texto esté en el nombre que en la descripción.
const relevance = (r: Repository, term: string) =>
  (normalize(r.fullName).includes(term) ? 2 : 0) + (searchableText(r).includes(term) ? 1 : 0);

// Equivale a GET /api/v1/repositories?category=…&q=…&sort=…&page=…&size=… (contrato v1, paginado).
// Hasta que el backend (OB-22) esté listo filtra y ordena los datos de prueba.
export async function listRepositories({
  category,
  q,
  sort = q ? 'relevance' : 'stars',
  page = 1,
  size = DEFAULT_PAGE_SIZE,
}: ListParams = {}): Promise<Paginated<Repository>> {
  const term = normalize((q ?? '').trim());
  const matches = [...mockRepositories, ...catalogOnlyRepositories]
    .filter((r) => !category || r.categories.some((c) => c.slug === category))
    .filter((r) => !term || searchableText(r).includes(term))
    .sort(
      sort === 'relevance'
        ? (a, b) => relevance(b, term) - relevance(a, term) || sorters.stars(a, b)
        : sorters[sort],
    );
  const start = (page - 1) * size;

  return {
    data: matches.slice(start, start + size),
    meta: { page, size, total: matches.length, totalPages: Math.ceil(matches.length / size) },
  };
}

const normalize = (text: string) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export type SearchResult = { data: Repository[]; total: number };

// Equivale a GET /api/v1/repositories?q=…&size=…, con `total` de `meta.total`; hasta que exista
// la búsqueda real (OB-27) filtra los datos de prueba por nombre, descripción y categoría.
export async function searchRepositories(query: string, size = 3): Promise<SearchResult> {
  const term = normalize(query.trim());
  if (!term) return { data: [], total: 0 };

  const matches = mockRepositories.filter((r) =>
    normalize(
      [r.fullName, r.description ?? '', ...r.categories.flatMap((c) => [c.name, c.slug])].join(' '),
    ).includes(term),
  );
  return { data: matches.slice(0, size), total: matches.length };
}

const compactNumber =new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

// 92400 -> "92.4k"
export function formatStars(stars: number) {
  return compactNumber.format(stars).toLowerCase();
}

// ISO 8601 -> "hace 2 h", "hace 12 d", "hace 4 meses"
export function formatLastCommit(iso: string, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  const units = [
    [31_536_000, (n: number) => (n === 1 ? '1 año' : `${n} años`)],
    [2_592_000, (n: number) => (n === 1 ? '1 mes' : `${n} meses`)],
    [86_400, (n: number) => `${n} d`],
    [3_600, (n: number) => `${n} h`],
    [60, (n: number) => `${n} min`],
  ] as const;

  for (const [size, label] of units) {
    if (seconds >= size) return `hace ${label(Math.floor(seconds / size))}`;
  }
  return 'hace un momento';
}
