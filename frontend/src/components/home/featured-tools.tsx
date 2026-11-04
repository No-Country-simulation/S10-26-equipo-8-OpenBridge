import Link from 'next/link';
import { ToolCard, ToolCardSkeleton } from '@/components/shared/tool-card';
import { getRepositories } from '@/lib/repositories';

const FEATURED_SIZE = 6;

const grid = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3';

// Equivale a GET /repositories?sort=health&size=6; el contrato v1 no define un endpoint de destacados.
export async function FeaturedTools() {
  const repositories = await getRepositories();
  const featured = [...repositories]
    .sort((a, b) => b.healthScore - a.healthScore)
    .slice(0, FEATURED_SIZE);

  return (
    <div className={grid}>
      {featured.map((repository) => (
        <ToolCard key={repository.id} repository={repository} />
      ))}
    </div>
  );
}

export function FeaturedToolsSkeleton({ count = FEATURED_SIZE }: { count?: number }) {
  return (
    <div aria-busy="true" className={grid}>
      {Array.from({ length: count }, (_, i) => (
        <ToolCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function FeaturedToolsHeader() {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-lg font-semibold">Destacados</h2>
      <Link href="/catalogo?sort=health" className="text-sm font-medium text-link">
        Ver más →
      </Link>
    </div>
  );
}
