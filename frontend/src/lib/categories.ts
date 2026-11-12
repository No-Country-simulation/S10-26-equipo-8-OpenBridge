import { apiFetch, isApiEnabled } from '@/lib/api';

// Forma de GET /api/v1/categories (Contrato de API v1, OB-21).
export type Category = {
  id: string;
  slug: string;
  name: string;
  // null si la categoría no tiene descripción (GET /api/v1/categories).
  description: string | null;
  repositoryCount: number;
};

const mockCategories: Category[] = [
  {
    id: 'mock-auth',
    slug: 'auth',
    name: 'Autenticación',
    description: 'Login, SSO y gestión de identidades',
    repositoryCount: 27,
  },
  {
    id: 'mock-database',
    slug: 'database',
    name: 'Base de datos',
    description: 'Motores, backends y ORMs',
    repositoryCount: 25,
  },
  {
    id: 'mock-payments',
    slug: 'payments',
    name: 'Pagos',
    description: 'Cobros, suscripciones y facturación',
    repositoryCount: 25,
  },
  {
    id: 'mock-ai',
    slug: 'ai',
    name: 'IA',
    description: 'Modelos, RAG y orquestación',
    repositoryCount: 25,
  },
  {
    id: 'mock-analytics',
    slug: 'analytics',
    name: 'Analítica',
    description: 'Métricas de producto y eventos',
    repositoryCount: 31,
  },
  {
    id: 'mock-search',
    slug: 'search',
    name: 'Búsqueda',
    description: 'Motores de texto y búsqueda semántica',
    repositoryCount: 21,
  },
];

// GET /api/v1/categories. Sin NEXT_PUBLIC_API_URL devuelve datos de prueba.
export async function getCategories(): Promise<Category[]> {
  if (!isApiEnabled) return mockCategories;
  const { data } = await apiFetch<{ data: Category[] }>('/categories', {
    next: { revalidate: 300 },
  });
  return data;
}
