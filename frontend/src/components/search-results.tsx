import Link from 'next/link';
import { HealthBadge } from '@/components/health-badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { Repository } from '@/lib/repositories';

export type SearchStatus = 'idle' | 'loading' | 'results' | 'empty' | 'error';

type Props = {
  id: string;
  query: string;
  status: SearchStatus;
  results: Repository[];
  activeIndex: number;
  onNavigate: () => void;
};

const panel =
  'absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-[10px] border border-border-strong bg-card text-left shadow-lg';

const message = 'px-4 py-6 text-center text-sm text-muted-foreground';

export function SearchResults({ id, query, status, results, activeIndex, onNavigate }: Props) {
  const catalogHref = `/catalogo?q=${encodeURIComponent(query)}`;

  return (
    <div className={panel}>
      <p className="sr-only" role="status">
        {status === 'results' && `${results.length} resultados`}
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
          <ul id={id} role="listbox" aria-label="Resultados de búsqueda">
            {results.map((repository, i) => (
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
                  className="flex items-start justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm">
                      <span className="text-muted-foreground">
                        {repository.fullName.split('/')[0]}/
                      </span>
                      <span className="text-foreground">{repository.name}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                      {repository.description ?? 'Sin descripción.'}
                    </span>
                  </span>
                  <HealthBadge
                    level={repository.maintenanceLevel}
                    score={repository.healthScore}
                    compact
                  />
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href={catalogHref}
            onClick={onNavigate}
            className="block border-t border-border px-4 py-3 text-sm font-medium text-link transition-colors hover:bg-muted"
          >
            Ver todos los resultados →
          </Link>
        </>
      )}
    </div>
  );
}
