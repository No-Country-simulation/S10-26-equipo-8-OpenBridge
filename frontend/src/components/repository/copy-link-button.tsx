'use client';

import { Check, Link2 } from 'lucide-react';
import { useState } from 'react';

export function CopyLinkButton({ className }: { className: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Sin permiso para el portapapeles: la dirección sigue en la barra del navegador.
    }
  }

  const Icon = copied ? Check : Link2;

  return (
    <button type="button" onClick={copy} className={className}>
      <Icon className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
      <span aria-live="polite">{copied ? 'Enlace copiado' : 'Copiar link'}</span>
    </button>
  );
}
