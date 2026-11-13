import Link from 'next/link';
import { ArrowRight, X } from 'lucide-react';
import { HealthBadge } from '@/components/shared/health-badge';
import { integrationLabels, levelOf } from '@/lib/assistant-format';
import type { Proposal } from '@/lib/assistant';

type Props = {
  proposal: Proposal;
  id: string;
  onClose: () => void;
};

export function ToolDrawer({ proposal, id, onClose }: Props) {
  const component = proposal.components.find((c) => c.repository.id === id);
  if (!component) return null;

  const { repository } = component;
  const capability = proposal.capabilities.find((c) => c.key === component.capability);
  const names = new Map(proposal.components.map((c) => [c.repository.id, c.repository.fullName]));
  const links = proposal.connections.filter((c) => c.from === id || c.to === id);

  return (
    <aside
      aria-label={`Detalle de ${repository.fullName}`}
      className="absolute inset-y-3 right-3 z-10 flex w-90 max-w-[calc(100%-1.5rem)] flex-col gap-4 overflow-y-auto rounded-lg border border-border bg-card p-4 shadow-lg"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">
            {capability?.name ?? component.capability}
          </p>
          <h2 className="mt-0.5 text-base font-semibold">{repository.fullName}</h2>
        </div>
        <button
          type="button"
          aria-label="Cerrar detalle"
          onClick={onClose}
          className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/40"
        >
          <X className="size-4" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <HealthBadge level={levelOf(repository.healthScore)} score={repository.healthScore} />
        {repository.licenseSpdx && (
          <span className="inline-flex h-[22px] items-center rounded-sm border border-border bg-muted px-1.5 font-mono font-medium text-muted-foreground">
            {repository.licenseSpdx}
          </span>
        )}
      </div>

      <section className="flex flex-col gap-1">
        <h3 className="text-[13px] font-semibold">Por qué se eligió</h3>
        {/* La justificación del backend ya empieza con la razón de la capacidad. */}
        <p className="text-[13px] leading-5 text-muted-foreground">{component.justification}</p>
      </section>

      {links.length > 0 && (
        <section className="flex flex-col gap-1">
          <h3 className="text-[13px] font-semibold">Cómo se conecta</h3>
          <ul className="flex flex-col gap-1 text-[13px] leading-5 text-muted-foreground">
            {links.map((c) => {
              const other = c.from === id ? c.to : c.from;
              return (
                <li key={`${c.from}-${c.to}`}>
                  {c.from === id ? 'Hacia' : 'Desde'}{' '}
                  <span className="font-medium text-foreground">{names.get(other) ?? other}</span>{' '}
                  por {integrationLabels[c.integrationType]}
                  {c.source === 'MODEL_SUGGESTION' && ' (sugerida por el modelo: validala)'}.
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Link
        href={`/repositorios/${repository.id}`}
        className="mt-auto flex h-9 items-center justify-center gap-2 rounded-md border border-border text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/40"
      >
        Ver ficha completa
        <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
      </Link>
    </aside>
  );
}
