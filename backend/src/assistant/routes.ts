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
import { assistantError, capabilitiesRequestSchema } from './schema.js';

export function assistantRouter(
  db: Db,
  {
    model,
    prompt,
    embedQuery,
  }: { model: IdeaModel; prompt: CapabilitiesPrompt; embedQuery: EmbedQuery },
): Router {
  const router = Router();

  // 2.000 caracteres con escapes \uXXXX ocupan hasta 12 KB.
  router.post('/assistant/capabilities', express.json({ limit: '32kb' }), async (req, res) => {
    const body = capabilitiesRequestSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json(
        assistantError(
          'VALIDATION_ERROR',
          'La solicitud no es válida',
          body.error.issues.map((issue) => ({
            field: issue.path.join('.') || undefined,
            issue: issue.message,
          })),
        ),
      );
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

  // Errores de express.json() en el formato AssistantError que espera el
  // front (siempre con details), en lugar del ApiError del catálogo.
  const handleBodyError: ErrorRequestHandler = (error, _req, res, next) => {
    const status = typeof error?.status === 'number' ? error.status : 500;
    if (status === 413) {
      res
        .status(413)
        .json(assistantError('PAYLOAD_TOO_LARGE', 'La solicitud supera el tamaño permitido'));
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
