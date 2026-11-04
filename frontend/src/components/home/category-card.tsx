import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { CategoryDot } from '@/components/shared/category-dot';
import { Skeleton } from '@/components/ui/skeleton';
import type { Category } from '@/lib/categories';
import { getCategoryStyle } from '@/lib/category-styles';

// Layout compartido con CategoryCardSkeleton para que ambos midan lo mismo.
const layout =
  'flex h-14 items-center gap-3 border-b border-border px-4 last:border-b-0 md:h-24 md:gap-4 md:rounded-lg md:border md:bg-card md:p-5 md:last:border-b';

export function CategoryCard({ category }: { category: Category }) {
  const { icon: Icon, tint, text } = getCategoryStyle(category.slug);

  return (
    <Link
      href={`/catalogo?category=${encodeURIComponent(category.slug)}`}
      className={`group ${layout} hover:bg-muted md:transition-[border-color,box-shadow] md:duration-150 md:hover:border-border-strong md:hover:bg-card md:hover:shadow-sm`}
    >
      <CategoryDot slug={category.slug} className="md:hidden" />
      <span
        className={`hidden size-8 shrink-0 items-center justify-center rounded-md md:flex ${tint} ${text}`}
      >
        <Icon className="size-4" strokeWidth={1.5} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 md:gap-1">
        <div className="flex items-baseline gap-2">
          <h3 className="flex-1 truncate text-sm font-medium text-foreground md:flex-none md:text-base md:font-semibold">
            {category.name}
          </h3>
          <span className="text-[13px] text-muted-foreground tabular">
            {category.repositoryCount}
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground md:text-[13px]">
          {category.description}
        </p>
      </div>
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground md:transition-transform md:duration-150 md:group-hover:translate-x-0.5"
        strokeWidth={1.5}
      />
    </Link>
  );
}

export function CategoryCardSkeleton() {
  return (
    <div className={layout} aria-hidden="true">
      <Skeleton className="size-2 shrink-0 rounded-full md:hidden" />
      <Skeleton className="hidden size-8 shrink-0 md:block" />
      <div className="flex flex-1 flex-col gap-1.5 md:gap-2">
        <Skeleton className="h-3.5 w-28 md:h-4 md:w-32" />
        <Skeleton className="h-3 w-44 md:h-3.5 md:w-56" />
      </div>
    </div>
  );
}
