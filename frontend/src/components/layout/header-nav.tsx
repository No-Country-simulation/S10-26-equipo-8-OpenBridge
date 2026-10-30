'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from 'cn';

const links = [
  { href: '/catalogo', label: 'Catálogo' },
  { href: '/asistente', label: 'Asistente' },
];

export function HeaderNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Principal" className="flex h-14 items-center gap-4 sm:gap-6">
      {links.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex h-full items-center text-sm font-medium transition-colors hover:text-foreground',
              active ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {label}
            {active && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-foreground" />}
          </Link>
        );
      })}
    </nav>
  );
}
