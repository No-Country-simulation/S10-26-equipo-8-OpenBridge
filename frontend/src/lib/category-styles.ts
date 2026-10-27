import {
  BrainCircuit,
  ChartLine,
  CreditCard,
  Database,
  Folder,
  KeyRound,
  TextSearch,
  type LucideIcon,
} from 'lucide-react';

type CategoryStyle = { icon: LucideIcon; tint: string; text: string; dot: string };

// Clases completas (no construidas) para que Tailwind las detecte.
const categoryStyles: Record<string, CategoryStyle> = {
  auth: {
    icon: KeyRound,
    tint: 'bg-cat-auth-tint',
    text: 'text-cat-auth',
    dot: 'bg-cat-auth',
  },
  database: {
    icon: Database,
    tint: 'bg-cat-database-tint',
    text: 'text-cat-database',
    dot: 'bg-cat-database',
  },
  payments: {
    icon: CreditCard,
    tint: 'bg-cat-payments-tint',
    text: 'text-cat-payments',
    dot: 'bg-cat-payments',
  },
  ai: { icon: BrainCircuit, tint: 'bg-cat-ai-tint', text: 'text-cat-ai', dot: 'bg-cat-ai' },
  analytics: {
    icon: ChartLine,
    tint: 'bg-cat-analytics-tint',
    text: 'text-cat-analytics',
    dot: 'bg-cat-analytics',
  },
  search: {
    icon: TextSearch,
    tint: 'bg-cat-search-tint',
    text: 'text-cat-search',
    dot: 'bg-cat-search',
  },
};

// Categorías que el backend agregue después y no tengan estilo propio.
const fallbackStyle: CategoryStyle = {
  icon: Folder,
  tint: 'bg-muted',
  text: 'text-muted-foreground',
  dot: 'bg-muted-foreground',
};

export function getCategoryStyle(slug: string): CategoryStyle {
  return categoryStyles[slug] ?? fallbackStyle;
}
