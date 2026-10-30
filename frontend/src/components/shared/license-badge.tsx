import { Scale } from 'lucide-react';

const base = 'inline-flex h-5 shrink-0 items-center gap-1 rounded-sm px-1.5 text-xs font-medium';

// Licencias con copyleft fuerte: GPL, AGPL y LGPL (cualquier versión).
const isCopyleft = (spdx: string) => /^(A|L)?GPL/i.test(spdx);

export function LicenseBadge({ spdx }: { spdx: string | null }) {
  if (!spdx) {
    return <span className={`${base} bg-health-risk-tint text-health-risk`}>Sin licencia</span>;
  }

  if (isCopyleft(spdx)) {
    return (
      <span className={`${base} bg-health-moderate-tint font-mono text-health-moderate`}>
        <Scale className="size-3" strokeWidth={1.5} aria-hidden="true" />
        {spdx}
      </span>
    );
  }

  return (
    <span className={`${base} border border-border bg-muted font-mono text-muted-foreground`}>
      {spdx}
    </span>
  );
}
