'use client';

import { Dialog } from '@base-ui/react/dialog';
import { Menu, Moon, Sun, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from 'cn';
import { navLinks } from './nav-links';
import { toggleTheme } from './theme-toggle';

// En pantallas angostas la navegación y el tema viven en un cajón lateral, no en la barra.
export function HeaderMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        aria-label="Abrir menú"
        className="flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground/40 md:hidden"
      >
        <Menu className="size-5" strokeWidth={1.5} aria-hidden="true" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 md:hidden" />
        <Dialog.Popup className="fixed inset-y-0 right-0 z-50 flex w-[min(20rem,85vw)] flex-col border-l border-border bg-background transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] data-ending-style:translate-x-full data-starting-style:translate-x-full motion-reduce:transition-none md:hidden">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-border pr-2 pl-4">
            <Dialog.Title className="text-sm font-medium">Menú</Dialog.Title>
            <Dialog.Close
              aria-label="Cerrar menú"
              className="flex size-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-foreground/40"
            >
              <X className="size-5" strokeWidth={1.5} aria-hidden="true" />
            </Dialog.Close>
          </div>
          <nav aria-label="Principal" className="flex-1 overflow-y-auto p-2">
            {navLinks.map(({ href, label }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);

              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'flex h-12 items-center rounded-md px-3 text-base transition-colors focus-visible:outline-2 focus-visible:outline-foreground/40',
                    active
                      ? 'bg-muted font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-border p-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-12 w-full items-center justify-between rounded-md px-3 text-base text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-foreground/40"
            >
              <span className="hidden dark:inline">Cambiar a tema claro</span>
              <span className="dark:hidden">Cambiar a tema oscuro</span>
              <Moon aria-hidden className="size-4 dark:hidden" strokeWidth={1.5} />
              <Sun aria-hidden className="hidden size-4 dark:block" strokeWidth={1.5} />
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
