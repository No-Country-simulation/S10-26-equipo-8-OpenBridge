'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
  );
}

export function HeroSearch() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');

  // Atajo "/" para enfocar el buscador, salvo que ya se esté escribiendo en otro campo.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target)) return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <form
      action="/catalogo"
      role="search"
      className="mt-8 flex h-12 w-full max-w-170 items-center gap-3 rounded-[10px] border border-border-strong bg-background px-4 shadow-xs focus-within:border-foreground/40 md:mt-11 md:h-15"
    >
      <Search
        className="size-5 shrink-0 text-muted-foreground"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        type="search"
        name="q"
        aria-label="Buscar herramientas por necesidad"
        aria-keyshortcuts="/"
        placeholder="Buscá por necesidad: autenticación, búsqueda full-text, pagos…"
        className="min-w-0 flex-1 appearance-none bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground md:text-lg [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
      />
      {query && (
        <button
          type="button"
          aria-label="Borrar búsqueda"
          onClick={() => {
            setQuery('');
            inputRef.current?.focus();
          }}
          className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground/40"
        >
          <X className="size-4" strokeWidth={1.5} aria-hidden="true" />
        </button>
      )}
      <kbd className="hidden h-5 min-w-5 items-center justify-center rounded-sm border border-border bg-muted px-1.5 font-mono text-xs font-medium text-muted-foreground md:inline-flex">
        /
      </kbd>
    </form>
  );
}
