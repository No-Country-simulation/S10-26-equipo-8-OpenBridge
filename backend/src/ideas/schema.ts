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

// Lo que se acepta al crear una idea. Los enums salen del schema de Drizzle
// para que la base y la validación no se desincronicen. status no está a
// propósito: toda idea nueva nace en DRAFT y pasa por curaduría (OB-19).
export const newIntegrationIdeaSchema = z
  .object({
    repositoryId: z.uuid(),
    title: nonEmpty,
    summary: nonEmpty,
    integrationType: z.enum(integrationType.enumValues),
    triggers: z.array(triggerSchema).default([]),
    snippet: snippetSchema.nullable().default(null),
    stackCompatibility: z.array(nonEmpty).default([]),
    difficulty: z.enum(ideaDifficulty.enumValues),
    connectsWith: z.array(z.uuid()).default([]),
    source: z.enum(ideaSource.enumValues),
  })
  .superRefine((idea, ctx) => {
    if (idea.integrationType === 'WEBHOOK' && idea.triggers.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['triggers'],
        message: 'Una idea de tipo WEBHOOK necesita al menos un disparador',
      });
    }
  });

export type NewIntegrationIdeaInput = z.input<typeof newIntegrationIdeaSchema>;
