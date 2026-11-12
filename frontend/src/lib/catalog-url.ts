import type { MaintenanceLevel, RepositorySort } from '@/lib/repositories';

export type CatalogParams = {
  category?: string;
  language?: string;
  license?: string;
  maintenance?: MaintenanceLevel[];
  minStars?: number;
  q?: string;
  sort?: RepositorySort;
  size?: number;
  page?: number;
};

// Arma la URL del catálogo; los parámetros vacíos no se incluyen.
export function catalogHref({
  category,
  language,
  license,
  maintenance,
  minStars,
  q,
  sort,
  size,
  page,
}: CatalogParams = {}) {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (language) params.set('language', language);
  if (license) params.set('license', license);
  if (maintenance?.length) params.set('maintenance', maintenance.join(','));
  if (minStars) params.set('minStars', String(minStars));
  if (q) params.set('q', q);
  if (sort) params.set('sort', sort);
  if (size) params.set('size', String(size));
  if (page && page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `/catalogo?${query}` : '/catalogo';
}
