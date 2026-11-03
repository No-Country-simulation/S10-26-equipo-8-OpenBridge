import Link from 'next/link';
import { CircleX } from 'lucide-react';

export default function RepositoryNotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <CircleX className="size-6 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
        <h1 className="text-base font-medium">No encontramos esa herramienta</h1>
        <p className="text-sm text-muted-foreground">
          Puede que se haya movido o todavía no esté en el catálogo.
        </p>
        <Link
          href="/catalogo"
          className="mt-2 inline-flex h-9 items-center rounded-md border border-border px-3.5 text-[13px] font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/40"
        >
          Ir al catálogo
        </Link>
      </div>
    </main>
  );
}
