import { z } from 'zod';
import { BASE_CATEGORIES } from '../db/seed.js';
import { searchResultSchema } from '../search/schema.js';

export const MIN_DESCRIPTION = 20;
export const MAX_DESCRIPTION = 2000;
export const MIN_CAPABILITIES = 3;
export const MAX_CAPABILITIES = 8;
export const MAX_MISSING_CONTEXT = 3;

const categorySlugs = BASE_CATEGORIES.map(({ slug }) => slug) as [string, ...string[]];
const nonEmpty = z.string().trim().min(1);

// Cuerpo de POST /api/v1/assistant/capabilities. Mismos límites que el front
// (frontend/src/lib/assistant.ts).
export const capabilitiesRequestSchema = z.object({
  description: z.string().trim().min(MIN_DESCRIPTION).max(MAX_DESCRIPTION),
  constraints: z.object({ minHealth: z.number().int().min(0).max(100).optional() }).default({}),
});

export type CapabilitiesRequest = z.input<typeof capabilitiesRequestSchema>;

// Lo que tiene que devolver el modelo. Todos los campos son obligatorios: con
// la salida JSON forzada, los modelos chicos saltean los opcionales.
export const modelCapabilitySchema = z.object({
  // Identificador estable de la capacidad: el slug de la categoría del
  // catálogo cuando hay una (auth, payments…) y si no, uno corto en kebab-case.
  key: z
    .string()
    .regex(/^[a-z][a-z0-9-]*$/, 'en minúsculas y kebab-case')
    .max(40),
  name: nonEmpty.max(60),
  // La justificación de una línea que pide OB-33.
  reason: nonEmpty.max(200),
  // Lo que se busca en el catálogo para esta capacidad (búsqueda de OB-32).
  query: nonEmpty.max(200),
  // Categoría del catálogo que la cubre, o null si no hay ninguna.
  category: z.enum(categorySlugs).nullable(),
});

export const modelOutputSchema = z
  .object({
    sufficientContext: z.boolean(),
    // Si falta contexto, las preguntas para pedírselo al usuario.
    missingContext: z.array(nonEmpty.max(200)).max(MAX_MISSING_CONTEXT),
    capabilities: z.array(modelCapabilitySchema).max(MAX_CAPABILITIES),
  })
  .superRefine((output, ctx) => {
    // El mínimo no va en el JSON schema: con contexto insuficiente la lista va
    // vacía. Si el modelo se queda corto, el reintento le muestra este error.
    if (output.sufficientContext && output.capabilities.length < MIN_CAPABILITIES) {
      ctx.addIssue({
        code: 'custom',
        path: ['capabilities'],
        message: `Con contexto suficiente tiene que haber al menos ${MIN_CAPABILITIES} capacidades`,
      });
    }
    if (!output.sufficientContext && output.missingContext.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['missingContext'],
        message: 'Sin contexto suficiente tiene que haber al menos una pregunta',
      });
    }
    const keys = output.capabilities.map(({ key }) => key);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['capabilities'],
        message: 'Cada capacidad tiene que tener una key distinta',
      });
    }
  });

export type ModelOutput = z.output<typeof modelOutputSchema>;
export type ModelCapability = z.output<typeof modelCapabilitySchema>;

export const capabilitySchema = modelCapabilitySchema.extend({
  // Repos del catálogo más parecidos a `query`, de la búsqueda de OB-32.
  candidates: z.array(searchResultSchema),
});

export const capabilitiesResponseSchema = z.object({
  data: z.object({ capabilities: z.array(capabilitySchema) }),
});

export type Capability = z.output<typeof capabilitySchema>;

// Errores del asistente: mismo objeto que el front espera (AssistantError),
// con detalles por campo.
export const assistantErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.object({ field: z.string().optional(), issue: z.string() })),
  }),
});

export type AssistantErrorBody = z.output<typeof assistantErrorSchema>;

export const assistantError = (
  code: string,
  message: string,
  details: { field?: string; issue: string }[] = [],
): AssistantErrorBody => ({ error: { code, message, details } });
