import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

export function EmptyState({ scoped }: { scoped: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-16 text-center">
      <h2 className="text-base font-semibold">Todavía no hay herramientas acá</h2>
      <p className="max-w-100 text-sm text-muted-foreground">
        {scoped
          ? 'Esta categoría todavía no tiene contenido. Probá con otra o mirá todo el catálogo.'
          : 'El catálogo todavía no tiene contenido.'}
      </p>
      {scoped && (
        <Link href="/catalogo" className={buttonVariants({ variant: 'outline' })}>
          Ver todo el catálogo
        </Link>
      )}
    </div>
  );
}
