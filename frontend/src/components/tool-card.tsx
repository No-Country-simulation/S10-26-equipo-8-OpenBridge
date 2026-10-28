import Link from 'next/link';
import { GitCommitHorizontal, Star } from 'lucide-react';
import { CategoryDot } from '@/components/category-dot';
import { HealthBadge } from '@/components/health-badge';
import { LicenseBadge } from '@/components/license-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatLastCommit, formatStars, type Repository } from '@/lib/repositories';

const layout = 'flex flex-col gap-3 rounded-lg border border-border bg-card p-4';

export function ToolCard({ repository }: { repository: Repository }) {
  const { id, fullName, name, description, primaryLanguage, licenseSpdx, stars } = repository;
  const owner = fullName.split('/')[0];
  const category = repository.categories[0];

  return (
    <Link
      href={`/repositorios/${id}`}
      className={`${layout} transition-[border-color,box-shadow] duration-150 hover:border-border-strong hover:shadow-sm`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-xs font-medium text-muted-foreground uppercase"
          >
            {name[0]}
          </span>
          <h3 className="truncate text-sm">
            <span className="text-[13px] text-muted-foreground">{owner}/</span>
            <span className="text-foreground">{name}</span>
          </h3>
        </div>
        <HealthBadge level={repository.maintenanceLevel} score={repository.healthScore} compact />
      </div>

      <p className="line-clamp-2 min-h-10 text-[13px] leading-5 text-muted-foreground">
        {description ?? 'Sin descripción.'}
      </p>

      <div className="flex items-center gap-4 font-mono text-[13px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Star className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
          <span className="sr-only">Estrellas:</span>
          {formatStars(stars)}
        </span>
        <span className="flex items-center gap-1.5">
          <GitCommitHorizontal className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
          <span className="sr-only">Último commit:</span>
          {formatLastCommit(repository.lastCommitAt)}
        </span>
      </div>

      <div className="flex items-center gap-2 border-t border-border pt-3 text-xs">
        {category && (
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <CategoryDot slug={category.slug} />
            {category.name}
          </span>
        )}
        {primaryLanguage && <span className="text-muted-foreground">{primaryLanguage}</span>}
        <span className="ml-auto">
          <LicenseBadge spdx={licenseSpdx} />
        </span>
      </div>
    </Link>
  );
}

export function ToolCardSkeleton() {
  return (
    <div className={layout} aria-hidden="true">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Skeleton className="size-6" />
          <Skeleton className="h-3.5 w-32" />
        </div>
        <Skeleton className="h-[22px] w-12" />
      </div>
      <div className="flex min-h-10 flex-col gap-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <Skeleton className="h-3.5 w-28" />
      <div className="flex items-center gap-2 border-t border-border pt-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="ml-auto h-5 w-16" />
      </div>
    </div>
  );
}
