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
const TOO_LONG_HINT = `Con eso la descripción supera los ${MAX_DESCRIPTION.toLocaleString('es-AR')} caracteres. Empezá una nueva consulta con todo junto y más corto.`;

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
  // Respuestas a las preguntas del asistente cuando faltó contexto: se suman a la descripción
  // original en cada pedido (reintentos y ajustes incluidos) hasta "Nueva consulta".
  const [clarifications, setClarifications] = useState<string[]>([]);
  const needsContext = state.status === 'error' && state.error.code === 'INSUFFICIENT_CONTEXT';
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

  const withContext = (description: string, extra = clarifications) =>
    [description, ...extra].join('\n\n');

  function run(description: string, excluded = exclude, extra = clarifications) {
    setSubmitted(description);
    setState({ status: 'loading', stage: 'ANALYZING' });
    return stream(withContext(description, extra), excluded);
  }

  // Si faltó contexto, lo que se escribe responde las preguntas: se suma a la descripción y se
  // vuelve a pedir la propuesta.
  function clarify(description: string, text: string) {
    const extra = [...clarifications, text];
    if (withContext(description, extra).length > MAX_DESCRIPTION) {
      setAdjustments((list) => [...list, { text, hint: TOO_LONG_HINT }]);
      return;
    }
    setClarifications(extra);
    setAdjustments((list) => [...list, { text }]);
    void run(description, exclude, extra);
  }

  // Un ajuste reemplaza las herramientas de la propuesta actual que el texto nombra: se excluyen
  // y se vuelve a pedir la propuesta con la descripción original. Si no nombra ninguna, se
  // explica qué se puede pedir sin llamar a la API.
  function adjust(text: string) {
    if (!submitted || state.status === 'loading') return;
    if (needsContext) return clarify(submitted, text);
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
    setClarifications([]);
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
          needsContext={needsContext}
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
