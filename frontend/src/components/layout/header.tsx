import Link from 'next/link';
import { HeaderNav } from './header-nav';
import { HeaderSearch } from './header-search';
import { ThemeToggle } from './theme-toggle';

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background">
      <div className="mx-auto flex h-14 w-full max-w-300 items-center justify-between px-4 sm:px-8">
        <div className="flex items-center gap-4 sm:gap-8">
          <Link href="/" className="flex items-center gap-2 text-base tracking-[-0.01em] text-foreground">
            <span aria-hidden className="flex h-2 w-5 items-center">
              <span className="size-2 rounded-xs bg-foreground" />
              <span className="size-1 bg-foreground" />
              <span className="size-2 rounded-xs bg-foreground" />
            </span>
            OpenBridge
          </Link>
          <HeaderNav />
        </div>
        <div className="flex items-center gap-3">
          <HeaderSearch />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
