'use client';

import { useRouter } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { catalogHref, type CatalogParams } from '@/lib/catalog-url';
import type { RepositorySort } from '@/lib/repositories';

const labels: Record<RepositorySort, string> = {
  relevance: 'Relevancia',
  stars: 'Más stars',
  health: 'Mejor salud',
  updated: 'Más recientes',
};

type Props = {
  sort: RepositorySort;
  hasQuery: boolean;
  params: Omit<CatalogParams, 'sort' | 'page'>;
};

export function SortSelect({ sort, hasQuery, params }: Props) {
  const router = useRouter();
  const items = (Object.keys(labels) as RepositorySort[])
    .filter((value) => value !== 'relevance' || hasQuery)
    .map((value) => ({ value, label: labels[value] }));

  return (
    <Select
      items={items}
      value={sort}
      onValueChange={(value) => {
        if (value) router.push(catalogHref({ ...params, sort: value as RepositorySort }));
      }}
    >
      <SelectTrigger
        aria-label="Ordenar por"
        className="w-40 rounded-md border-border bg-background data-[size=default]:h-9 dark:bg-background dark:hover:bg-muted"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="end">
        {items.map(({ value, label }) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
