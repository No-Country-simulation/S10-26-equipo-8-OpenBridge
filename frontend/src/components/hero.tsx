import { Suspense } from 'react';
import { HeroSearch } from '@/components/hero-search';
import { getCategories } from '@/lib/categories';

const subtitleClass =
  'mt-4 max-w-120 text-base text-muted-foreground md:mt-5 md:text-xl md:leading-[30px]';

async function HeroSubtitle() {
  const categories = await getCategories();
  const total = categories.reduce((sum, c) => sum + c.repositoryCount, 0);

  return (
    <p className={subtitleClass}>
      {total} herramientas curadas en {categories.length} categorías, con
      métricas de GitHub actualizadas cada día.
    </p>
  );
}

export function Hero() {
  return (
    <section className="border-b border-border bg-black px-4 pb-12 pt-12 md:pb-16 md:pt-[72px]">
      <div className="mx-auto flex w-full max-w-225 flex-col items-center text-center">
        <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.04em] text-foreground md:text-6xl lg:text-7xl">
          Encontrá la herramienta open source correcta en minutos, no en días.
        </h1>

        <Suspense
          fallback={
            <p className={subtitleClass}>
              Herramientas curadas por categoría, con métricas de GitHub
              actualizadas cada día.
            </p>
          }
        >
          <HeroSubtitle />
        </Suspense>

        <HeroSearch />
      </div>
    </section>
  );
}
