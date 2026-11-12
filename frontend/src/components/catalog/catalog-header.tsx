import { CategoryDot } from '@/components/shared/category-dot';
import type { Category } from '@/lib/categories';

export function CatalogHeader({ category, total }: { category?: Category; total: number }) {
  const description = category
    ? category.description
    : 'Todas las herramientas open source curadas, con métricas de GitHub.';

  return (
    <header>
      <h1 className="flex items-center gap-3 text-[32px] leading-10 font-semibold tracking-[-0.02em]">
        {category && <CategoryDot slug={category.slug} className="size-3" />}
        {category ? category.name : 'Catálogo'}
      </h1>
      <p className="mt-2 text-muted-foreground">
        {description && `${description} · `}
        {total} {total === 1 ? 'herramienta' : 'herramientas'}
      </p>
    </header>
  );
}
