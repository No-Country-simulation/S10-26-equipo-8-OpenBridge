import { randomUUID } from 'node:crypto';
import type { IntegrationType, Proposal, ProposalConstraints } from './schema.js';

// Salud mínima para recomendar un repo, aunque el usuario pida menos: por
// debajo de 40 el catálogo lo marca AT_RISK.
export const MIN_MATURE_HEALTH = 40;
export const NO_MATURE_OPTION = 'Sin opción madura en el catálogo';

// Pesos del puntaje con el que se ordenan los candidatos elegibles de cada
// capacidad (suman 1). La similitud manda (es lo que dice si el repo resuelve
// la capacidad), pero entre candidatos parecidos desempatan la salud y la
// popularidad: sin ellas, un repo de nicho apenas más parecido le ganaba a
// meilisearch o a postgres. Calibrados con la evaluación de OB-37.
export const SIMILARITY_WEIGHT = 0.6;
export const HEALTH_WEIGHT = 0.25;
export const POPULARITY_WEIGHT = 0.15;

// Un candidato de la búsqueda: id del repo y similitud con la consulta (0-1).
export interface ComposerCandidate {
  id: string;
  similarity: number;
}

// Lo que el composer necesita de cada capacidad: lo que dijo el modelo y sus
// candidatos, en el orden de la búsqueda (más parecido primero).
export interface ComposerCapability {
  key: string;
  name: string;
  reason: string;
  integrationType: IntegrationType;
  dependsOn: string[];
  candidates: ComposerCandidate[];
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

type EligibleRepository = HydratedRepository & { healthScore: number };

// Frase determinística: la razón del modelo más datos del catálogo. Nada que
// el catálogo no respalde. A la razón se le saca el cierre (espacios, puntos,
// "!", "?" o "…") para terminarla con un solo punto: nunca "..".
function justify(reason: string, repo: EligibleRepository): string {
  const trimmed = reason.replace(/[\s.!?…]+$/u, '');
  const license = repo.licenseSpdx ? `licencia ${repo.licenseSpdx}` : 'sin licencia declarada';
  const facts =
    `${repo.fullName} tiene salud ${repo.healthScore}/100, ${license} y ` +
    `${starsFormat.format(repo.stars)} estrellas en GitHub.`;
  return trimmed ? `${trimmed}. ${facts}` : facts;
}

// Ordena los candidatos elegibles de una capacidad, el mejor primero:
//   SIMILARITY_WEIGHT * similitud + HEALTH_WEIGHT * salud/100
//   + POPULARITY_WEIGHT * log10(estrellas + 1) / log10(máx. estrellas + 1)
// La popularidad es relativa a los candidatos de la capacidad y logarítmica
// (50k estrellas no valen 10 veces 5k). Empate: el orden de la búsqueda.
function rank(
  candidates: { repo: EligibleRepository; similarity: number }[],
): EligibleRepository[] {
  const maxStars = Math.max(0, ...candidates.map(({ repo }) => repo.stars));
  const popularity = (stars: number) =>
    maxStars > 0 ? Math.log10(Math.max(0, stars) + 1) / Math.log10(maxStars + 1) : 0;
  return candidates
    .map(({ repo, similarity }, index) => ({
      repo,
      index,
      score:
        SIMILARITY_WEIGHT * similarity +
        HEALTH_WEIGHT * (repo.healthScore / 100) +
        POPULARITY_WEIGHT * popularity(repo.stars),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ repo }) => repo);
}

// Arma la propuesta sin base ni modelo: todo sale de las capacidades del
// modelo y de los repos hidratados. Reglas:
// - Elegibles: salud >= max(40, minHealth), si se pidieron licencias, una
//   de ellas, y fuera de `exclude` (los repos que el usuario pidió cambiar:
//   ni componente ni alternativa); se ordenan por puntaje (ver rank).
// - Componente: el mejor elegible que no se recomendó ya para otra capacidad;
//   si todos ya se usaron, el mejor de ellos. Alternativa: el siguiente del
//   mismo orden. Sin elegibles, un gap.
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
  const excluded = new Set(constraints.exclude ?? []);

  const isEligible = (repo: HydratedRepository | undefined): repo is EligibleRepository =>
    repo !== undefined &&
    !excluded.has(repo.id) &&
    repo.healthScore !== null &&
    repo.healthScore >= minHealth &&
    (licenses.size === 0 ||
      (repo.licenseSpdx !== null && licenses.has(repo.licenseSpdx.toLowerCase())));

  const components: Component[] = [];
  const gaps: Proposal['gaps'] = [];
  // key de la capacidad → id del repo recomendado.
  const chosen = new Map<string, string>();

  for (const capability of capabilities) {
    const seen = new Set<string>();
    const eligible = rank(
      capability.candidates.flatMap(({ id: candidateId, similarity }) => {
        const repo = byId.get(candidateId);
        if (seen.has(candidateId) || !isEligible(repo)) return [];
        seen.add(candidateId);
        return [{ repo, similarity }];
      }),
    );
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
