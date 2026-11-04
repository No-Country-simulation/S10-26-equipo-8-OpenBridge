'use client';

import { useEffect, useRef, useState } from 'react';
import { ConversationPanel } from '@/components/assistant/conversation-panel';
import { MapPanel } from '@/components/assistant/map-panel';
import {
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

export function AssistantWorkspace() {
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [state, setState] = useState<State>({ status: 'idle' });
  const controller = useRef<AbortController | null>(null);

  // Si se sale de la pantalla a mitad de una consulta, se corta el pedido.
  useEffect(() => () => controller.current?.abort(), []);

  async function run(description: string) {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setSubmitted(description);
    setState({ status: 'loading', stage: 'ANALYZING' });

    for await (const event of streamProposal(description, {}, current.signal)) {
      if (current.signal.aborted) return;
      if (event.type === 'progress') setState({ status: 'loading', stage: event.stage });
      else if (event.type === 'result') setState({ status: 'done', proposal: event.proposal });
      else setState({ status: 'error', error: event.error });
    }
  }

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
