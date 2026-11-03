import { ActiveFilters } from '@/components/catalog/active-filters';
import { CatalogHeader } from '@/components/catalog/catalog-header';
import { CatalogSearch } from '@/components/catalog/catalog-search';
import { EmptyState } from '@/components/catalog/empty-state';
import { FiltersPanel } from '@/components/catalog/filters-panel';
import { LoadMore } from '@/components/catalog/load-more';
import { RepositoryGrid } from '@/components/catalog/repository-grid';
import { ResultsBar } from '@/components/catalog/results-bar';
import { catalogHref } from '@/lib/catalog-url';
import { getCategories } from '@/lib/categories';
import {
  DEFAULT_PAGE_SIZE,
  getFilters,
  listRepositories,
  MAINTENANCE_LEVELS,
  MIN_QUERY_LENGTH,
  type MaintenanceLevel,
  type RepositorySort,
} from '@/lib/repositories';

const SORTS: RepositorySort[] = ['relevance', 'health', 'stars', 'updated'];
const MAX_SIZE = 100;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function positiveInt(value: string | undefined, fallback: number) {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

export default async function CatalogPage({ searchParams }: PageProps<'/catalogo'>) {
  const params = await searchParams;
  const rawQuery = first(params.q)?.trim() ?? '';
  const q = rawQuery.length >= MIN_QUERY_LENGTH ? rawQuery : undefined;
  const sortParam = SORTS.find((s) => s === first(params.sort));
  // La relevancia solo existe con texto de búsqueda.
  const sort = sortParam === 'relevance' && !q ? undefined : sortParam;
  const page = positiveInt(first(params.page), 1);
  const size = Math.min(positiveInt(first(params.size), DEFAULT_PAGE_SIZE), MAX_SIZE);

  const maintenance = (first(params.maintenance) ?? '')
    .split(',')
    .filter((m): m is MaintenanceLevel => MAINTENANCE_LEVELS.includes(m as MaintenanceLevel));
  const minStars = positiveInt(first(params.minStars), 0) || undefined;

  const [categories, filters] = await Promise.all([getCategories(), getFilters()]);
  // Los valores que no existen en las opciones se ignoran, así una URL vieja o mal escrita no rompe.
  const category = categories.find((c) => c.slug === first(params.category));
  const categorySlug = category?.slug;
  const language = filters.languages.find((o) => o.value === first(params.language))?.value;
  const license = filters.licenses.find((o) => o.value === first(params.license))?.value;

  const filterParams = { category: categorySlug, language, license, maintenance, minStars };
  const hasFilters = Boolean(language || license || maintenance.length || minStars);

  // "Cargar más" muestra las páginas 1 a N juntas: equivale a pedir esas N páginas al contrato.
  const [{ data, meta }, { meta: unfiltered }] = await Promise.all([
    listRepositories({ ...filterParams, q, sort, page: 1, size: size * page }),
    listRepositories({ category: categorySlug, size: 1 }),
  ]);

  const urlParams = {
    ...filterParams,
    sort,
    size: size !== DEFAULT_PAGE_SIZE ? size : undefined,
  };

  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-300 px-4 py-8 sm:px-8 sm:py-10">
        <CatalogHeader category={category} total={unfiltered.total} />
        <div className="mt-8 grid gap-8 lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-10">
          <aside className="hidden lg:block">
            <FiltersPanel filters={filters} params={{ ...urlParams, q }} />
          </aside>
          <div className="flex min-w-0 flex-col gap-4">
            <CatalogSearch
              q={q ?? ''}
              placeholder={category ? `Buscar en ${category.name}…` : 'Buscar herramientas…'}
              params={urlParams}
            />
            <ResultsBar
              total={meta.total}
              sort={sort ?? (q ? 'relevance' : 'stars')}
              hasQuery={Boolean(q)}
              params={{ ...filterParams, q, size: urlParams.size }}
            />
            <ActiveFilters filters={filters} params={{ ...urlParams, q }} />
            {data.length === 0 ? (
              <EmptyState
                scoped={Boolean(category)}
                filtered={hasFilters}
                query={q}
                clearHref={
                  hasFilters
                    ? catalogHref({ q, sort, size: urlParams.size })
                    : catalogHref({
                        category: categorySlug,
                        sort: sort === 'relevance' ? undefined : sort,
                      })
                }
              />
            ) : (
              <>
                <RepositoryGrid repositories={data} />
                <LoadMore
                  shown={data.length}
                  total={meta.total}
                  nextHref={catalogHref({ ...urlParams, q, page: page + 1 })}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
