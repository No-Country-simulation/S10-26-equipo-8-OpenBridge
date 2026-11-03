'use client';

import { Search, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { catalogHref, type CatalogParams } from '@/lib/catalog-url';
import { MIN_QUERY_LENGTH } from '@/lib/repositories';

type Props = {
  q: string;
  placeholder: string;
  params: Omit<CatalogParams, 'q' | 'page'>;
};

export function CatalogSearch({ q, placeholder, params }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(q);
  const [prevQ, setPrevQ] = useState(q);

  // Si la búsqueda cambia desde afuera (enlace, "Limpiar búsqueda"), el campo la sigue.
  if (q !== prevQ) {
    setPrevQ(q);
    setValue(q);
  }

  useEffect(() => {
    function focusOnSlash(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const typing = target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      if (e.key !== '/' || typing || e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      inputRef.current?.focus();
    }

    document.addEventListener('keydown', focusOnSlash);
    return () => document.removeEventListener('keydown', focusOnSlash);
  }, []);

  function go(term: string) {
    const query = term.trim().length >= MIN_QUERY_LENGTH ? term.trim() : undefined;
    // Relevancia solo existe con texto de búsqueda.
    const sort = query || params.sort !== 'relevance' ? params.sort : undefined;
    router.push(catalogHref({ ...params, sort, q: query }));
  }

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        go(value);
      }}
      className="flex h-12 w-full items-center gap-3 rounded-lg border border-border bg-background px-4 focus-within:border-foreground/40"
    >
      <Search aria-hidden strokeWidth={1.5} className="size-4 shrink-0 text-muted-foreground" />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        type="search"
        name="q"
        aria-label="Buscar en el catálogo"
        aria-keyshortcuts="/"
        placeholder={placeholder}
        autoComplete="off"
        className="min-w-0 flex-1 appearance-none bg-transparent text-[15px] outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
      />
      {value && (
        <button
          type="button"
          aria-label="Borrar búsqueda"
          onClick={() => {
            setValue('');
            if (q) go('');
            inputRef.current?.focus();
          }}
          className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground/40"
        >
          <X className="size-4" strokeWidth={1.5} aria-hidden="true" />
        </button>
      )}
      <kbd
        aria-hidden
        className="hidden h-5 min-w-5 items-center justify-center rounded-sm border border-border bg-muted px-1.5 font-mono text-xs font-medium text-muted-foreground md:inline-flex"
      >
        /
      </kbd>
    </form>
  );
}
