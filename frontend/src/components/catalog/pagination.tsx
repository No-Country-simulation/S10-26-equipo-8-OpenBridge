import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type Props = {
  page: number;
  totalPages: number;
  size: number;
  total: number;
  hrefFor: (page: number) => string;
};

const step =
  'inline-flex h-9 items-center gap-2 rounded-md border border-border px-3.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/40';

// Anterior · página actual · Siguiente, como en el diseño del catálogo.
export function Pagination({ page, totalPages, size, total, hrefFor }: Props) {
  const from = (page - 1) * size + 1;
  const to = Math.min(page * size, total);
  const prev = page > 1;
  const next = page < totalPages;

  return (
    <nav aria-label="Paginación" className="mt-8 flex flex-col items-center gap-3">
      <p className="text-[13px] text-muted-foreground">
        Mostrando {from}–{to} de {total}
      </p>
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          {prev ? (
            <Link href={hrefFor(page - 1)} rel="prev" className={`${step} hover:bg-muted`}>
              <ChevronLeft
                className="size-3.5 text-muted-foreground"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              Anterior
            </Link>
          ) : (
            <span aria-disabled="true" className={`${step} text-muted-foreground opacity-50`}>
              <ChevronLeft className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
              Anterior
            </span>
          )}
          <span
            aria-current="page"
            aria-label={`Página ${page} de ${totalPages}`}
            className="flex size-9 items-center justify-center rounded-md bg-foreground text-sm font-medium text-background tabular-nums"
          >
            {page}
          </span>
          {next ? (
            <Link href={hrefFor(page + 1)} rel="next" className={`${step} hover:bg-muted`}>
              Siguiente
              <ChevronRight
                className="size-3.5 text-muted-foreground"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </Link>
          ) : (
            <span aria-disabled="true" className={`${step} text-muted-foreground opacity-50`}>
              Siguiente
              <ChevronRight className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
            </span>
          )}
        </div>
      )}
    </nav>
  );
}
