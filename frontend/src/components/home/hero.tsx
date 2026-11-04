import Link from 'next/link';
import { Suspense } from 'react';
import { HeroSearch } from '@/components/home/hero-search';
import { getCategories } from '@/lib/categories';

const popularSearches = [
  'Autenticación con SSO',
  'Búsqueda full-text',
  'Pagos recurrentes',
];

const chipClass =
  'inline-flex h-8 items-center rounded-full px-3.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/40';

// Trama de puntos tenue del hero, difuminada hacia los bordes (como en el flujo de prototipo).
const dotGrid = {
  backgroundImage:
    'radial-gradient(color-mix(in srgb, var(--foreground) var(--dot), transparent) 1px, transparent 1px)',
  backgroundSize: '24px 24px',
  maskImage: 'radial-gradient(ellipse 70% 80% at 50% 30%, #000 30%, transparent 75%)',
  WebkitMaskImage: 'radial-gradient(ellipse 70% 80% at 50% 30%, #000 30%, transparent 75%)',
} as const;

const subtitleClass =
  'dark mt-4 max-w-120 text-base text-muted-foreground md:mt-5 md:py-px md:text-xl md:leading-[30px]';

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

// Banda oscura fija: la clase `dark` en cada pieza del hero le aplica los colores del tema oscuro;
// el panel de resultados queda fuera para seguir el tema de la página.
export function Hero() {
  return (
    <section className="relative border-b border-[#262626] bg-black px-4 pb-26 pt-12 md:pb-33 md:pt-[72px]">
      <div aria-hidden="true" className="dark pointer-events-none absolute inset-0 [--dot:30%]" style={dotGrid} />
      <div className="relative mx-auto flex w-full max-w-225 flex-col items-center text-center">
        <h1 className="dark text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.04em] md:leading-[1.015] text-foreground md:text-6xl lg:text-7xl">
          Encontrá la herramienta open source correcta{' '}
          <span className="text-muted-foreground">en minutos, no en días.</span>
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

        <HeroSearch>
          <nav
            aria-label="Búsquedas populares"
            className="dark mt-5 flex flex-wrap md:mt-4 items-center justify-center gap-2"
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
        </HeroSearch>
      </div>
    </section>
  );
}
