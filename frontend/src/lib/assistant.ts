import { API_URL } from '@/lib/api';
import { mockProposal } from '@/lib/assistant-mock';
import type { IntegrationType } from '@/lib/repositories';

// POST /api/v1/assistant/proposals (contrato v1): la descripción tiene entre 20 y 2.000 caracteres.
export const MIN_DESCRIPTION = 20;
export const MAX_DESCRIPTION = 2000;
// Sin respuesta del modelo en 30 s el servidor corta con UPSTREAM_TIMEOUT; el cliente espera lo mismo.
export const PROPOSAL_TIMEOUT_MS = 30_000;

export type ProposalStage = 'ANALYZING' | 'RETRIEVING' | 'COMPOSING';

// Hasta cuántos repos acepta exclude el backend.
export const MAX_EXCLUDED = 20;

export type ProposalConstraints = {
  minHealth?: number;
  licenses?: string[];
  // Ids de repos que el usuario pidió cambiar: no vuelven ni como alternativa.
  exclude?: string[];
};

export type Proposal = {
  id: string;
  createdAt: string;
  cached: boolean;
  capabilities: { key: string; name: string; reason: string }[];
  components: {
    capability: string;
    repository: {
      id: string;
      fullName: string;
      healthScore: number;
      licenseSpdx: string | null;
    };
    justification: string;
    integrationType: IntegrationType;
    alternative?: { id: string; fullName: string };
  }[];
  connections: {
    from: string;
    to: string;
    integrationType: IntegrationType;
    // CATALOG sale del catálogo curado; MODEL_SUGGESTION lo sugirió el modelo y conviene validarlo.
    source: 'CATALOG' | 'MODEL_SUGGESTION';
  }[];
  // Capacidades sin candidatos con salud suficiente.
  gaps: { capability: string; message: string }[];
};

// Mismo objeto de error que el resto del contrato, más Retry-After cuando hay límite de uso.
export type AssistantError = {
  code:
    | 'VALIDATION_ERROR'
    | 'INSUFFICIENT_CONTEXT'
    | 'RATE_LIMITED'
    | 'UPSTREAM_TIMEOUT'
    | 'INTERNAL_ERROR';
  message: string;
  details: { field?: string; issue?: string }[];
  retryAfterSeconds?: number;
};

export type AssistantEvent =
  | { type: 'progress'; stage: ProposalStage }
  | { type: 'result'; proposal: Proposal }
  | { type: 'error'; error: AssistantError };

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });

// Simula el flujo del servidor: las tres etapas y después la propuesta, con la forma del contrato.
async function* mockStream(signal: AbortSignal): AsyncGenerator<AssistantEvent> {
  for (const stage of ['ANALYZING', 'RETRIEVING', 'COMPOSING'] as const) {
    yield { type: 'progress', stage };
    await wait(900, signal);
  }
  yield { type: 'result', proposal: mockProposal };
}

type SseMessage = { event: string; data: string };

// Lee un cuerpo text/event-stream y entrega un mensaje por cada bloque separado por línea en blanco.
async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let end = buffer.indexOf('\n\n');
      while (end !== -1) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const lines = block.split('\n');
        const event =
          lines
            .find((l) => l.startsWith('event:'))
            ?.slice(6)
            .trim() ?? 'message';
        const data = lines
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trim())
          .join('\n');
        if (data) yield { event, data };
        end = buffer.indexOf('\n\n');
      }
    }
  } finally {
    reader.releaseLock();
  }
}

const internalError = (message: string): AssistantEvent => ({
  type: 'error',
  error: { code: 'INTERNAL_ERROR', message, details: [] },
});

async function* apiStream(
  baseUrl: string,
  description: string,
  constraints: ProposalConstraints,
  signal: AbortSignal,
): AsyncGenerator<AssistantEvent> {
  const res = await fetch(`${baseUrl}/assistant/proposals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ description, constraints }),
    signal,
  });

  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null);
    const retryAfter = Number(res.headers.get('Retry-After'));
    yield body?.error
      ? {
          type: 'error',
          error: {
            ...body.error,
            retryAfterSeconds:
              Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
          },
        }
      : internalError('El servidor no pudo procesar la solicitud.');
    return;
  }

  let finished = false;
  for await (const { event, data } of readSse(res.body)) {
    const payload = JSON.parse(data);
    if (event === 'progress') {
      yield { type: 'progress', stage: payload.stage };
    } else if (event === 'result') {
      const proposal = payload.data ?? payload;
      finished = true;
      yield isProposal(proposal)
        ? { type: 'result', proposal }
        : internalError('El asistente devolvió una propuesta incompleta.');
      return;
    } else if (event === 'error') {
      finished = true;
      yield { type: 'error', error: { details: [], ...(payload.error ?? payload) } };
      return;
    }
  }
  // La conexión se cerró sin resultado ni error (corte de red o del proxy): sin esto la pantalla
  // quedaría cargando para siempre.
  if (!finished) yield internalError('Se cortó la conexión con el asistente. Probá de nuevo.');
}

function isProposal(value: unknown): value is Proposal {
  const v = value as Partial<Proposal> | null;
  return (
    !!v &&
    typeof v.id === 'string' &&
    Array.isArray(v.capabilities) &&
    Array.isArray(v.components) &&
    Array.isArray(v.connections) &&
    Array.isArray(v.gaps)
  );
}

// Pide una propuesta y entrega los eventos a medida que llegan. Sin NEXT_PUBLIC_API_URL usa un
// flujo simulado con la misma forma, así la pantalla no cambia cuando el backend esté listo.
export async function* streamProposal(
  description: string,
  constraints: ProposalConstraints = {},
  signal?: AbortSignal,
): AsyncGenerator<AssistantEvent> {
  const controller = new AbortController();
  const timeout = new Error('timeout');
  const timer = setTimeout(() => controller.abort(timeout), PROPOSAL_TIMEOUT_MS);
  signal?.addEventListener('abort', () => controller.abort(signal.reason));

  try {
    yield* API_URL
      ? apiStream(API_URL, description, constraints, controller.signal)
      : mockStream(controller.signal);
  } catch (error) {
    if (controller.signal.reason === timeout) {
      yield {
        type: 'error',
        error: {
          code: 'UPSTREAM_TIMEOUT',
          message: 'El asistente tardó más de 30 segundos en responder.',
          details: [],
        },
      };
    } else if (!signal?.aborted) {
      yield internalError(error instanceof Error ? error.message : 'Error inesperado.');
    }
  } finally {
    clearTimeout(timer);
  }
}
