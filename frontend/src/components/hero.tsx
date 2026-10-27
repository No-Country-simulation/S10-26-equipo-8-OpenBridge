import Link from 'next/link';
import { Suspense } from 'react';
import { HeroSearch } from '@/components/hero-search';
import { getCategories } from '@/lib/categories';

const popularSearches = [
  'Autenticación con SSO',
  'Búsqueda full-text',
  'Pagos recurrentes',
];

const chipClass =
  'inline-flex h-8 items-center rounded-full px-3.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/40';

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

        <nav
          aria-label="Búsquedas populares"
          className="mt-5 flex flex-wrap items-center justify-center gap-2"
        >
          <span className="text-[13px] text-muted-foreground">Populares:</span>
          {popularSearches.map((term, i) => (
            <Link
              key={term}
              href={`/catalogo?q=${encodeURIComponent(term)}`}
              className={
                i === 0
                  ? `${chipClass} bg-primary text-primary-foreground hover:bg-primary/90`
                  : `${chipClass} border border-border bg-muted text-foreground hover:border-border-strong`
              }
            >
              {term}
            </Link>
          ))}
        </nav>
      </div>
    </section>
  );
}
