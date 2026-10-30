import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

type Props = {
  scoped: boolean;
  query?: string;
  clearHref: string;
};

export function EmptyState({ scoped, query, clearHref }: Props) {
  const text = query
    ? `No encontramos herramientas para «${query}». Probá con otras palabras.`
    : scoped
      ? 'Esta categoría todavía no tiene contenido. Probá con otra o mirá todo el catálogo.'
      : 'El catálogo todavía no tiene contenido.';

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-16 text-center">
      <h2 className="text-base font-semibold">
        {query ? 'Sin resultados' : 'Todavía no hay herramientas acá'}
      </h2>
      <p className="max-w-100 text-sm text-muted-foreground">{text}</p>
      {(query || scoped) && (
        <Link href={clearHref} className={buttonVariants({ variant: 'outline' })}>
          {query ? 'Limpiar búsqueda' : 'Ver todo el catálogo'}
        </Link>
      )}
    </div>
  );
}
