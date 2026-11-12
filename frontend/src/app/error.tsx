'use client';

import { RotateCw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col items-center justify-center gap-2 px-4 py-16 text-center sm:px-8">
      <TriangleAlert className="size-6 text-destructive" strokeWidth={1.5} aria-hidden="true" />
      <h2 className="mt-1 text-base font-semibold text-foreground">
        No pudimos cargar las categorías
      </h2>
      <p className="max-w-xs text-sm text-muted-foreground">
        El catálogo no respondió. Probá de nuevo en unos segundos.
      </p>
      <Button variant="outline" size="lg" onClick={reset} className="mt-3">
        <RotateCw strokeWidth={1.5} aria-hidden="true" />
        Reintentar
      </Button>
    </main>
  );
}
