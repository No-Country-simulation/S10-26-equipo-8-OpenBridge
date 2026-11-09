'use client';

import { getNodesBounds, ReactFlowProvider, useReactFlow } from '@xyflow/react';
import { toPng } from 'html-to-image';
import { Check, Copy, ImageDown, Maximize2, Plus, TriangleAlert, Waypoints, X } from 'lucide-react';
import { useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ArchitectureFlow } from '@/components/assistant/architecture-flow';
import { AssistantErrorMessage } from '@/components/assistant/assistant-error';
import { ToolDrawer } from '@/components/assistant/tool-drawer';
import { CategoryDot } from '@/components/shared/category-dot';
import { HealthBadge } from '@/components/shared/health-badge';
import { Button } from '@/components/ui/button';
import type { AssistantError, Proposal } from '@/lib/assistant';
import { buildMap, levelOf, proposalToMarkdown, summarize, titleOf } from '@/lib/assistant-format';
import { isCopyleft } from '@/components/shared/license-badge';

const desktopQuery = '(min-width: 1024px)';
function useIsDesktop() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(desktopQuery);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(desktopQuery).matches,
    () => true,
  );
}

type Props = {
  status: 'idle' | 'loading' | 'error' | 'done';
  error?: AssistantError;
  proposal?: Proposal;
  description: string;
  onRetry: () => void;
  onReset: () => void;
};

function Placeholder({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-80 flex-1 items-center justify-center p-4 lg:p-5">
      <div className="flex h-full min-h-72 w-full flex-1 items-center justify-center rounded-lg border border-dashed border-border">
        {children}
      </div>
    </div>
  );
}

function Inner({
  proposal,
  description,
  onReset,
}: {
  proposal: Proposal;
  description: string;
  onReset: () => void;
}) {
  const desktop = useIsDesktop();
  const { getNodes } = useReactFlow();
  const mapRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const map = useMemo(() => buildMap(proposal), [proposal]);
  const title = titleOf(description);
  const summary = summarize(proposal, isCopyleft);
  const suggested = proposal.connections.filter((c) => c.source === 'MODEL_SUGGESTION');

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(proposalToMarkdown(proposal, title));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Sin permiso para el portapapeles: la propuesta sigue visible en pantalla.
    }
  }

  async function exportPng() {
    const viewport = mapRef.current?.querySelector<HTMLElement>('.react-flow__viewport');
    if (!viewport) return;
    const bounds = getNodesBounds(getNodes());
    const pad = 60;
    const width = bounds.width + pad * 2;
    const height = bounds.height + pad * 2;
    try {
      const url = await toPng(viewport, {
        backgroundColor: getComputedStyle(document.body).backgroundColor,
        width,
        height,
        style: {
          width: `${width}px`,
          height: `${height}px`,
          transform: `translate(${pad - bounds.x}px, ${pad - bounds.y}px) scale(1)`,
        },
      });
      const link = document.createElement('a');
      link.download = 'arquitectura-openbridge.png';
      link.href = url;
      link.click();
    } catch {
      // Si el navegador no puede dibujar la imagen, el mapa sigue disponible en pantalla.
    }
  }

  const flow = (
    <div
      ref={mapRef}
      className="relative h-full min-h-110 overflow-hidden rounded-lg border border-border bg-card/30"
    >
      <ArchitectureFlow map={map} selectedId={selectedId} onSelect={setSelectedId} />
      {selectedId && (
        <ToolDrawer proposal={proposal} id={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );

  const warnings = [
    ...proposal.gaps.map((g) => ({
      key: `gap-${g.capability}`,
      lead: map.nodes.find((n) => n.id === `gap-${g.capability}`)?.capabilityName ?? g.capability,
      text: `${g.message}. Revisalo antes de adoptarlo.`,
    })),
    ...summary.copyleft.map((c) => ({
      key: `license-${c.name}`,
      lead: `${c.name} usa ${c.spdx}`,
      text: 'Revisá el uso comercial.',
    })),
    ...suggested.map((c, i) => ({
      key: `suggested-${i}`,
      lead: 'Conexión sugerida por el modelo',
      text: 'No viene del catálogo curado: validala antes de adoptarla.',
    })),
  ];

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 lg:px-5">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">
            {proposal.components.length} componentes · {proposal.connections.length} conexiones
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={copyMarkdown} className="h-9 gap-2">
            {copied ? (
              <Check className="size-4" strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <Copy className="size-4" strokeWidth={1.5} aria-hidden="true" />
            )}
            <span aria-live="polite">{copied ? 'Copiado' : 'Copiar markdown'}</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={exportPng}
            className="hidden h-9 gap-2 lg:inline-flex"
          >
            <ImageDown className="size-4" strokeWidth={1.5} aria-hidden="true" />
            Exportar PNG
          </Button>
          <Button type="button" variant="ghost" onClick={onReset} className="h-9 gap-2">
            <Plus className="size-4" strokeWidth={1.5} aria-hidden="true" />
            Nueva consulta
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 lg:p-5">
        {warnings.length > 0 && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-lg border border-health-moderate/30 bg-health-moderate-tint px-3 py-2.5 text-[13px] leading-5 text-health-moderate"
          >
            <TriangleAlert
              className="mt-0.5 size-4 shrink-0"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <ul className="flex flex-col gap-1">
              {warnings.map((w) => (
                <li key={w.key}>
                  <strong className="font-semibold">{w.lead}.</strong> {w.text}
                </li>
              ))}
            </ul>
          </div>
        )}

        {desktop ? (
          <div className="min-h-110 flex-1">{flow}</div>
        ) : (
          <>
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {map.nodes.map((n) => (
                <li key={n.id} className="flex items-center gap-3 px-3 py-3 text-[13px]">
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">
                    {n.capabilityName}
                  </span>
                  <span className="flex min-w-0 flex-1 items-center gap-2 font-semibold">
                    {n.kind === 'tool' && <CategoryDot slug={n.capability} />}
                    <span className="truncate">{n.name}</span>
                  </span>
                  {n.healthScore !== undefined ? (
                    <HealthBadge level={levelOf(n.healthScore)} score={n.healthScore} />
                  ) : (
                    <span className="inline-flex h-6 items-center rounded-sm border border-border px-2 text-xs text-muted-foreground">
                      Fuera del catálogo
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="outline"
              onClick={() => setFullscreen(true)}
              className="h-10 gap-2"
            >
              <Maximize2 className="size-4" strokeWidth={1.5} aria-hidden="true" />
              Ver mapa
            </Button>
            {fullscreen && (
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Mapa de arquitectura"
                className="fixed inset-0 z-50 flex flex-col bg-background"
              >
                <div className="flex h-12 items-center justify-between border-b border-border px-4">
                  <p className="text-sm font-semibold">Mapa de arquitectura</p>
                  <button
                    type="button"
                    aria-label="Cerrar mapa"
                    onClick={() => setFullscreen(false)}
                    className="rounded-sm p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-5" strokeWidth={1.5} aria-hidden="true" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 p-3">{flow}</div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

export function MapPanel({ status, error, proposal, description, onRetry, onReset }: Props) {
  return (
    <section aria-label="Arquitectura propuesta" className="flex min-w-0 flex-col lg:min-h-0">
      {status === 'done' && proposal ? (
        proposal.components.length > 0 ? (
          <ReactFlowProvider>
            <Inner proposal={proposal} description={description} onReset={onReset} />
          </ReactFlowProvider>
        ) : (
          <Placeholder>
            <div role="alert" className="flex flex-col items-center gap-3 px-6 text-center">
              <TriangleAlert
                className="size-6 text-health-moderate"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <p className="max-w-90 text-[13px] leading-5 text-health-moderate">
                <strong className="font-semibold">
                  No pudimos dibujar el mapa de esta respuesta.
                </strong>{' '}
                El texto está completo; podés reintentar para generar el mapa.
              </p>
              <Button type="button" variant="outline" onClick={onRetry}>
                Reintentar
              </Button>
            </div>
          </Placeholder>
        )
      ) : status === 'error' && error ? (
        <Placeholder>
          <AssistantErrorMessage error={error} onRetry={onRetry} />
        </Placeholder>
      ) : (
        <Placeholder>
          <div className="flex flex-col items-center gap-3 text-center text-[13px] text-muted-foreground">
            <Waypoints className="size-5" strokeWidth={1.5} aria-hidden="true" />
            Tu arquitectura va a aparecer acá
          </div>
        </Placeholder>
      )}
    </section>
  );
}
