import Link from 'next/link';
import { ArrowUpRight, ChevronRight, Globe, Waypoints } from 'lucide-react';
import { CopyLinkButton } from '@/components/repository/copy-link-button';
import { CategoryDot } from '@/components/shared/category-dot';
import { LicenseBadge } from '@/components/shared/license-badge';
import type { RepositoryDetail } from '@/lib/repositories';

const action =
  'inline-flex h-9 items-center gap-2 rounded-md px-3.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/40';
const primary = `${action} bg-foreground text-background hover:bg-foreground/90`;
const secondary = `${action} border border-border bg-background hover:bg-muted`;
const ghost = `${action} hover:bg-muted`;

const separator = (
  <span aria-hidden="true" className="text-muted-foreground">
    ·
  </span>
);

export function RepositoryHeader({ repository }: { repository: RepositoryDetail }) {
  const { fullName, name, description, primaryLanguage, licenseSpdx, url, homepage } = repository;
  const owner = fullName.split('/')[0];
  const category = repository.categories[0];
  const homepageHost = homepage ? new URL(homepage).hostname.replace(/^www\./, '') : null;

  return (
    <header>
      <nav aria-label="Ruta" className="mb-4 flex flex-wrap items-center gap-2.5 text-[13px]">
        <Link href="/catalogo" className="text-muted-foreground hover:text-foreground">
          Catálogo
        </Link>
        {category && (
          <>
            <ChevronRight className="size-3 text-muted-foreground" aria-hidden="true" />
            <Link
              href={`/catalogo?category=${category.slug}`}
              className="text-muted-foreground hover:text-foreground"
            >
              {category.name}
            </Link>
          </>
        )}
        <ChevronRight className="size-3 text-muted-foreground" aria-hidden="true" />
        <span aria-current="page" className="text-foreground">
          {name}
        </span>
      </nav>

      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-lg font-medium text-foreground uppercase"
        >
          {name[0]}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h1 className="text-[28px] leading-9 tracking-[-0.02em] break-words text-muted-foreground sm:text-[32px] sm:leading-10">
            {owner}/{name}
          </h1>
          <p className="max-w-[620px] leading-6 text-muted-foreground">
            {description ?? 'Sin descripción.'}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1 text-xs">
            {category && (
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <CategoryDot slug={category.slug} />
                {category.name}
              </span>
            )}
            {primaryLanguage && (
              <span className="inline-flex items-center gap-3 whitespace-nowrap">
                {separator}
                <span className="text-muted-foreground">{primaryLanguage}</span>
              </span>
            )}
            <LicenseBadge spdx={licenseSpdx} />
            {homepage && homepageHost && (
              <span className="inline-flex items-center gap-3 whitespace-nowrap">
                {separator}
                <a
                  href={homepage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground hover:underline"
                >
                  {homepageHost}
                  <span className="sr-only"> (se abre en una pestaña nueva)</span>
                </a>
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <a href={url} target="_blank" rel="noopener noreferrer" className={primary}>
          <ArrowUpRight className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
          Ver en GitHub
          <span className="sr-only">(se abre en una pestaña nueva)</span>
        </a>
        {homepage && (
          <a href={homepage} target="_blank" rel="noopener noreferrer" className={secondary}>
            <Globe className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
            Sitio web
            <span className="sr-only">(se abre en una pestaña nueva)</span>
          </a>
        )}
        <CopyLinkButton className={secondary} />
        <Link href="/asistente" className={`${ghost} sm:ml-auto`}>
          <Waypoints className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
          Preguntarle al asistente
        </Link>
      </div>
    </header>
  );
}
