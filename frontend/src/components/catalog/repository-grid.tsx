import { ToolCard, ToolCardSkeleton } from '@/components/shared/tool-card';
import type { Repository } from '@/lib/repositories';

const grid = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3';

export function RepositoryGrid({ repositories }: { repositories: Repository[] }) {
  return (
    <ul className={grid}>
      {repositories.map((repository) => (
        <li key={repository.id} className="flex">
          <div className="flex w-full flex-col [&>a]:flex-1">
            <ToolCard repository={repository} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function RepositoryGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div aria-busy="true" className={grid}>
      {Array.from({ length: count }, (_, i) => (
        <ToolCardSkeleton key={i} />
      ))}
    </div>
  );
}
