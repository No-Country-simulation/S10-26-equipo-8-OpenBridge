import { SortSelect } from '@/components/catalog/sort-select';
import type { CatalogParams } from '@/lib/catalog-url';
import type { RepositorySort } from '@/lib/repositories';

type Props = {
  total: number;
  sort: RepositorySort;
  hasQuery: boolean;
  params: Omit<CatalogParams, 'sort' | 'page'>;
};

export function ResultsBar({ total, sort, hasQuery, params }: Props) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p aria-live="polite" className="text-[13px] text-muted-foreground">
        {total} {total === 1 ? 'resultado' : 'resultados'}
      </p>
      <SortSelect sort={sort} hasQuery={hasQuery} params={params} />
    </div>
  );
}
