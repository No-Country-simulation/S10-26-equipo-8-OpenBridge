'use client';

import { useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { CategoryDot } from '@/components/category-dot';
import { Button } from '@/components/ui/button';

// Campo `description` de POST /assistant/proposals: de 20 a 2.000 caracteres (contrato v1, OB-35).
const MIN_LENGTH = 20;
const MAX_LENGTH = 2000;

const examples = [
  'E-commerce B2B de logística',
  'App interna con IA sobre documentos',
  'Marketplace con pagos divididos',
];

const chip =
  'inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[13px] text-foreground';

function FlowStep({ name, slug }: { name: string; slug?: string }) {
  return (
    <span className={`${chip} font-medium`}>
      {slug ? (
        <CategoryDot slug={slug} />
      ) : (
        <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-muted-foreground" />
      )}
      {name}
    </span>
  );
}

function FlowArrow() {
  return <ArrowRight className="size-3 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />;
}

export function AssistantPanel() {
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');

  const length = text.trim().length;
  const isValid = length >= MIN_LENGTH;

  function fillExample(example: string) {
    setText(example);
    textareaRef.current?.focus();
  }

  return (
    <section
      aria-labelledby="assistant-title"
      className="flex flex-col gap-8 rounded-xl border border-border bg-muted p-5 sm:p-8 lg:flex-row lg:gap-12"
    >
      <div className="flex flex-col gap-2 lg:w-125 lg:shrink-0">
        <h2
          id="assistant-title"
          className="text-2xl font-semibold leading-8 tracking-[-0.02em] text-foreground md:text-[28px] md:leading-9"
        >
          Contanos qué estás construyendo
        </h2>
        <p className="max-w-110 text-[15px] leading-[23px] text-muted-foreground">
          El asistente busca en el catálogo y te propone una arquitectura con herramientas
          concretas y cómo conectarlas.
        </p>

        <p className="mt-4 text-xs text-muted-foreground">
          Ejemplo · E-commerce B2B de logística
        </p>
        <div className="flex flex-wrap items-center gap-2" aria-hidden="true">
          <FlowStep name="Next.js" />
          <FlowArrow />
          <FlowStep name="Keycloak" slug="auth" />
          <FlowArrow />
          <FlowStep name="PostgreSQL" slug="database" />
          <FlowArrow />
          <FlowStep name="Meilisearch" slug="search" />
        </div>
      </div>

      <form
        ref={formRef}
        action="/asistente"
        onSubmit={(e) => {
          if (!isValid) e.preventDefault();
        }}
        className="flex min-w-0 flex-1 flex-col gap-3"
      >
        <label className="sr-only" htmlFor="assistant-description">
          Descripción de lo que estás construyendo
        </label>
        <div className="flex h-24 flex-col justify-between rounded-lg border border-border bg-background p-3 focus-within:border-foreground/40">
          <textarea
            id="assistant-description"
            ref={textareaRef}
            name="description"
            value={text}
            maxLength={MAX_LENGTH}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                if (isValid) formRef.current?.requestSubmit();
              }
            }}
            aria-describedby="assistant-hint"
            placeholder="Ej.: SaaS de turnos médicos con pagos online, multi-tenant, equipo en TypeScript"
            className="min-h-0 w-full flex-1 resize-none bg-transparent text-sm leading-5 text-foreground outline-none placeholder:text-muted-foreground"
          />
          <span className="text-right font-mono text-xs text-muted-foreground">
            {text.length} / {MAX_LENGTH}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => fillExample(example)}
              className={`${chip} transition-colors hover:border-border-strong hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground/40`}
            >
              {example}
            </button>
          ))}
        </div>

        <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p id="assistant-hint" aria-live="polite" className="text-xs text-muted-foreground">
            {isValid
              ? 'Se abre en el Asistente · ⌘ Enter para enviar'
              : `Escribí al menos ${MIN_LENGTH} caracteres para continuar`}
          </p>
          <Button type="submit" disabled={!isValid} className="h-10 rounded-md px-4">
            Armar arquitectura
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      </form>
    </section>
  );
}
