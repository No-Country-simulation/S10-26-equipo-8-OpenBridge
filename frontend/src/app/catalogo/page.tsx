import { notFound } from 'next/navigation';
import { CatalogHeader } from '@/components/catalog/catalog-header';
import { EmptyState } from '@/components/catalog/empty-state';
import { LoadMore } from '@/components/catalog/load-more';
import { RepositoryGrid } from '@/components/catalog/repository-grid';
import { getCategories } from '@/lib/categories';
import { DEFAULT_PAGE_SIZE, listRepositories, type RepositorySort } from '@/lib/repositories';

const SORTS: RepositorySort[] = ['health', 'stars', 'updated'];
const MAX_SIZE = 100;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function positiveInt(value: string | undefined, fallback: number) {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

export default async function CatalogPage({ searchParams }: PageProps<'/catalogo'>) {
  const params = await searchParams;
  const categorySlug = first(params.category);
  const sortParam = first(params.sort);
  const sort = SORTS.find((s) => s === sortParam);
  const page = positiveInt(first(params.page), 1);
  const size = Math.min(positiveInt(first(params.size), DEFAULT_PAGE_SIZE), MAX_SIZE);

  const categories = await getCategories();
  const category = categorySlug ? categories.find((c) => c.slug === categorySlug) : undefined;
  if (categorySlug && !category) notFound();

  // "Cargar más" muestra las páginas 1 a N juntas: equivale a pedir esas N páginas al contrato.
  const { data, meta } = await listRepositories({
    category: categorySlug,
    sort,
    page: 1,
    size: size * page,
  });

  const next = new URLSearchParams();
  if (categorySlug) next.set('category', categorySlug);
  if (sort) next.set('sort', sort);
  if (size !== DEFAULT_PAGE_SIZE) next.set('size', String(size));
  next.set('page', String(page + 1));

  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-300 px-4 py-8 sm:px-8 sm:py-10">
        <CatalogHeader category={category} total={meta.total} />
        <div className="mt-8">
          {data.length === 0 ? (
            <EmptyState scoped={Boolean(category)} />
          ) : (
            <>
              <RepositoryGrid repositories={data} />
              <LoadMore shown={data.length} total={meta.total} nextHref={`/catalogo?${next}`} />
            </>
          )}
        </div>
      </div>
    </main>
  );
}
