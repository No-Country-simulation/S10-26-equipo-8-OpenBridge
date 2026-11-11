'use client';

import { useEffect, useRef, useState } from 'react';
import { ConversationPanel } from '@/components/assistant/conversation-panel';
import { MapPanel } from '@/components/assistant/map-panel';
import {
  MAX_DESCRIPTION,
  MIN_DESCRIPTION,
  streamProposal,
  type AssistantError,
  type Proposal,
  type ProposalStage,
} from '@/lib/assistant';

type State =
  | { status: 'idle' }
  | { status: 'loading'; stage: ProposalStage }
  | { status: 'error'; error: AssistantError }
  | { status: 'done'; proposal: Proposal };

export function AssistantWorkspace({ initialDescription = '' }: { initialDescription?: string }) {
  // Una descripción válida que llega desde el home arranca la consulta sin pasos extra;
  // si no cumple el largo, el campo queda cargado y el aviso lo explica.
  const autoStart =
    initialDescription.length >= MIN_DESCRIPTION && initialDescription.length <= MAX_DESCRIPTION;
  const [submitted, setSubmitted] = useState<string | null>(autoStart ? initialDescription : null);
  const [state, setState] = useState<State>(
    autoStart ? { status: 'loading', stage: 'ANALYZING' } : { status: 'idle' },
  );
  const controller = useRef<AbortController | null>(null);

  async function stream(description: string) {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;

    for await (const event of streamProposal(description, {}, current.signal)) {
      if (current.signal.aborted) return;
      if (event.type === 'progress') setState({ status: 'loading', stage: event.stage });
      else if (event.type === 'result') setState({ status: 'done', proposal: event.proposal });
      else setState({ status: 'error', error: event.error });
    }
  }

  function run(description: string) {
    setSubmitted(description);
    setState({ status: 'loading', stage: 'ANALYZING' });
    return stream(description);
  }

  useEffect(() => {
    if (autoStart) void stream(initialDescription);
    // Si se sale de la pantalla a mitad de una consulta, se corta el pedido.
    return () => controller.current?.abort();
    // Solo al montar: la consulta del home se envía una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Detener o empezar de nuevo vuelven al formulario inicial.
  function reset() {
    controller.current?.abort();
    setSubmitted(null);
    setState({ status: 'idle' });
  }

  return (
    <div className="mx-auto grid w-full max-w-400 flex-1 grid-cols-1 lg:h-[calc(100dvh-3.5rem)] lg:grid-cols-[440px_minmax(0,1fr)]">
      <div className="min-h-0 border-border lg:border-r">
        <ConversationPanel
          key={submitted === null ? 'new' : 'chat'}
          submitted={submitted}
          initialDraft={autoStart ? '' : initialDescription}
          loadingStage={state.status === 'loading' ? state.stage : null}
          proposal={state.status === 'done' ? state.proposal : undefined}
          onSubmit={run}
          onStop={reset}
          onRetry={() => submitted && run(submitted)}
        />
      </div>
      <MapPanel
        status={state.status}
        error={state.status === 'error' ? state.error : undefined}
        proposal={state.status === 'done' ? state.proposal : undefined}
        description={submitted ?? ''}
        onRetry={() => submitted && run(submitted)}
        onReset={reset}
      />
    </div>
  );
}
