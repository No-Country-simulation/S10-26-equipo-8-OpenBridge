'use client';

import { useEffect, useRef, useState } from 'react';
import { ConversationPanel, type Adjustment } from '@/components/assistant/conversation-panel';
import { MapPanel } from '@/components/assistant/map-panel';
import {
  MAX_DESCRIPTION,
  MAX_EXCLUDED,
  MIN_DESCRIPTION,
  streamProposal,
  type AssistantError,
  type Proposal,
  type ProposalStage,
} from '@/lib/assistant';
import { namedComponents } from '@/lib/assistant-format';

const ADJUST_HINT =
  'Por ahora puedo reemplazar herramientas de la propuesta: nombrá cuál querés cambiar (por ejemplo, «cambiá Authelia»).';

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
  // Ajustes pedidos sobre la propuesta y los repos que el usuario pidió cambiar; viven hasta
  // "Nueva consulta".
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [exclude, setExclude] = useState<string[]>([]);
  // La última propuesta que llegó: un ajuste se puede pedir aunque el reintento haya fallado.
  const lastProposal = useRef<Proposal | null>(null);
  const controller = useRef<AbortController | null>(null);

  async function stream(description: string, excluded: string[]) {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;

    const constraints = excluded.length > 0 ? { exclude: excluded } : {};
    for await (const event of streamProposal(description, constraints, current.signal)) {
      if (current.signal.aborted) return;
      if (event.type === 'progress') setState({ status: 'loading', stage: event.stage });
      else if (event.type === 'result') {
        lastProposal.current = event.proposal;
        setState({ status: 'done', proposal: event.proposal });
      } else setState({ status: 'error', error: event.error });
    }
  }

  function run(description: string, excluded = exclude) {
    setSubmitted(description);
    setState({ status: 'loading', stage: 'ANALYZING' });
    return stream(description, excluded);
  }

  // Un ajuste reemplaza las herramientas de la propuesta actual que el texto nombra: se excluyen
  // y se vuelve a pedir la propuesta con la descripción original. Si no nombra ninguna, se
  // explica qué se puede pedir sin llamar a la API.
  function adjust(text: string) {
    if (!submitted || state.status === 'loading') return;
    const named = lastProposal.current ? namedComponents(lastProposal.current, text) : [];
    if (named.length === 0) {
      setAdjustments((list) => [...list, { text, hint: ADJUST_HINT }]);
      return;
    }
    const excluded = [...new Set([...exclude, ...named])].slice(-MAX_EXCLUDED);
    setExclude(excluded);
    setAdjustments((list) => [...list, { text }]);
    void run(submitted, excluded);
  }

  useEffect(() => {
    if (autoStart) void stream(initialDescription, []);
    // Si se sale de la pantalla a mitad de una consulta, se corta el pedido.
    return () => controller.current?.abort();
    // Solo al montar: la consulta del home se envía una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Detener o empezar de nuevo vuelven al formulario inicial.
  function reset() {
    controller.current?.abort();
    setSubmitted(null);
    setAdjustments([]);
    setExclude([]);
    lastProposal.current = null;
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
          adjustments={adjustments}
          proposal={state.status === 'done' ? state.proposal : undefined}
          onSubmit={(description) => run(description)}
          onAdjust={adjust}
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
