import { formatLastCommit } from '@/lib/repositories';
import { getCatalogStatus } from '@/lib/sync-status';

const REPO_URL = 'https://github.com/No-Country-simulation/S10-26-equipo-8-OpenBridge';

const links = [
  { href: `${REPO_URL}/tree/main/docs`, label: 'Documentación de la API', external: true },
  { href: REPO_URL, label: 'GitHub del proyecto', external: true },
];

export async function Footer() {
  const { total, lastSyncedAt } = await getCatalogStatus();

  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-300 flex-col gap-4 px-4 py-8 text-[13px] text-muted-foreground sm:px-8 md:flex-row md:items-center md:justify-between">
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {lastSyncedAt && (
            <>
              <span className="flex items-center gap-2">
                <span aria-hidden className="size-2 rounded-full bg-health-active" />
                Sincronizado con GitHub {formatLastCommit(lastSyncedAt)}
              </span>
              <span aria-hidden className="max-sm:hidden">
                ·
              </span>
            </>
          )}
          {total > 0 && <span>{total} herramientas</span>}
        </p>
        <nav aria-label="Pie de página" className="flex flex-wrap gap-x-6 gap-y-2">
          {links.map(({ href, label, external }) => (
            <a
              key={label}
              href={href}
              {...(external && { target: '_blank', rel: 'noopener noreferrer' })}
              className="transition-colors hover:text-foreground"
            >
              {label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
