import { inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { repository } from '../db/schema.js';
import type { IdeaModel } from '../ideas/model.js';
import type { EmbedQuery } from '../search/service.js';
import { analyzeBusiness, retrieveCandidates, type SearchCatalog } from './capabilities.js';
import { composeProposal, MIN_MATURE_HEALTH, type HydratedRepository } from './compose.js';
import type { CapabilitiesPrompt } from './prompt.js';
import {
  proposalRequestSchema,
  type Proposal,
  type ProposalRequest,
  type ProposalStage,
} from './schema.js';

// Presupuesto de una propuesta. El front corta a los 30 s; el servidor
// responde antes de los 27 s para que el evento llegue con margen:
// - modelo: 23 s entre el intento (hasta 20 s, el timeout del modelo) y el
//   reintento;
// - búsquedas e hidratación: lo que quede hasta los 27 s, al menos 4 s. Con
//   bge-m3 local, una consulta tarda 0,1-0,5 s y las 3-8 van en paralelo.
// - componer es inmediato (sin E/S).
export const PROPOSAL_MODEL_BUDGET_MS = 23_000;
export const PROPOSAL_TOTAL_BUDGET_MS = 27_000;
// Candidatos por capacidad cuando el usuario restringe licencias (sin
// restricción alcanzan los 3 de OB-33). Mismo costo de embeddings: la consulta
// se vectoriza una vez, solo crece el LIMIT de la búsqueda.
export const CANDIDATES_WITH_LICENSE_FILTER = 10;

// Las búsquedas no terminaron dentro del presupuesto total (Ollama no
// vectoriza a tiempo o la base no responde).
export class RetrievalTimeoutError extends Error {
  constructor(ms: number) {
    super(`Las búsquedas no terminaron en ${ms / 1000} s`);
    this.name = 'RetrievalTimeoutError';
  }
}

// El cliente cerró la conexión: no tiene sentido seguir trabajando.
export class ProposalAbortedError extends Error {
  constructor() {
    super('El cliente cerró la conexión');
    this.name = 'ProposalAbortedError';
  }
}

export type ProposalResult =
  { status: 'OK'; proposal: Proposal } | { status: 'NEEDS_CONTEXT'; questions: string[] };

type IdeaRow = Pick<HydratedRepository['ideas'][number], 'integrationType' | 'connectsWith'>;

// Datos reales de los candidatos en una sola consulta: ficha del repo y sus
// ideas APPROVED. Un id que no está en `repository` no vuelve: así se
// descartan los ids que el catálogo no conoce.
export async function hydrateRepositories(db: Db, ids: string[]): Promise<HydratedRepository[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const rows = await db
    .select({
      id: repository.id,
      fullName: repository.fullName,
      healthScore: repository.healthScore,
      licenseSpdx: repository.licenseSpdx,
      stars: repository.stars,
      // Con una sola tabla en el FROM, Drizzle escribe ${repository.id} como
      // "id" a secas, que adentro de la subconsulta sería i.id: va calificado.
      ideas: sql<IdeaRow[]>`coalesce((
        SELECT json_agg(
          json_build_object('integrationType', i.integration_type, 'connectsWith', i.connects_with)
          ORDER BY i.created_at, i.id
        )
        FROM integration_idea i
        WHERE i.repository_id = "repository"."id" AND i.status = 'APPROVED'
      ), '[]'::json)`,
    })
    .from(repository)
    .where(inArray(repository.id, unique));
  return rows;
}

async function withDeadline<T>(promise: Promise<T>, deadline: number, budgetMs: number) {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new RetrievalTimeoutError(budgetMs)),
      Math.max(0, deadline - Date.now()),
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// OB-34: una sola llamada al modelo (capacidades con integrationType y
// dependsOn), las búsquedas de candidatos en paralelo, la hidratación desde
// la base y el composer determinístico. Avisa cada etapa con onStage.
export async function createProposal(
  db: Db,
  input: ProposalRequest,
  {
    model,
    prompt,
    embedQuery,
    search,
    modelBudgetMs = PROPOSAL_MODEL_BUDGET_MS,
    totalBudgetMs = PROPOSAL_TOTAL_BUDGET_MS,
  }: {
    model: IdeaModel;
    prompt: CapabilitiesPrompt;
    embedQuery: EmbedQuery;
    search?: SearchCatalog;
    modelBudgetMs?: number;
    totalBudgetMs?: number;
  },
  { onStage, signal }: { onStage?: (stage: ProposalStage) => void; signal?: AbortSignal } = {},
): Promise<ProposalResult> {
  const { description, constraints } = proposalRequestSchema.parse(input);
  const deadline = Date.now() + totalBudgetMs;
  const stage = (next: ProposalStage) => {
    if (signal?.aborted) throw new ProposalAbortedError();
    onStage?.(next);
  };

  stage('ANALYZING');
  const analysis = await analyzeBusiness(description, {
    model,
    prompt,
    budgetMs: Math.min(modelBudgetMs, totalBudgetMs),
  });
  if (analysis.status === 'NEEDS_CONTEXT') return analysis;

  stage('RETRIEVING');
  // Pedir ya los candidatos con la salud mínima del composer: así los 3 por
  // capacidad son elegibles por salud.
  const minHealth = Math.max(MIN_MATURE_HEALTH, constraints.minHealth ?? 0);
  const { withCandidates, repositories } = await withDeadline(
    (async () => {
      const found = await retrieveCandidates(db, analysis.capabilities, {
        embedQuery,
        minHealth,
        // La búsqueda no filtra por licencia: con licencias pedidas se traen más
        // candidatos para que el composer encuentre un compatible fuera de los
        // 3 primeros en lugar de declarar un hueco.
        limit: constraints.licenses?.length ? CANDIDATES_WITH_LICENSE_FILTER : undefined,
        search,
      });
      if (signal?.aborted) throw new ProposalAbortedError();
      const hydrated = await hydrateRepositories(
        db,
        found.flatMap(({ candidates }) => candidates.map((c) => c.repository.id)),
      );
      return { withCandidates: found, repositories: hydrated };
    })(),
    deadline,
    totalBudgetMs,
  );

  stage('COMPOSING');
  const proposal = composeProposal(
    withCandidates.map(({ candidates, ...capability }) => ({
      key: capability.key,
      name: capability.name,
      reason: capability.reason,
      integrationType: capability.integrationType,
      dependsOn: capability.dependsOn,
      candidateIds: candidates.map((c) => c.repository.id),
    })),
    repositories,
    constraints,
  );
  return { status: 'OK', proposal };
}
