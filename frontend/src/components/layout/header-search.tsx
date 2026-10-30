'use client';

import { Search, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

const MIN_LENGTH = 2;

export function HeaderSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    function focusOnSlash(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const typing = target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      if (e.key !== '/' || typing || e.metaKey || e.ctrlKey || e.altKey) return;
      // El buscador del hero ya atiende el atajo en el home.
      if (document.querySelector('main [role="combobox"]')) return;
      e.preventDefault();
      inputRef.current?.focus();
    }

    document.addEventListener('keydown', focusOnSlash);
    return () => document.removeEventListener('keydown', focusOnSlash);
  }, []);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = query.trim();
    router.push(q.length >= MIN_LENGTH ? `/catalogo?q=${encodeURIComponent(q)}` : '/catalogo');
  }

  return (
    <>
      <form
        role="search"
        onSubmit={onSubmit}
        className="hidden h-8 w-60 items-center gap-2 rounded-md border border-border bg-background px-2.5 focus-within:border-foreground/40 md:flex"
      >
        <Search aria-hidden strokeWidth={1.5} className="size-4 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          type="search"
          name="q"
          aria-label="Buscar herramientas"
          placeholder="Buscar…"
          autoComplete="off"
          className="min-w-0 flex-1 appearance-none bg-transparent text-[13px] outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
        />
        {query && (
          <button
            type="button"
            aria-label="Borrar búsqueda"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground/40"
          >
            <X className="size-4" strokeWidth={1.5} aria-hidden="true" />
          </button>
        )}
        <kbd
          aria-hidden
          className="flex size-5 items-center justify-center rounded-sm border border-border bg-muted font-mono text-xs font-medium text-muted-foreground"
        >
          /
        </kbd>
      </form>
      <Link
        href="/catalogo"
        aria-label="Buscar en el catálogo"
        className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
      >
        <Search aria-hidden className="size-4" />
      </Link>
    </>
  );
}
