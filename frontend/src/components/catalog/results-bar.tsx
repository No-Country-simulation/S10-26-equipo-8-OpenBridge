import type { ReactNode } from 'react';
import { SortSelect } from '@/components/catalog/sort-select';
import type { CatalogParams } from '@/lib/catalog-url';
import type { RepositorySort } from '@/lib/repositories';

type Props = {
  total: number;
  sort: RepositorySort;
  hasQuery: boolean;
  params: Omit<CatalogParams, 'sort' | 'page'>;
  // Botón que abre los filtros en pantallas angostas.
  filters?: ReactNode;
};

export function ResultsBar({ total, sort, hasQuery, params, filters }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <p aria-live="polite" className="text-[13px] whitespace-nowrap text-muted-foreground">
        {total} {total === 1 ? 'resultado' : 'resultados'}
      </p>
      <div className="ml-auto flex items-center gap-2">
        <SortSelect sort={sort} hasQuery={hasQuery} params={params} />
        {filters}
      </div>
    </div>
  );
}
