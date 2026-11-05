import { z } from 'zod';
import { ideaDifficulty, ideaSource, integrationType } from '../db/schema.js';

const nonEmpty = z.string().trim().min(1);

const triggerSchema = z.object({
  event: nonEmpty,
  description: nonEmpty,
});

const snippetSchema = z.object({
  language: z.string('El fragmento de código necesita un lenguaje').trim().min(1, {
    message: 'El fragmento de código necesita un lenguaje',
  }),
  code: nonEmpty,
});

// El contenido de la idea: lo que escribe una persona o genera el modelo.
// Los enums salen del schema de Drizzle para que la base y la validación no
// se desincronicen.
const ideaContentSchema = z.object({
  title: nonEmpty,
  summary: nonEmpty,
  integrationType: z.enum(integrationType.enumValues),
  triggers: z.array(triggerSchema).default([]),
  snippet: snippetSchema.nullable().default(null),
  stackCompatibility: z.array(nonEmpty).default([]),
  difficulty: z.enum(ideaDifficulty.enumValues),
});

function requireWebhookTriggers(
  idea: z.output<typeof ideaContentSchema>,
  ctx: z.RefinementCtx,
): void {
  if (idea.integrationType === 'WEBHOOK' && idea.triggers.length === 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['triggers'],
      message: 'Una idea de tipo WEBHOOK necesita al menos un disparador',
    });
  }
}

// Lo que se acepta al crear una idea. status no está a propósito: toda idea
// nueva nace en DRAFT y pasa por curaduría (OB-19).
export const newIntegrationIdeaSchema = ideaContentSchema
  .extend({
    repositoryId: z.uuid(),
    connectsWith: z.array(z.uuid()).default([]),
    source: z.enum(ideaSource.enumValues),
  })
  .superRefine(requireWebhookTriggers);

// Lo que tiene que devolver el modelo (OB-18): de 1 a 3 ideas, sin los campos
// que completa el código. connectsWith queda vacío porque el modelo no conoce
// los ids de otros repos; lo carga la curaduría.
export const generatedIdeasSchema = z.object({
  ideas: z.array(ideaContentSchema.superRefine(requireWebhookTriggers)).min(1).max(3),
});

export type NewIntegrationIdeaInput = z.input<typeof newIntegrationIdeaSchema>;
export type GeneratedIdea = z.output<typeof generatedIdeasSchema>['ideas'][number];
