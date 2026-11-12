import { randomUUID } from 'node:crypto';
import type { IntegrationType, Proposal, ProposalConstraints } from './schema.js';

// Salud mínima para recomendar un repo, aunque el usuario pida menos: por
// debajo de 40 el catálogo lo marca AT_RISK.
export const MIN_MATURE_HEALTH = 40;
export const NO_MATURE_OPTION = 'Sin opción madura en el catálogo';

// Lo que el composer necesita de cada capacidad: lo que dijo el modelo y los
// ids de sus candidatos, en el orden de la búsqueda (más parecido primero).
export interface ComposerCapability {
  key: string;
  name: string;
  reason: string;
  integrationType: IntegrationType;
  dependsOn: string[];
  candidateIds: string[];
}

// Datos reales de un candidato, leídos de la base (ver hydrateRepositories).
export interface HydratedRepository {
  id: string;
  fullName: string;
  healthScore: number | null;
  licenseSpdx: string | null;
  stars: number;
  // Solo las ideas APPROVED, de la más vieja a la más nueva.
  ideas: { integrationType: IntegrationType; connectsWith: string[] }[];
}

type Component = Proposal['components'][number];
type Connection = Proposal['connections'][number];

const starsFormat = new Intl.NumberFormat('es-AR');

// Frase determinística: la razón del modelo más datos del catálogo. Nada que
// el catálogo no respalde.
function justify(reason: string, repo: HydratedRepository & { healthScore: number }): string {
  const sentence = /[.!?]$/.test(reason.trim()) ? reason.trim() : `${reason.trim()}.`;
  const license = repo.licenseSpdx ? `licencia ${repo.licenseSpdx}` : 'sin licencia declarada';
  return (
    `${sentence} ${repo.fullName} tiene salud ${repo.healthScore}/100, ${license} y ` +
    `${starsFormat.format(repo.stars)} estrellas en GitHub.`
  );
}

// Arma la propuesta sin base ni modelo: todo sale de las capacidades del
// modelo y de los repos hidratados. Reglas:
// - Componente: el primer candidato elegible (salud >= max(40, minHealth) y,
//   si se pidieron licencias, una de ellas) que no se recomendó ya para otra
//   capacidad; si todos los elegibles ya se usaron, el primero de ellos.
//   Alternativa: el siguiente elegible. Sin elegibles, un gap.
// - Los candidatos que no están en `repositories` (no existen en el
//   catálogo) se descartan.
// - Conexiones, solo entre componentes recomendados y a lo sumo una por par
//   de repos (sin importar la dirección): primero las del catálogo (una idea
//   aprobada de `from` incluye a `to` en connectsWith) y después las de
//   dependsOn como MODEL_SUGGESTION (from = la capacidad que depende, con su
//   integrationType). Si el catálogo ya conecta un par, la sugerencia del
//   modelo para ese par, en cualquier dirección, se descarta.
export function composeProposal(
  capabilities: ComposerCapability[],
  repositories: HydratedRepository[],
  constraints: ProposalConstraints,
  { id = randomUUID(), now = new Date() }: { id?: string; now?: Date } = {},
): Proposal {
  const byId = new Map(repositories.map((repo) => [repo.id, repo]));
  const minHealth = Math.max(MIN_MATURE_HEALTH, constraints.minHealth ?? 0);
  const licenses = new Set((constraints.licenses ?? []).map((spdx) => spdx.toLowerCase()));

  const isEligible = (
    repo: HydratedRepository | undefined,
  ): repo is HydratedRepository & { healthScore: number } =>
    repo !== undefined &&
    repo.healthScore !== null &&
    repo.healthScore >= minHealth &&
    (licenses.size === 0 ||
      (repo.licenseSpdx !== null && licenses.has(repo.licenseSpdx.toLowerCase())));

  const components: Component[] = [];
  const gaps: Proposal['gaps'] = [];
  // key de la capacidad → id del repo recomendado.
  const chosen = new Map<string, string>();

  for (const capability of capabilities) {
    const eligible = [...new Set(capability.candidateIds)]
      .map((candidateId) => byId.get(candidateId))
      .filter(isEligible);
    if (eligible.length === 0) {
      gaps.push({ capability: capability.key, message: NO_MATURE_OPTION });
      continue;
    }

    const used = new Set(chosen.values());
    const repo = eligible.find(({ id: repoId }) => !used.has(repoId)) ?? eligible[0];
    const alternative = eligible.find(({ id: repoId }) => repoId !== repo.id);
    chosen.set(capability.key, repo.id);

    components.push({
      capability: capability.key,
      repository: {
        id: repo.id,
        fullName: repo.fullName,
        healthScore: repo.healthScore,
        licenseSpdx: repo.licenseSpdx,
      },
      justification: justify(capability.reason, repo),
      integrationType: repo.ideas[0]?.integrationType ?? capability.integrationType,
      ...(alternative && { alternative: { id: alternative.id, fullName: alternative.fullName } }),
    });
  }

  const recommended = new Set(chosen.values());
  const connections: Connection[] = [];
  const connectedPairs = new Set<string>();
  const pairKey = (a: string, b: string) => [a, b].sort().join('|');
  const connect = (connection: Connection) => {
    const { from, to } = connection;
    if (from === to || !recommended.has(from) || !recommended.has(to)) return;
    const key = pairKey(from, to);
    if (connectedPairs.has(key)) return;
    connectedPairs.add(key);
    connections.push(connection);
  };

  for (const from of recommended) {
    for (const idea of byId.get(from)?.ideas ?? []) {
      for (const to of idea.connectsWith) {
        connect({ from, to, integrationType: idea.integrationType, source: 'CATALOG' });
      }
    }
  }

  for (const capability of capabilities) {
    const from = chosen.get(capability.key);
    if (!from) continue;
    for (const dependency of capability.dependsOn) {
      if (dependency === capability.key) continue;
      const to = chosen.get(dependency);
      if (!to) continue;
      connect({
        from,
        to,
        integrationType: capability.integrationType,
        source: 'MODEL_SUGGESTION',
      });
    }
  }

  return {
    id,
    createdAt: now.toISOString(),
    cached: false,
    capabilities: capabilities.map(({ key, name, reason }) => ({ key, name, reason })),
    components,
    connections,
    gaps,
  };
}
