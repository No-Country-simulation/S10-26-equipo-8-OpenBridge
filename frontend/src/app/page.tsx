import Link from 'next/link';
import { Suspense } from 'react';
import { AssistantPanel } from '@/components/assistant-panel';
import { CategoryCard } from '@/components/category-card';
import { CategoryGrid, CategoryGridSkeleton } from '@/components/category-grid';
import {
  FeaturedTools,
  FeaturedToolsHeader,
  FeaturedToolsSkeleton,
} from '@/components/featured-tools';
import { Hero } from '@/components/hero';
import { getCategories } from '@/lib/categories';

async function CategoryList() {
  const categories = await getCategories();

  return (
    <CategoryGrid>
      {categories.map((c) => (
        <CategoryCard key={c.slug} category={c} />
      ))}
    </CategoryGrid>
  );
}

export default function Home() {
  return (
    <main className="flex-1">
      <Hero />
      <div className="mx-auto w-full max-w-300 px-4 py-8 sm:px-8 sm:py-12">
        <div className="mb-10 sm:mb-12">
          <AssistantPanel />
        </div>

        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Categorías</h2>
          <Link href="/catalogo" className="text-sm font-medium text-link">
            Ver catálogo completo →
          </Link>
        </div>

        <Suspense fallback={<CategoryGridSkeleton />}>
          <CategoryList />
        </Suspense>

        <div className="mt-10 sm:mt-12">
          <FeaturedToolsHeader />
          <Suspense fallback={<FeaturedToolsSkeleton />}>
            <FeaturedTools />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
