'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { SearchResults, type SearchStatus } from '@/components/search-results';
import { searchRepositories, type Repository } from '@/lib/repositories';

// Historia OB-21: resultados con 2 o más caracteres, tras 300 ms sin teclear.
const MIN_LENGTH = 2;
const DEBOUNCE_MS = 300;
const LISTBOX_ID = 'hero-search-results';

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
  );
}

export function HeroSearch() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [results, setResults] = useState<Repository[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  const term = query.trim();
  const canSearch = term.length >= MIN_LENGTH;
  const showPanel = open && canSearch;

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

  // Cierra el panel al hacer clic fuera del buscador.
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  // Busca 300 ms después de la última tecla; `cancelled` descarta respuestas viejas.
  useEffect(() => {
    if (!canSearch) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      setStatus('loading');
      try {
        const found = await searchRepositories(term);
        if (cancelled) return;
        setResults(found);
        setStatus(found.length ? 'results' : 'empty');
      } catch {
        if (!cancelled) setStatus('error');
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, canSearch]);

  function onChange(value: string) {
    setQuery(value);
    setOpen(true);
    setActiveIndex(-1);
    if (value.trim().length >= MIN_LENGTH) setStatus('loading');
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (!showPanel || status !== 'results') return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      router.push(`/repositorios/${results[activeIndex].id}`);
    }
  }

  return (
    <div ref={containerRef} className="relative mt-8 w-full max-w-170 md:mt-11">
      <form
        action="/catalogo"
        role="search"
        className="flex h-12 w-full items-center gap-3 rounded-[10px] border border-border-strong bg-background px-4 shadow-xs focus-within:border-foreground/40 md:h-15"
      >
        <Search
          className="size-5 shrink-0 text-muted-foreground"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          type="search"
          name="q"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={LISTBOX_ID}
          aria-autocomplete="list"
          aria-activedescendant={
            showPanel && activeIndex >= 0 ? `${LISTBOX_ID}-${activeIndex}` : undefined
          }
          aria-label="Buscar herramientas por necesidad"
          aria-keyshortcuts="/"
          autoComplete="off"
          placeholder="Buscá por necesidad: autenticación, búsqueda full-text, pagos…"
          className="min-w-0 flex-1 appearance-none bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground md:text-lg [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
        />
        {query && (
          <button
            type="button"
            aria-label="Borrar búsqueda"
            onClick={() => {
              setQuery('');
              setOpen(false);
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

      {showPanel && (
        <SearchResults
          id={LISTBOX_ID}
          query={term}
          status={status}
          results={results}
          activeIndex={activeIndex}
          onNavigate={() => setOpen(false)}
        />
      )}
    </div>
  );
}
