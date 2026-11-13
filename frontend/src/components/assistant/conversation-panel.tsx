'use client';

import { ArrowUp, Copy, LoaderCircle, RotateCcw, Square } from 'lucide-react';
import { Fragment, useState, type KeyboardEvent } from 'react';
import { isCopyleft } from '@/components/shared/license-badge';
import { Button } from '@/components/ui/button';
import {
  MAX_DESCRIPTION,
  MIN_DESCRIPTION,
  type Proposal,
  type ProposalStage,
} from '@/lib/assistant';
import { proposalToMarkdown, summarize, titleOf } from '@/lib/assistant-format';

const stageLabels: Record<ProposalStage, string> = {
  ANALYZING: 'Analizando necesidades…',
  RETRIEVING: 'Buscando componentes…',
  COMPOSING: 'Armando propuesta…',
};

const examples = [
  {
    label: 'E-commerce B2B de logística',
    text: 'E-commerce B2B de logística. Clientes empresa con SSO, pagos en varios países, catálogo con buscador. Equipo en TypeScript, todo self-hosted.',
  },
  {
    label: 'App interna con IA sobre documentos',
    text: 'App interna con IA sobre documentos: los empleados preguntan en lenguaje natural y reciben respuestas con la fuente. Datos sensibles, todo self-hosted.',
  },
  {
    label: 'Marketplace de servicios freelance',
    text: 'Marketplace de servicios freelance con chat en tiempo real, búsqueda por habilidades y cobros divididos entre plataforma y profesional.',
  },
];

const fieldClass =
  'h-9 w-full rounded-md border border-border bg-background px-3 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:border-foreground/40 disabled:opacity-60';

// Un ajuste que pidió el usuario y, si no se pudo aplicar, la explicación del asistente.
export type Adjustment = { text: string; hint?: string };

const userBubbleClass =
  'max-w-[88%] self-end rounded-lg border border-border bg-muted p-3 text-[13px] leading-5';

type Props = {
  // Lo que se envió en la última consulta; null mientras no hay conversación.
  submitted: string | null;
  adjustments?: Adjustment[];
  // El asistente pidió más contexto: el campo de abajo responde sus preguntas en vez de ajustar.
  needsContext?: boolean;
  // Texto que llega desde el home sin poder enviarse (muy corto o muy largo).
  initialDraft?: string;
  loadingStage: ProposalStage | null;
  proposal?: Proposal;
  onSubmit: (description: string) => void;
  onAdjust: (text: string) => void;
  onStop: () => void;
  onRetry: () => void;
};

// Enter envía; Shift + Enter agrega un salto de línea. No actúa mientras un IME compone texto.
function sendOnEnter(e: KeyboardEvent, send: () => void) {
  if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
  e.preventDefault();
  send();
}

export function ConversationPanel({
  submitted,
  adjustments = [],
  needsContext = false,
  initialDraft = '',
  loadingStage,
  proposal,
  onSubmit,
  onAdjust,
  onStop,
  onRetry,
}: Props) {
  const [draft, setDraft] = useState(initialDraft);
  const [adjust, setAdjust] = useState('');
  const [industry, setIndustry] = useState('');
  const [scale, setScale] = useState('');
  const [hosting, setHosting] = useState('');
  const [language, setLanguage] = useState('');
  const [copied, setCopied] = useState(false);
  const loading = loadingStage !== null;

  const tooShort = draft.trim().length < MIN_DESCRIPTION;
  const tooLong = draft.trim().length > MAX_DESCRIPTION;

  // Los datos de "Afinar contexto" viajan dentro de la descripción: el contrato solo tiene ese campo.
  function sendFirst() {
    if (tooShort || tooLong || loading) return;
    const context = [
      industry && `Industria: ${industry}.`,
      scale && `Escala: ${scale}.`,
      hosting && `Hosting: ${hosting}.`,
      language && `Lenguaje del equipo: ${language}.`,
    ].filter(Boolean);
    onSubmit([draft.trim(), ...context].join(' ').slice(0, MAX_DESCRIPTION));
  }

  function sendAdjust() {
    const text = adjust.trim();
    if (!text || !submitted || loading) return;
    onAdjust(text);
    setAdjust('');
  }

  async function copyText() {
    if (!proposal) return;
    try {
      await navigator.clipboard.writeText(proposalToMarkdown(proposal, titleOf(submitted ?? '')));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Sin permiso para el portapapeles: el texto sigue visible.
    }
  }

  if (submitted === null) {
    return (
      <section
        aria-label="Conversación"
        className="flex flex-col gap-5 p-4 lg:h-full lg:overflow-y-auto lg:p-5"
      >
        <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.02em]">
          ¿Qué estás construyendo?
        </h1>
        <div className="flex flex-col gap-2">
          <label htmlFor="description" className="sr-only">
            Descripción del negocio
          </label>
          <textarea
            id="description"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => sendOnEnter(e, sendFirst)}
            rows={4}
            aria-describedby="description-hint"
            placeholder="Ej.: SaaS de turnos médicos con pagos online, multi-tenant"
            className="w-full resize-y rounded-lg border border-border bg-background p-3 text-[15px] leading-6 outline-none placeholder:text-muted-foreground focus-visible:border-foreground/40"
          />
          <div className="flex items-center justify-between gap-3">
            <p
              id="description-hint"
              className={`text-xs ${(tooShort && draft.length > 0) || tooLong ? 'text-health-moderate' : 'text-muted-foreground'}`}
            >
              {tooLong
                ? `La descripción supera los ${MAX_DESCRIPTION.toLocaleString('es-AR')} caracteres: acortala para enviarla.`
                : tooShort
                  ? `Escribí al menos ${MIN_DESCRIPTION} caracteres: qué vendés, quiénes lo usan y a qué escala.`
                  : 'Enter para enviar · Shift + Enter para salto de línea'}
            </p>
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {draft.trim().length.toLocaleString('es-AR')}/
              {MAX_DESCRIPTION.toLocaleString('es-AR')}
            </span>
          </div>
        </div>

        <details open className="group flex flex-col">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-[13px] font-medium [&::-webkit-details-marker]:hidden">
            <span
              aria-hidden="true"
              className="text-[10px] text-muted-foreground transition-transform group-open:rotate-90"
            >
              ▶
            </span>
            Afinar contexto
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              Industria
              <input
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="Salud"
                className={fieldClass}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              Escala
              <select
                value={scale}
                onChange={(e) => setScale(e.target.value)}
                className={fieldClass}
              >
                <option value="">Sin definir</option>
                <option value="prototipo">Prototipo</option>
                <option value="pyme">Pyme</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              Hosting
              <select
                value={hosting}
                onChange={(e) => setHosting(e.target.value)}
                className={fieldClass}
              >
                <option value="">Indistinto</option>
                <option value="self-hosted">Self-hosted</option>
                <option value="cloud">Cloud</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              Lenguaje
              <input
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                placeholder="TypeScript"
                className={fieldClass}
              />
            </label>
          </div>
        </details>

        <ul className="flex flex-wrap gap-2">
          {examples.map((example) => (
            <li key={example.label}>
              <button
                type="button"
                onClick={() => setDraft(example.text)}
                className="rounded-md border border-border bg-card px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/40"
              >
                {example.label}
              </button>
            </li>
          ))}
        </ul>

        <Button
          type="button"
          onClick={sendFirst}
          disabled={tooShort || tooLong}
          className="h-10 w-fit gap-2 px-4"
        >
          Armar propuesta
          <ArrowUp className="size-4 rotate-90" strokeWidth={1.5} aria-hidden="true" />
        </Button>
      </section>
    );
  }

  const summary = proposal ? summarize(proposal, isCopyleft) : null;

  return (
    <section aria-label="Conversación" className="flex min-h-0 flex-col lg:h-full">
      <div className="flex flex-1 flex-col gap-5 p-4 lg:overflow-y-auto lg:p-5">
        <p className={userBubbleClass}>{submitted}</p>

        {adjustments.map((item, index) => (
          <Fragment key={index}>
            <p className={userBubbleClass}>{item.text}</p>
            {item.hint && <p className="text-[13px] leading-5">{item.hint}</p>}
          </Fragment>
        ))}

        {loading && (
          <div className="flex flex-col items-start gap-3">
            <p
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 text-[13px] text-muted-foreground"
            >
              <LoaderCircle className="size-4 animate-spin" strokeWidth={1.5} aria-hidden="true" />
              {stageLabels[loadingStage]}
            </p>
            <Button type="button" variant="outline" onClick={onStop} className="h-9 gap-2">
              <Square className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
              Detener
            </Button>
          </div>
        )}

        {summary && (
          <div className="flex flex-col gap-3 text-[13px] leading-5">
            <p>
              Te propongo esta arquitectura con{' '}
              <strong className="font-semibold">{summary.count} herramientas del catálogo</strong>:
            </p>
            <ul className="list-disc space-y-3 pl-5 marker:text-foreground">
              {summary.bullets.map((b) => (
                <li key={b.name}>
                  <strong className="font-semibold">{b.name}</strong> — {b.text}
                </li>
              ))}
            </ul>
            <p>{summary.outro}</p>
            <div className="flex items-center gap-1 text-muted-foreground">
              <button
                type="button"
                aria-label="Copiar respuesta"
                onClick={copyText}
                className="flex size-8 items-center justify-center rounded-md hover:bg-muted hover:text-foreground"
              >
                <Copy className="size-4" strokeWidth={1.5} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Reintentar"
                onClick={onRetry}
                className="flex size-8 items-center justify-center rounded-md hover:bg-muted hover:text-foreground"
              >
                <RotateCcw className="size-4" strokeWidth={1.5} aria-hidden="true" />
              </button>
              <span aria-live="polite" className="text-xs">
                {copied ? 'Copiado' : ''}
              </span>
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendAdjust();
        }}
        className="border-t border-border p-4 lg:p-5"
      >
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3 focus-within:border-foreground/40">
          <label htmlFor="adjust" className="sr-only">
            {needsContext ? 'Respondé lo que falta' : 'Pedí un ajuste'}
          </label>
          <textarea
            id="adjust"
            value={adjust}
            onChange={(e) => setAdjust(e.target.value)}
            onKeyDown={(e) => sendOnEnter(e, sendAdjust)}
            rows={2}
            disabled={loading}
            placeholder={
              needsContext
                ? 'Respondé lo que falta: rubro, quiénes lo usan, cuántos usuarios'
                : 'Pedí un ajuste: "cambiá Keycloak por algo más liviano"'
            }
            className="resize-none bg-transparent text-[13px] leading-5 outline-none placeholder:text-muted-foreground disabled:opacity-60"
          />
          <div className="flex items-center justify-end gap-3">
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Enter para enviar
            </span>
            <button
              type="submit"
              aria-label={needsContext ? 'Enviar respuesta' : 'Enviar ajuste'}
              disabled={loading || adjust.trim().length === 0}
              className="flex size-8 items-center justify-center rounded-md bg-foreground text-background transition-opacity disabled:opacity-40"
            >
              <ArrowUp className="size-4" strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
