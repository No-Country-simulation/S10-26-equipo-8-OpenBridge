'use client';

import { ArrowLeft, Search, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { cn } from 'cn';

const MIN_LENGTH = 2;

// Un solo buscador para todos los tamaños: empieza como una lupa y se abre al tocarla o con «/».
// En escritorio crece en su sitio; en mobile ocupa toda la barra y se cierra con la flecha.
export function HeaderSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    function focusOnSlash(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const typing = target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      if (e.key !== '/' || typing || e.metaKey || e.ctrlKey || e.altKey) return;
      // El buscador del hero o del catálogo ya atiende el atajo en su vista.
      if (document.querySelector('main input[type="search"]')) return;
      e.preventDefault();
      setOpen(true);
    }

    document.addEventListener('keydown', focusOnSlash);
    return () => document.removeEventListener('keydown', focusOnSlash);
  }, []);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = query.trim();
    router.push(q.length >= MIN_LENGTH ? `/catalogo?q=${encodeURIComponent(q)}` : '/catalogo');
    inputRef.current?.blur();
    setOpen(false);
  }

  // Si el campo queda vacío y el foco sale del buscador, vuelve a ser una lupa.
  function onBlur(e: React.FocusEvent<HTMLFormElement>) {
    if (!query && !e.currentTarget.contains(e.relatedTarget)) setOpen(false);
  }

  function onToggle() {
    if (!open) return setOpen(true);
    // En mobile el primer botón es la flecha de volver; en escritorio solo devuelve el foco al campo.
    if (window.matchMedia('(min-width: 768px)').matches) inputRef.current?.focus();
    else setOpen(false);
  }

  return (
    <form
      role="search"
      onSubmit={onSubmit}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
      className={cn(
        'flex h-8 items-center overflow-hidden rounded-md border transition-[width,background-color,border-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
        open
          ? [
              // Escritorio: la lupa crece hasta un campo de 240 px.
              'w-60 border-border bg-background focus-within:border-foreground/40',
              // Mobile: cubre toda la barra del header y se revela desde la lupa.
              'max-md:absolute max-md:inset-0 max-md:h-auto max-md:w-auto max-md:animate-[search-reveal_280ms_cubic-bezier(0.16,1,0.3,1)] max-md:rounded-none max-md:border-0 max-md:border-b max-md:px-2 motion-reduce:max-md:animate-none',
            ]
          : 'w-8 border-transparent hover:bg-muted',
      )}
    >
      <button
        type="button"
        aria-label={open ? 'Cerrar búsqueda' : 'Buscar herramientas'}
        aria-expanded={open}
        onClick={onToggle}
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground/40 max-md:data-[open=true]:size-10"
        data-open={open}
      >
        <Search aria-hidden className={cn('size-4', open && 'max-md:hidden')} strokeWidth={1.5} />
        <ArrowLeft
          aria-hidden
          className={cn('hidden size-5', open && 'max-md:block')}
          strokeWidth={1.5}
        />
      </button>
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        type="search"
        name="q"
        aria-label="Buscar herramientas"
        placeholder="Buscar…"
        autoComplete="off"
        enterKeyHint="search"
        tabIndex={open ? 0 : -1}
        className={cn(
          // 16 px en mobile evita el zoom automático de iOS al enfocar el campo.
          'min-w-0 flex-1 appearance-none bg-transparent text-base outline-none transition-opacity placeholder:text-muted-foreground motion-reduce:transition-none md:text-[13px] [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden',
          open
            ? 'opacity-100 delay-100 duration-200'
            : 'pointer-events-none opacity-0 duration-100',
        )}
      />
      {query && open && (
        <button
          type="button"
          aria-label="Borrar búsqueda"
          onClick={() => {
            setQuery('');
            inputRef.current?.focus();
          }}
          className="mr-1 flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground/40 max-md:size-10"
        >
          <X className="size-4" strokeWidth={1.5} aria-hidden="true" />
        </button>
      )}
      <kbd
        aria-hidden
        className={cn(
          'mr-2 flex size-5 shrink-0 cursor-default select-none items-center justify-center rounded-sm border border-border bg-muted font-mono text-xs font-medium text-muted-foreground transition-opacity motion-reduce:transition-none max-md:hidden',
          open ? 'opacity-100 delay-150 duration-200' : 'opacity-0 duration-100',
        )}
      >
        /
      </kbd>
    </form>
  );
}
