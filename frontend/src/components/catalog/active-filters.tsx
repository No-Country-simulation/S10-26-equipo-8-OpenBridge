import Link from 'next/link';
import { X } from 'lucide-react';
import { catalogHref, type CatalogParams } from '@/lib/catalog-url';
import type { CatalogFilters, MaintenanceLevel } from '@/lib/repositories';

const maintenanceLabels: Record<MaintenanceLevel, string> = {
  ACTIVE: 'Activo',
  MODERATE: 'Moderado',
  AT_RISK: 'En riesgo',
  ARCHIVED: 'Archivado',
};

type Props = {
  filters: CatalogFilters;
  params: CatalogParams;
};

type Chip = { key: string; label: string; remove: CatalogParams };

export function ActiveFilters({ filters, params }: Props) {
  const { category, language, license, maintenance = [], minStars } = params;
  const chips: Chip[] = [];

  if (category) {
    const label = filters.categories.find((c) => c.value === category)?.label ?? category;
    chips.push({ key: 'category', label, remove: { category: undefined } });
  }
  if (language) chips.push({ key: 'language', label: language, remove: { language: undefined } });
  if (license) chips.push({ key: 'license', label: license, remove: { license: undefined } });
  for (const level of maintenance) {
    chips.push({
      key: level,
      label: maintenanceLabels[level],
      remove: { maintenance: maintenance.filter((m) => m !== level) },
    });
  }
  if (minStars) {
    chips.push({
      key: 'minStars',
      label: `${minStars.toLocaleString('es-AR')}+ stars`,
      remove: { minStars: undefined },
    });
  }

  if (chips.length === 0) return null;

  // Quitar un filtro vuelve a la primera página; la búsqueda y el orden se conservan.
  const hrefWithout = (remove: CatalogParams) =>
    catalogHref({ ...params, ...remove, page: undefined });
  const clearAll = catalogHref({ q: params.q, sort: params.sort, size: params.size });

  return (
    <ul aria-label="Filtros activos" className="flex flex-wrap items-center gap-2">
      {chips.map(({ key, label, remove }) => (
        <li key={key}>
          <Link
            href={hrefWithout(remove)}
            scroll={false}
            aria-label={`Quitar filtro ${label}`}
            className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-muted pr-2 pl-3 text-[13px] font-medium transition-colors hover:bg-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/40"
          >
            {label}
            <X className="size-3.5 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
          </Link>
        </li>
      ))}
      <li>
        <Link
          href={clearAll}
          scroll={false}
          className="rounded-sm px-1 text-[13px] text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/40"
        >
          Limpiar
        </Link>
      </li>
    </ul>
  );
}
