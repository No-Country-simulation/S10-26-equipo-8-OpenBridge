'use client';

import '@xyflow/react/dist/style.css';
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { cn } from '@/lib/utils';
import { useMemo, useSyncExternalStore } from 'react';
import { CategoryDot } from '@/components/shared/category-dot';
import { HealthBadge } from '@/components/shared/health-badge';
import { levelOf, type ArchitectureMap, type MapNodeData } from '@/lib/assistant-format';

type ToolNode = Node<MapNodeData, 'tool'>;
type ColumnNode = Node<{ label: string }, 'column'>;

function ToolNodeView({ data, selected }: NodeProps<ToolNode>) {
  const gap = data.kind === 'gap';

  return (
    <div
      className={cn(
        'min-w-40 rounded-md border bg-card px-3 py-2 text-card-foreground shadow-sm transition-colors',
        gap ? 'border-dashed border-border bg-transparent' : 'border-border',
        selected && 'border-foreground/50 ring-2 ring-foreground/10',
      )}
    >
      <Handle id="l-in" type="target" position={Position.Left} className="opacity-0!" />
      <Handle id="l-out" type="source" position={Position.Left} className="opacity-0!" />
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[13px] font-semibold">
          {!gap && <CategoryDot slug={data.capability} />}
          {data.name}
        </span>
        {data.healthScore !== undefined && (
          <HealthBadge level={levelOf(data.healthScore)} score={data.healthScore} />
        )}
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {gap ? 'Fuera del catálogo' : data.capabilityName}
      </p>
      <Handle id="r-in" type="target" position={Position.Right} className="opacity-0!" />
      <Handle id="r-out" type="source" position={Position.Right} className="opacity-0!" />
    </div>
  );
}

function ColumnView({ data }: NodeProps<ColumnNode>) {
  return <p className="text-xs whitespace-nowrap text-muted-foreground">{data.label}</p>;
}

const nodeTypes = { tool: ToolNodeView, column: ColumnView };

function subscribe(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

// El tema vive como clase `dark` en <html>; el mapa la sigue sin recargar.
function useColorMode() {
  const dark = useSyncExternalStore(
    subscribe,
    () => document.documentElement.classList.contains('dark'),
    () => true,
  );
  return dark ? 'dark' : 'light';
}

type Props = {
  map: ArchitectureMap;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

export function ArchitectureFlow({ map, selectedId, onSelect }: Props) {
  const colorMode = useColorMode();

  const nodes = useMemo<(ToolNode | ColumnNode)[]>(
    () => [
      ...map.columns.map((c): ColumnNode => ({
        id: `column-${c.x}`,
        type: 'column',
        position: { x: c.x, y: 0 },
        data: { label: c.label },
        draggable: false,
        selectable: false,
        focusable: false,
      })),
      ...map.nodes.map(({ x, y, ...data }): ToolNode => ({
        id: data.id,
        type: 'tool',
        position: { x, y },
        data,
        selected: data.id === selectedId,
        selectable: data.kind === 'tool',
      })),
    ],
    [map, selectedId],
  );

  const edges = useMemo<Edge[]>(
    () =>
      map.edges.map((e) => {
        const from = map.nodes.find((n) => n.id === e.source);
        const to = map.nodes.find((n) => n.id === e.target);
        // Si el destino queda a la izquierda, la flecha sale por ese lado en vez de cruzar el mapa.
        const backwards = from && to && to.x < from.x;
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: backwards ? 'l-out' : 'r-out',
          targetHandle: backwards ? 'r-in' : 'l-in',
          label: e.label,
          labelBgPadding: [6, 3],
          labelBgBorderRadius: 4,
          labelBgStyle: { fill: 'var(--muted)' },
          labelStyle: { fill: 'var(--muted-foreground)', fontSize: 11 },
          style: {
            stroke: 'var(--border-strong, var(--border))',
            strokeWidth: 1.5,
            strokeDasharray: e.suggested ? '5 4' : undefined,
          },
        };
      }),
    [map],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      colorMode={colorMode}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      nodesConnectable={false}
      nodesDraggable={false}
      minZoom={0.3}
      maxZoom={1.5}
      onNodeClick={(_, node) => onSelect(node.type === 'tool' ? node.id : null)}
      onPaneClick={() => onSelect(null)}
      aria-label="Mapa de la arquitectura propuesta"
      style={{ background: 'transparent' }}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
      <Controls showInteractive={false} position="bottom-right" />
    </ReactFlow>
  );
}
