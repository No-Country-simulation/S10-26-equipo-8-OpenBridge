import { CategoryCardSkeleton } from '@/components/category-card';

// Contenedor compartido: lista con borde en mobile, grilla de tarjetas desde md.
export function CategoryGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border md:grid md:grid-cols-2 md:gap-4 md:rounded-none md:border-0 lg:grid-cols-3">
      {children}
    </div>
  );
}

export function CategoryGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div aria-busy="true">
      <CategoryGrid>
        {Array.from({ length: count }, (_, i) => (
          <CategoryCardSkeleton key={i} />
        ))}
      </CategoryGrid>
    </div>
  );
}
