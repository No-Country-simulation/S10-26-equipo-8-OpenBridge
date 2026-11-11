import express, { Router, type ErrorRequestHandler } from 'express';
import type { Db } from '../db/client.js';
import { ModelTimeoutError, type IdeaModel } from '../ideas/model.js';
import { EmbeddingsUnavailableError, type EmbedQuery } from '../search/service.js';
import {
  decomposeBusiness,
  InvalidModelResponseError,
  ModelUnavailableError,
} from './capabilities.js';
import type { CapabilitiesPrompt } from './prompt.js';
import { createProposal, ProposalAbortedError, RetrievalTimeoutError } from './proposal.js';
import {
  assistantError,
  capabilitiesRequestSchema,
  proposalRequestSchema,
  type AssistantErrorBody,
} from './schema.js';

// Cada cuánto se manda un comentario SSE mientras se arma la propuesta.
const SSE_KEEP_ALIVE_MS = 10_000;

const validationError = (issues: { path: PropertyKey[]; message: string }[]) =>
  assistantError(
    'VALIDATION_ERROR',
    'La solicitud no es válida',
    issues.map((issue) => ({
      field: issue.path.map(String).join('.') || undefined,
      issue: issue.message,
    })),
  );

// Error de la propuesta como evento SSE, con los códigos que conoce el front
// (AssistantError en frontend/src/lib/assistant.ts). El detalle real solo va
// al log.
function proposalStreamError(error: unknown): AssistantErrorBody {
  if (error instanceof ModelTimeoutError || error instanceof RetrievalTimeoutError) {
    return assistantError('UPSTREAM_TIMEOUT', 'El asistente tardó demasiado en responder');
  }
  if (error instanceof InvalidModelResponseError) {
    console.error(`${error.message}\nRespuesta del modelo: ${error.raw}`);
  } else {
    console.error(error);
  }
  return assistantError(
    'INTERNAL_ERROR',
    'No se pudo armar la propuesta. Probá de nuevo en unos minutos.',
  );
}

export function assistantRouter(
  db: Db,
  {
    model,
    prompt,
    embedQuery,
    keepAliveMs = SSE_KEEP_ALIVE_MS,
  }: {
    model: IdeaModel;
    prompt: CapabilitiesPrompt;
    embedQuery: EmbedQuery;
    keepAliveMs?: number;
  },
): Router {
  const router = Router();

  // 2.000 caracteres con escapes \uXXXX ocupan hasta 12 KB.
  router.post('/assistant/capabilities', express.json({ limit: '32kb' }), async (req, res) => {
    const body = capabilitiesRequestSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json(validationError(body.error.issues));
      return;
    }

    try {
      const result = await decomposeBusiness(db, body.data, { model, prompt, embedQuery });
      if (result.status === 'NEEDS_CONTEXT') {
        res.status(422).json(
          assistantError(
            'INSUFFICIENT_CONTEXT',
            'Necesito más contexto sobre el producto para recomendar una arquitectura',
            result.questions.map((issue) => ({ field: 'description', issue })),
          ),
        );
        return;
      }
      res.json({ data: { capabilities: result.capabilities } });
    } catch (error) {
      if (error instanceof ModelTimeoutError) {
        res
          .status(504)
          .json(assistantError('UPSTREAM_TIMEOUT', 'El modelo tardó demasiado en responder'));
        return;
      }
      if (error instanceof ModelUnavailableError || error instanceof EmbeddingsUnavailableError) {
        console.error(error);
        res
          .status(503)
          .json(assistantError('UPSTREAM_UNAVAILABLE', 'El asistente no está disponible'));
        return;
      }
      if (error instanceof InvalidModelResponseError) {
        console.error(`${error.message}\nRespuesta del modelo: ${error.raw}`);
        res
          .status(502)
          .json(
            assistantError(
              'MODEL_INVALID_RESPONSE',
              'El modelo devolvió una respuesta inválida. Probá de nuevo.',
            ),
          );
        return;
      }
      throw error;
    }
  });

  // OB-34: la propuesta llega por SSE (progress × 3 y result, o error). Los
  // errores de validación van antes del stream, como JSON con su status: el
  // front los lee con res.json() cuando !res.ok.
  router.post('/assistant/proposals', express.json({ limit: '32kb' }), async (req, res) => {
    const body = proposalRequestSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json(validationError(body.error.issues));
      return;
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    // Sin buffer en proxies como nginx: cada evento sale en el momento.
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Si el cliente se va, se deja de trabajar y no se escribe más.
    const controller = new AbortController();
    res.on('close', () => controller.abort());
    const send = (event: string, data: unknown) => {
      if (controller.signal.aborted || res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    // Entre ANALYZING y RETRIEVING pueden pasar ~20 s sin eventos: un
    // comentario SSE periódico evita que un proxy corte la conexión inactiva.
    // No tiene data, así que el front lo ignora.
    const keepAlive = setInterval(() => {
      if (!controller.signal.aborted && !res.writableEnded) res.write(': ping\n\n');
    }, keepAliveMs);

    try {
      const result = await createProposal(
        db,
        body.data,
        { model, prompt, embedQuery },
        { onStage: (stage) => send('progress', { stage }), signal: controller.signal },
      );
      if (result.status === 'NEEDS_CONTEXT') {
        send(
          'error',
          assistantError(
            'INSUFFICIENT_CONTEXT',
            'Necesito más contexto sobre el producto para recomendar una arquitectura',
            result.questions.map((issue) => ({ field: 'description', issue })),
          ),
        );
      } else {
        send('result', { data: result.proposal });
      }
    } catch (error) {
      // Con los headers enviados, el manejador global ya no puede responder:
      // todo error se convierte en un evento.
      if (!(error instanceof ProposalAbortedError) && !controller.signal.aborted) {
        send('error', proposalStreamError(error));
      }
    } finally {
      clearInterval(keepAlive);
      if (!res.writableEnded) res.end();
    }
  });

  // Errores de express.json() en el formato AssistantError que espera el
  // front (siempre con details), en lugar del ApiError del catálogo.
  const handleBodyError: ErrorRequestHandler = (error, req, res, next) => {
    const status = typeof error?.status === 'number' ? error.status : 500;
    if (status === 413) {
      // El contrato de propuestas (front) no tiene PAYLOAD_TOO_LARGE: va como
      // VALIDATION_ERROR. Capacidades mantiene su código de OB-33.
      const code = req.path === '/proposals' ? 'VALIDATION_ERROR' : 'PAYLOAD_TOO_LARGE';
      res.status(413).json(assistantError(code, 'La solicitud supera el tamaño permitido'));
      return;
    }
    if (status >= 400 && status < 500) {
      const message =
        error.type === 'entity.parse.failed' ? 'El cuerpo no es un JSON válido' : error.message;
      res.status(status).json(assistantError('VALIDATION_ERROR', message));
      return;
    }
    next(error);
  };
  router.use('/assistant', handleBodyError);

  return router;
}
