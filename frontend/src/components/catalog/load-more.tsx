import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

export function LoadMore({
  shown,
  total,
  nextHref,
}: {
  shown: number;
  total: number;
  nextHref: string;
}) {
  return (
    <div className="mt-8 flex flex-col items-center gap-3">
      <p className="text-[13px] text-muted-foreground">
        Mostrando {shown} de {total}
      </p>
      {shown < total && (
        <Link href={nextHref} scroll={false} className={buttonVariants({ variant: 'outline' })}>
          Cargar más
        </Link>
      )}
    </div>
  );
}
