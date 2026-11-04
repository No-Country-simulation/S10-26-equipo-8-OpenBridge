'use client';

import Link from 'next/link';
import { ArrowRight, Check, Copy } from 'lucide-react';
import { useState } from 'react';
import type { IdeaDifficulty, IntegrationIdea, IntegrationType } from '@/lib/repositories';

const typeLabels: Record<IntegrationType, string> = {
  SDK: 'SDK',
  REST_API: 'REST API',
  DOCKER: 'Docker',
  WEBHOOK: 'Webhook',
  CLI: 'CLI',
};

// Clases completas (no construidas) para que Tailwind las detecte.
const difficulty: Record<IdeaDifficulty, { label: string; classes: string }> = {
  LOW: { label: 'Dificultad baja', classes: 'bg-health-active-tint text-health-active' },
  MEDIUM: { label: 'Dificultad media', classes: 'bg-health-moderate-tint text-health-moderate' },
  HIGH: { label: 'Dificultad alta', classes: 'bg-health-risk-tint text-health-risk' },
};

const chip =
  'inline-flex h-6 items-center rounded-sm border border-border bg-background px-2.5 text-xs font-medium text-foreground';

const languageLabels: Record<string, string> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  yaml: 'YAML',
  bash: 'Bash',
  json: 'JSON',
};

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Sin permiso para el portapapeles: el código sigue visible para copiarlo a mano.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="flex items-center gap-1.5 rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/40"
    >
      {copied ? (
        <Check className="size-3" strokeWidth={1.5} aria-hidden="true" />
      ) : (
        <Copy className="size-3" strokeWidth={1.5} aria-hidden="true" />
      )}
      {copied ? 'Copiado' : 'Copiar'}
    </button>
  );
}

function Idea({ idea }: { idea: IntegrationIdea }) {
  const { label, classes } = difficulty[idea.difficulty];

  return (
    <article className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <h3 className="text-base font-semibold">{idea.title}</h3>
        <span
          className={`inline-flex h-[22px] items-center rounded-sm px-2 text-xs font-medium ${classes}`}
        >
          {label}
        </span>
      </div>
      <p className="max-w-[640px] text-[13px] leading-5 text-muted-foreground">{idea.summary}</p>

      {idea.triggers.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Se dispara con</span>
          {idea.triggers.map((t) => (
            <span key={t.event} className="flex items-center gap-2">
              <span className={`${chip} font-mono`}>{t.event}</span>
              <span className="text-muted-foreground">{t.description}</span>
            </span>
          ))}
        </div>
      )}

      {idea.stackCompatibility.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Funciona con</span>
          {idea.stackCompatibility.map((s) => (
            <span key={s} className={chip}>
              {s}
            </span>
          ))}
        </div>
      )}

      {idea.snippet && (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex h-9 items-center justify-between border-b border-border px-3">
            <span className="text-xs text-muted-foreground">
              {languageLabels[idea.snippet.language] ?? idea.snippet.language}
            </span>
            <CopyButton code={idea.snippet.code} />
          </div>
          <pre className="overflow-x-auto p-3 font-mono text-[13px] leading-5">
            {idea.snippet.code}
          </pre>
        </div>
      )}

      {idea.connectsWith.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Se conecta con</span>
          {idea.connectsWith.map((r) => (
            <Link
              key={r.id}
              href={`/repositorios/${r.id}`}
              className="flex items-center gap-1 font-medium text-link hover:underline"
            >
              {r.fullName}
              <ArrowRight className="size-3" strokeWidth={1.5} aria-hidden="true" />
            </Link>
          ))}
        </p>
      )}
    </article>
  );
}

export function IntegrationIdeas({ ideas }: { ideas: IntegrationIdea[] }) {
  const types = (Object.keys(typeLabels) as IntegrationType[]).filter((t) =>
    ideas.some((i) => i.integrationType === t),
  );
  const [selected, setSelected] = useState<IntegrationType | undefined>(types[0]);

  return (
    <section aria-labelledby="integrar">
      <h2 id="integrar" className="text-[28px] leading-9 font-semibold tracking-[-0.02em]">
        Cómo integrarla
      </h2>

      {types.length === 0 || !selected ? (
        <p className="mt-4 rounded-lg border border-dashed border-border p-6 text-[13px] text-muted-foreground">
          Estamos curando las ideas de integración de esta herramienta. Volvé pronto.
        </p>
      ) : (
        <>
          <div
            role="tablist"
            aria-label="Tipo de integración"
            className="mt-4 flex gap-2 border-b border-border"
          >
            {types.map((type) => (
              <button
                key={type}
                role="tab"
                id={`tab-${type}`}
                aria-selected={selected === type}
                aria-controls={`panel-${type}`}
                onClick={() => setSelected(type)}
                className={`-mb-px h-9 border-b-2 px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground/40 ${
                  selected === type
                    ? 'border-foreground font-semibold text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {typeLabels[type]}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id={`panel-${selected}`}
            aria-labelledby={`tab-${selected}`}
            className="mt-5 flex flex-col gap-8"
          >
            {ideas
              .filter((i) => i.integrationType === selected)
              .map((idea) => (
                <Idea key={idea.id} idea={idea} />
              ))}
          </div>
        </>
      )}
    </section>
  );
}
