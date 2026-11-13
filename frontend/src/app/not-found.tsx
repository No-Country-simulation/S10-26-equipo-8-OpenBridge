import type { Metadata } from 'next';
import Link from 'next/link';
import { CircleX } from 'lucide-react';

export const metadata: Metadata = { title: 'Página no encontrada' };

const linkClass =
  'inline-flex h-9 items-center rounded-md border border-border px-3.5 text-[13px] font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/40';

// 404 de cualquier ruta que no exista; la ficha tiene la suya en repositorios/[id]/not-found.tsx.
export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <CircleX className="size-6 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
        <h1 className="text-base font-medium">No encontramos esa página</h1>
        <p className="text-sm text-muted-foreground">
          La dirección no existe o se movió. Probá desde el inicio o el catálogo.
        </p>
        <div className="mt-2 flex gap-2">
          <Link href="/" className={linkClass}>
            Ir al inicio
          </Link>
          <Link href="/catalogo" className={linkClass}>
            Ir al catálogo
          </Link>
        </div>
      </div>
    </main>
  );
}
