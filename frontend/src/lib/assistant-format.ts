import type { Proposal } from '@/lib/assistant';
import type { IntegrationType, MaintenanceLevel } from '@/lib/repositories';

export const integrationLabels: Record<IntegrationType, string> = {
  SDK: 'SDK',
  REST_API: 'REST',
  DOCKER: 'Docker',
  WEBHOOK: 'Webhook',
  CLI: 'CLI',
};

// La propuesta trae solo el puntaje; el nivel se deriva con los mismos cortes del catálogo.
export const levelOf = (score: number): MaintenanceLevel =>
  score >= 70 ? 'ACTIVE' : score >= 40 ? 'MODERATE' : 'AT_RISK';

// Nombre corto para mostrar: la parte del repositorio, con la primera letra en mayúscula.
const repoName = (fullName: string) => {
  const name = fullName.split('/')[1] ?? fullName;
  return name.charAt(0).toUpperCase() + name.slice(1);
};

// Capas del mapa, de izquierda a derecha: quién entra, dónde se guardan los datos y qué se apoya en ellos.
const layerOf: Record<string, number> = {
  auth: 0,
  payments: 0,
  database: 1,
  search: 2,
  analytics: 2,
  ai: 2,
};

export type MapNodeData = {
  id: string;
  kind: 'tool' | 'gap';
  capability: string;
  capabilityName: string;
  name: string;
  fullName?: string;
  healthScore?: number;
};

export type MapColumn = { label: string; x: number };
export type MapEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
  suggested: boolean;
};

export const COLUMN_WIDTH = 250;
export const ROW_HEIGHT = 110;
const TOP = 70;

export type ArchitectureMap = {
  nodes: (MapNodeData & { x: number; y: number })[];
  columns: MapColumn[];
  edges: MapEdge[];
};

// Ubica cada componente (y cada capacidad sin candidato) en la columna de su capa.
export function buildMap(proposal: Proposal): ArchitectureMap {
  const capabilityName = (key: string) =>
    proposal.capabilities.find((c) => c.key === key)?.name ?? key;

  const items: MapNodeData[] = [
    ...proposal.components.map((c) => ({
      id: c.repository.id,
      kind: 'tool' as const,
      capability: c.capability,
      capabilityName: capabilityName(c.capability),
      name: repoName(c.repository.fullName),
      fullName: c.repository.fullName,
      healthScore: c.repository.healthScore,
    })),
    ...proposal.gaps.map((g) => ({
      id: `gap-${g.capability}`,
      kind: 'gap' as const,
      capability: g.capability,
      capabilityName: capabilityName(g.capability),
      name: capabilityName(g.capability),
    })),
  ];

  const layers = [...new Set(items.map((i) => layerOf[i.capability] ?? 2))].sort((a, b) => a - b);
  const columns: MapColumn[] = layers.map((layer, index) => ({
    label: [
      ...new Set(
        items.filter((i) => (layerOf[i.capability] ?? 2) === layer).map((i) => i.capabilityName),
      ),
    ].join(' · '),
    x: index * COLUMN_WIDTH,
  }));

  const nodes = layers.flatMap((layer, index) =>
    items
      .filter((i) => (layerOf[i.capability] ?? 2) === layer)
      .map((item, row) => ({
        ...item,
        x: index * COLUMN_WIDTH,
        y: TOP + row * ROW_HEIGHT + (index % 2) * 30,
      })),
  );

  const edges = proposal.connections.map((c, i) => ({
    id: `e${i}`,
    source: c.from,
    target: c.to,
    label: integrationLabels[c.integrationType],
    suggested: c.source === 'MODEL_SUGGESTION',
  }));

  return { nodes, columns, edges };
}

// Texto del turno del asistente, armado con lo que trae la propuesta.
export function summarize(proposal: Proposal, isCopyleft: (spdx: string) => boolean) {
  const bullets = proposal.components.map((c) => ({
    name: repoName(c.repository.fullName),
    text: c.justification,
  }));
  const copyleft = proposal.components.filter(
    (c) => c.repository.licenseSpdx && isCopyleft(c.repository.licenseSpdx),
  );
  const licenses = [
    ...new Set(proposal.components.map((c) => c.repository.licenseSpdx).filter(Boolean)),
  ];

  return {
    count: proposal.components.length,
    bullets,
    outro:
      copyleft.length > 0
        ? `${copyleft.map((c) => repoName(c.repository.fullName)).join(' y ')} usa${copyleft.length > 1 ? 'n' : ''} una licencia copyleft: revisá el uso comercial.`
        : `Todas son ${licenses.join(' o ')}, así que no hay restricciones de licencia para uso comercial.`,
    copyleft: copyleft.map((c) => ({
      name: repoName(c.repository.fullName),
      spdx: c.repository.licenseSpdx as string,
    })),
  };
}

// Título corto para la cabecera del mapa: la primera frase de la descripción.
export function titleOf(description: string) {
  const first = description.split(/[.\n]/)[0].trim();
  return first.length > 60 ? `${first.slice(0, 57).trimEnd()}…` : first;
}

export function proposalToMarkdown(proposal: Proposal, title: string) {
  const names = new Map(proposal.components.map((c) => [c.repository.id, c.repository.fullName]));
  const lines = [`# ${title}`, '', '## Componentes', ''];
  for (const c of proposal.components) {
    const license = c.repository.licenseSpdx ? ` (${c.repository.licenseSpdx})` : '';
    lines.push(`- **${c.repository.fullName}**${license}: ${c.justification}`);
  }
  if (proposal.connections.length > 0) {
    lines.push('', '## Conexiones', '');
    for (const c of proposal.connections) {
      lines.push(
        `- ${names.get(c.from) ?? c.from} → ${names.get(c.to) ?? c.to} (${integrationLabels[c.integrationType]})`,
      );
    }
  }
  if (proposal.gaps.length > 0) {
    lines.push('', '## Sin cobertura en el catálogo', '');
    for (const g of proposal.gaps) lines.push(`- ${g.capability}: ${g.message}`);
  }
  return lines.join('\n');
}

// Sin tildes y en minúsculas, para comparar lo que escribe el usuario con los nombres de los repos.
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

// Coincide si `name` aparece como palabra entera: ni letra ni número pegados a los costados.
function mentions(text: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u').test(text);
}

// Ids de los componentes de la propuesta que el texto nombra ("cambiá Authelia"): por el nombre
// corto del repo o por owner/nombre, sin importar mayúsculas ni tildes y como palabra entera (así
// "chat" no toca a "chatwoot").
export function namedComponents(proposal: Proposal, text: string): string[] {
  const folded = fold(text);
  return proposal.components
    .filter(({ repository: { fullName } }) =>
      [fullName, fullName.slice(fullName.indexOf('/') + 1)].some((name) =>
        mentions(folded, fold(name)),
      ),
    )
    .map(({ repository }) => repository.id);
}
