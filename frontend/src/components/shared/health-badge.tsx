import { CircleAlert, CircleCheck, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { MaintenanceLevel } from '@/lib/repositories';

type Style = { icon: LucideIcon; label: string; classes: string };

// Clases completas (no construidas) para que Tailwind las detecte.
const styles: Record<MaintenanceLevel, Style> = {
  ACTIVE: {
    icon: CircleCheck,
    label: 'Activo',
    classes: 'bg-health-active-tint text-health-active',
  },
  MODERATE: {
    icon: CircleAlert,
    label: 'Moderado',
    classes: 'bg-health-moderate-tint text-health-moderate',
  },
  AT_RISK: {
    icon: TriangleAlert,
    label: 'En riesgo',
    classes: 'bg-health-risk-tint text-health-risk',
  },
  ARCHIVED: {
    icon: TriangleAlert,
    label: 'Archivado',
    classes: 'bg-health-risk-tint text-health-risk',
  },
};

type Props = {
  level: MaintenanceLevel;
  score: number;
  // Solo icono y puntaje, para espacios angostos como la tarjeta.
  compact?: boolean;
};

export function HealthBadge({ level, score, compact = false }: Props) {
  const { icon: Icon, label, classes } = styles[level];

  return (
    <span
      className={`inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-sm px-2 text-xs font-medium ${classes}`}
      title={compact ? `${label} · ${score}` : undefined}
    >
      <Icon className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
      {compact ? <span className="sr-only">{label}</span> : <span>{label}</span>}
      <span className="font-mono tabular">{score}</span>
    </span>
  );
}
