import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { CategoryDot } from '@/components/shared/category-dot';
import type { Category } from '@/lib/categories';

export function CatalogHeader({ category, total }: { category?: Category; total: number }) {
  const description = category
    ? category.description
    : 'Todas las herramientas open source curadas, con métricas de GitHub.';

  return (
    <header>
      {category && (
        <nav aria-label="Ruta" className="mb-3 flex items-center gap-2.5 text-[13px]">
          <Link href="/catalogo" className="text-muted-foreground hover:text-foreground">
            Catálogo
          </Link>
          <ChevronRight className="size-3 text-muted-foreground" aria-hidden="true" />
          <span aria-current="page" className="text-foreground">
            {category.name}
          </span>
        </nav>
      )}
      <h1 className="flex items-center gap-3 text-[32px] leading-10 font-semibold tracking-[-0.02em]">
        {category && <CategoryDot slug={category.slug} className="size-3" />}
        {category ? category.name : 'Catálogo'}
      </h1>
      <p className="mt-2 text-muted-foreground">
        {description} · {total} {total === 1 ? 'herramienta' : 'herramientas'}
      </p>
    </header>
  );
}
