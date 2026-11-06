'use client';

import { Dialog } from '@base-ui/react/dialog';
import { ListFilter, X } from 'lucide-react';
import { FiltersPanel } from '@/components/catalog/filters-panel';
import type { CatalogParams } from '@/lib/catalog-url';
import type { CatalogFilters } from '@/lib/repositories';

type Props = {
  filters: CatalogFilters;
  params: CatalogParams;
  activeCount: number;
  total: number;
};

// En pantallas angostas el panel de filtros no ocupa lugar: se abre desde un botón, en un cajón.
export function FiltersSheet({ filters, params, activeCount, total }: Props) {
  return (
    <Dialog.Root>
      <Dialog.Trigger className="inline-flex h-11 items-center gap-2 rounded-md border border-border bg-background px-3.5 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/40 lg:hidden">
        <ListFilter className="size-4" strokeWidth={1.5} aria-hidden="true" />
        Filtros
        {activeCount > 0 && (
          <span className="flex size-5 items-center justify-center rounded-full bg-foreground font-mono text-xs text-background tabular-nums">
            {activeCount}
            <span className="sr-only"> activos</span>
          </span>
        )}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 lg:hidden" />
        <Dialog.Popup
          aria-label="Filtros del catálogo"
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-xl border-t border-border bg-background transition-transform duration-200 data-ending-style:translate-y-full data-starting-style:translate-y-full lg:hidden"
        >
          <Dialog.Close
            aria-label="Cerrar filtros"
            className="absolute top-2 right-3 flex size-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-foreground/40"
          >
            <X className="size-5" strokeWidth={1.5} aria-hidden="true" />
          </Dialog.Close>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-4">
            <div className="pr-12">
              <FiltersPanel filters={filters} params={params} />
            </div>
          </div>
          <div className="border-t border-border p-4">
            <Dialog.Close className="flex h-11 w-full items-center justify-center rounded-md bg-foreground text-sm font-medium text-background transition-colors hover:bg-foreground/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/40">
              Ver {total} {total === 1 ? 'resultado' : 'resultados'}
            </Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
