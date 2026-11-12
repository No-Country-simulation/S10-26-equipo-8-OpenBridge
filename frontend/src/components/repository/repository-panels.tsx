import {
  CircleCheck,
  CircleDot,
  CircleX,
  Code,
  GitCommitHorizontal,
  GitFork,
  Info,
  Star,
  Tag,
} from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { HealthBadge } from '@/components/shared/health-badge';
import { isCopyleft } from '@/components/shared/license-badge';
import { HEALTH_SCORE_EXPLANATION } from '@/lib/health-info';
import { formatLastCommit, formatStars, type RepositoryDetail } from '@/lib/repositories';

const bar = {
  ACTIVE: 'bg-health-active',
  MODERATE: 'bg-health-moderate',
  AT_RISK: 'bg-health-risk',
  ARCHIVED: 'bg-health-risk',
} as const;

const card = 'flex flex-col gap-3 rounded-lg border border-border bg-card p-4';

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={card}>
      <h2 className="text-[13px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function HealthPanel({ repository }: { repository: RepositoryDetail }) {
  const { healthScore, maintenanceLevel } = repository;

  return (
    <section aria-label="Salud" className={card}>
      <div className="flex items-end justify-between">
        <p className="font-mono">
          <span className="text-4xl font-semibold tabular-nums">{healthScore ?? '—'}</span>
          <span className="text-[13px] text-muted-foreground">/100</span>
        </p>
        <HealthBadge level={maintenanceLevel} score={healthScore} withScore={false} />
      </div>
      <div
        role="meter"
        aria-label="Puntaje de salud"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={healthScore ?? undefined}
        aria-valuetext={healthScore === null ? 'Sin datos' : undefined}
        className="h-1 overflow-hidden rounded-full bg-muted"
      >
        {healthScore !== null && maintenanceLevel !== null && (
          <div
            className={`h-full rounded-full ${bar[maintenanceLevel]}`}
            style={{ width: `${healthScore}%` }}
          />
        )}
      </div>
      <p className="flex gap-2 text-xs leading-4 text-muted-foreground">
        <Info className="mt-px size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        {HEALTH_SCORE_EXPLANATION}
      </p>
    </section>
  );
}

type Row = {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  value: ReactNode;
};

export function MetricsPanel({ repository }: { repository: RepositoryDetail }) {
  const {
    stars,
    forks,
    openIssues,
    lastCommitAt,
    lastReleaseAt,
    primaryLanguage,
    activeMaintainer,
  } = repository;

  const rows: Row[] = [
    { icon: Star, label: 'Stars', value: formatStars(stars) },
    { icon: GitFork, label: 'Forks', value: formatStars(forks) },
    { icon: CircleDot, label: 'Issues abiertas', value: openIssues.toLocaleString('es-AR') },
    { icon: GitCommitHorizontal, label: 'Último commit', value: formatLastCommit(lastCommitAt) },
    {
      icon: Tag,
      label: 'Última release',
      value: lastReleaseAt ? formatLastCommit(lastReleaseAt) : 'Sin releases',
    },
    { icon: Code, label: 'Lenguaje', value: primaryLanguage ?? 'Sin dato' },
    {
      icon: activeMaintainer ? CircleCheck : CircleX,
      label: 'Mantenedor activo',
      value: activeMaintainer ? 'Sí' : 'No',
    },
  ];

  return (
    <Panel title="Métricas">
      <dl className="flex flex-col text-[13px]">
        {rows.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex h-[29px] items-center gap-2 border-b border-border">
            <dt className="flex items-center gap-2 text-muted-foreground">
              <Icon className="size-3.5" strokeWidth={1.5} aria-hidden />
              {label}
            </dt>
            <dd className="ml-auto font-mono tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

export function LicensePanel({ licenseSpdx }: { licenseSpdx: string | null }) {
  const copyleft = licenseSpdx ? isCopyleft(licenseSpdx) : false;

  return (
    <Panel title="Licencia">
      {licenseSpdx ? (
        <>
          <p className="flex items-center gap-2 text-[13px] font-medium">
            <span className="inline-flex h-5 items-center rounded-sm border border-border bg-muted px-1.5 font-mono text-xs font-medium text-muted-foreground">
              {licenseSpdx}
            </span>
            {copyleft ? 'Copyleft' : 'Permisiva'}
          </p>
          <p className="text-[13px] leading-5 text-muted-foreground">
            {copyleft
              ? 'Exige publicar el código derivado. Confirmá el alcance con el cliente antes de usarla.'
              : 'Uso comercial permitido. Requiere conservar el aviso de copyright y la licencia, e indicar cambios.'}
          </p>
        </>
      ) : (
        <p className="text-[13px] leading-5 text-muted-foreground">
          El repositorio no declara licencia: sin ella no hay permiso de uso. Consultá con quien lo
          mantiene.
        </p>
      )}
    </Panel>
  );
}

export function TopicsPanel({ topics }: { topics: string[] }) {
  if (topics.length === 0) return null;

  return (
    <Panel title="Topics">
      <ul className="flex flex-wrap gap-2">
        {topics.map((topic) => (
          <li
            key={topic}
            className="inline-flex h-6 items-center rounded-sm border border-border bg-background px-2.5 text-xs font-medium"
          >
            {topic}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
