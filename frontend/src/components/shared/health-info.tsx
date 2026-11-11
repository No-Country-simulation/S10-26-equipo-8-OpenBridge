'use client';

import { Popover } from '@base-ui/react/popover';
import { Info } from 'lucide-react';
import { useState } from 'react';
import { HEALTH_SCORE_EXPLANATION } from '@/lib/health-info';

// Icono «i» con la explicación del puntaje de salud. Se abre al pasar el cursor, al enfocarlo con
// el teclado y al tocarlo (en pantallas táctiles se muestra y se oculta con cada toque).
export function HealthInfo() {
  const [open, setOpen] = useState(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        openOnHover
        delay={100}
        aria-label="Qué mide el puntaje de salud"
        onFocus={(e) => {
          // Solo con teclado: un clic ya abre y cierra por su cuenta.
          if (e.currentTarget.matches(':focus-visible')) setOpen(true);
        }}
        className="flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground/40"
      >
        <Info className="size-4" strokeWidth={1.5} aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} className="z-50">
          <Popover.Popup className="max-w-72 rounded-md border border-border bg-background px-3 py-2 text-xs leading-4 text-foreground shadow-md transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none">
            {HEALTH_SCORE_EXPLANATION}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
