import { z } from 'zod';
import { integrationType } from '../db/schema.js';
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

export const MAX_LICENSES = 20;

// Cuerpo de POST /api/v1/assistant/proposals: lo mismo más las licencias
// aceptadas (identificadores SPDX; vacío o ausente = cualquiera).
export const proposalRequestSchema = capabilitiesRequestSchema.extend({
  constraints: z
    .object({
      minHealth: z.number().int().min(0).max(100).optional(),
      licenses: z.array(z.string().trim().min(1).max(64)).max(MAX_LICENSES).optional(),
    })
    .default({}),
});

export type ProposalRequest = z.input<typeof proposalRequestSchema>;
export type ProposalConstraints = z.output<typeof proposalRequestSchema>['constraints'];

// Lo que tiene que devolver el modelo. Todos los campos son obligatorios: con
// la salida JSON forzada, los modelos chicos saltean los opcionales.
// Prompt v1 (OB-33): la capacidad y cómo buscarla.
export const modelCapabilityV1Schema = z.object({
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

export const INTEGRATION_TYPES = integrationType.enumValues;
export type IntegrationType = (typeof INTEGRATION_TYPES)[number];

// Prompt v2 (OB-34): además, cómo se integra la capacidad y con qué otras
// capacidades de la misma respuesta se conecta. Las keys de dependsOn que no
// existen o apuntan a sí misma se descartan en el código (ver proposal.ts),
// no en el esquema: un reintento por eso costaría segundos del presupuesto.
export const modelCapabilitySchema = modelCapabilityV1Schema.extend({
  integrationType: z.enum(INTEGRATION_TYPES),
  dependsOn: z.array(z.string().max(40)).max(MAX_CAPABILITIES),
});

const outputSchemaOf = <T extends z.ZodType<{ key: string }>>(capability: T) =>
  z
    .object({
      sufficientContext: z.boolean(),
      // Si falta contexto, las preguntas para pedírselo al usuario.
      missingContext: z.array(nonEmpty.max(200)).max(MAX_MISSING_CONTEXT),
      capabilities: z.array(capability).max(MAX_CAPABILITIES),
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

export const modelOutputV1Schema = outputSchemaOf(modelCapabilityV1Schema);
export const modelOutputSchema = outputSchemaOf(modelCapabilitySchema);

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

// Propuesta de stack (OB-34): el evento `result` del stream. Misma forma que
// Proposal en frontend/src/lib/assistant.ts.
export const proposalSchema = z.object({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  cached: z.boolean(),
  capabilities: z.array(z.object({ key: z.string(), name: z.string(), reason: z.string() })),
  components: z.array(
    z.object({
      capability: z.string(),
      repository: z.object({
        id: z.string(),
        fullName: z.string(),
        healthScore: z.number().int().min(0).max(100),
        licenseSpdx: z.string().nullable(),
      }),
      justification: z.string(),
      integrationType: z.enum(INTEGRATION_TYPES),
      alternative: z.object({ id: z.string(), fullName: z.string() }).optional(),
    }),
  ),
  connections: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      integrationType: z.enum(INTEGRATION_TYPES),
      // CATALOG: de una idea aprobada; MODEL_SUGGESTION: la sugirió el modelo.
      source: z.enum(['CATALOG', 'MODEL_SUGGESTION']),
    }),
  ),
  // Capacidades sin candidatos elegibles.
  gaps: z.array(z.object({ capability: z.string(), message: z.string() })),
});

export type Proposal = z.output<typeof proposalSchema>;

export const PROPOSAL_STAGES = ['ANALYZING', 'RETRIEVING', 'COMPOSING'] as const;
export type ProposalStage = (typeof PROPOSAL_STAGES)[number];

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
