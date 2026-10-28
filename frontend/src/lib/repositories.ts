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

const compactNumber = new Intl.NumberFormat('en', {
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
