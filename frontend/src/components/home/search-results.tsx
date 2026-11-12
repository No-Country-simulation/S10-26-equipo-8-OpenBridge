import Link from 'next/link';
import { Star } from 'lucide-react';
import { CategoryDot } from '@/components/shared/category-dot';
import { HealthBadge } from '@/components/shared/health-badge';
import { LicenseBadge } from '@/components/shared/license-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatStars, type Repository } from '@/lib/repositories';

export type SearchStatus = 'idle' | 'loading' | 'results' | 'empty' | 'error';

type Props = {
  id: string;
  query: string;
  status: SearchStatus;
  results: Repository[];
  total: number;
  activeIndex: number;
  onNavigate: () => void;
};

const panel =
  'absolute inset-x-0 top-full z-20 mt-3 overflow-hidden md:mt-6 lg:-inset-x-10 rounded-lg border border-border-strong bg-card text-left shadow-lg';

const message = 'px-4 py-6 text-center text-sm text-muted-foreground';

const edge = 'flex items-center justify-between gap-3 px-4 text-[13px] text-muted-foreground';

export function SearchResults({
  id,
  query,
  status,
  results,
  total,
  activeIndex,
  onNavigate,
}: Props) {
  const catalogHref = `/catalogo?q=${encodeURIComponent(query)}`;

  return (
    <div className={panel}>
      <p className="sr-only" role="status">
        {status === 'results' && `${results.length} de ${total} resultados`}
        {status === 'empty' && 'Sin resultados'}
        {status === 'loading' && 'Buscando'}
      </p>

      {status === 'loading' && (
        <div aria-hidden="true" className="flex flex-col gap-4 p-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </div>
      )}

      {status === 'empty' && (
        <div className={message}>
          <p>
            Sin resultados para <span className="font-medium text-foreground">“{query}”</span>.
          </p>
          <p className="mt-1">Probá con otro término o explorá las categorías.</p>
        </div>
      )}

      {status === 'error' && (
        <p className={message}>No pudimos buscar ahora. Probá de nuevo en un momento.</p>
      )}

      {status === 'results' && (
        <>
          <div className={`${edge} h-11 border-b border-border`}>
            <p className="min-w-0 truncate">
              Resultados para <span className="text-foreground">«{query}»</span>
            </p>
            <p className="shrink-0">
              {results.length} de {total}
            </p>
          </div>

          <ul id={id} role="listbox" aria-label="Resultados de búsqueda">
            {results.map((repository, i) => {
              const category = repository.categories[0];
              return (
                <li
                  key={repository.id}
                  id={`${id}-${i}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  className={i === activeIndex ? 'bg-muted' : undefined}
                >
                  <Link
                    href={`/repositorios/${repository.id}`}
                    onClick={onNavigate}
                    tabIndex={-1}
                    className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-muted sm:flex-row sm:py-[9px] sm:items-center sm:gap-4"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex items-center gap-2 text-[13px]">
                        {category && <CategoryDot slug={category.slug} />}
                        <span className="truncate">
                          <span className="text-muted-foreground">
                            {repository.fullName.split('/')[0]}/
                          </span>
                          <span className="text-foreground">{repository.name}</span>
                        </span>
                      </span>
                      <span className="truncate text-[13px] text-muted-foreground">
                        {repository.description ?? 'Sin descripción.'}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-4">
                      <span className="flex items-center gap-1.5 font-mono text-[13px] text-muted-foreground sm:w-16">
                        <Star className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                        <span className="sr-only">Estrellas:</span>
                        {formatStars(repository.stars)}
                      </span>
                      <span className="sm:w-24">
                        <LicenseBadge spdx={repository.licenseSpdx} />
                      </span>
                      <span className="ml-auto flex sm:ml-0 sm:w-24 sm:justify-end">
                        <HealthBadge
                          level={repository.maintenanceLevel}
                          score={repository.healthScore}
                        />
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className={`${edge} h-10 border-t border-border bg-muted`}>
            <Link
              href={catalogHref}
              onClick={onNavigate}
              className="font-medium text-link hover:underline"
            >
              Ver las {total} en el catálogo →
            </Link>
            <p className="hidden text-xs sm:block">
              Escribí tu necesidad y presioná{' '}
              <kbd className="rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono">
                Enter
              </kbd>
            </p>
          </div>
        </>
      )}
    </div>
  );
}
