import type { RepositorySort } from '@/lib/repositories';

export type CatalogParams = {
  category?: string;
  q?: string;
  sort?: RepositorySort;
  size?: number;
  page?: number;
};

// Arma la URL del catálogo; los parámetros vacíos no se incluyen.
export function catalogHref({ category, q, sort, size, page }: CatalogParams = {}) {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (q) params.set('q', q);
  if (sort) params.set('sort', sort);
  if (size) params.set('size', String(size));
  if (page && page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `/catalogo?${query}` : '/catalogo';
}
