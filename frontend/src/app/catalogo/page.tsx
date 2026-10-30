import { notFound } from 'next/navigation';
import { CatalogHeader } from '@/components/catalog/catalog-header';
import { CatalogSearch } from '@/components/catalog/catalog-search';
import { EmptyState } from '@/components/catalog/empty-state';
import { LoadMore } from '@/components/catalog/load-more';
import { RepositoryGrid } from '@/components/catalog/repository-grid';
import { ResultsBar } from '@/components/catalog/results-bar';
import { catalogHref } from '@/lib/catalog-url';
import { getCategories } from '@/lib/categories';
import {
  DEFAULT_PAGE_SIZE,
  listRepositories,
  MIN_QUERY_LENGTH,
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
  const categorySlug = first(params.category);
  const rawQuery = first(params.q)?.trim() ?? '';
  const q = rawQuery.length >= MIN_QUERY_LENGTH ? rawQuery : undefined;
  const sortParam = SORTS.find((s) => s === first(params.sort));
  // La relevancia solo existe con texto de búsqueda.
  const sort = sortParam === 'relevance' && !q ? undefined : sortParam;
  const page = positiveInt(first(params.page), 1);
  const size = Math.min(positiveInt(first(params.size), DEFAULT_PAGE_SIZE), MAX_SIZE);

  const categories = await getCategories();
  const category = categorySlug ? categories.find((c) => c.slug === categorySlug) : undefined;
  if (categorySlug && !category) notFound();

  // "Cargar más" muestra las páginas 1 a N juntas: equivale a pedir esas N páginas al contrato.
  const [{ data, meta }, { meta: unfiltered }] = await Promise.all([
    listRepositories({ category: categorySlug, q, sort, page: 1, size: size * page }),
    listRepositories({ category: categorySlug, size: 1 }),
  ]);

  const urlParams = {
    category: categorySlug,
    sort,
    size: size !== DEFAULT_PAGE_SIZE ? size : undefined,
  };

  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-300 px-4 py-8 sm:px-8 sm:py-10">
        <CatalogHeader category={category} total={unfiltered.total} />
        <div className="mt-8 flex flex-col gap-4">
          <CatalogSearch
            q={q ?? ''}
            placeholder={category ? `Buscar en ${category.name}…` : 'Buscar herramientas…'}
            params={urlParams}
          />
          <ResultsBar
            total={meta.total}
            sort={sort ?? (q ? 'relevance' : 'stars')}
            hasQuery={Boolean(q)}
            params={{ category: categorySlug, q, size: urlParams.size }}
          />
          {data.length === 0 ? (
            <EmptyState
              scoped={Boolean(category)}
              query={q}
              clearHref={catalogHref({
                category: categorySlug,
                sort: sort === 'relevance' ? undefined : sort,
              })}
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
    </main>
  );
}
