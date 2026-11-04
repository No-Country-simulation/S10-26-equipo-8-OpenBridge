'use client';

import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  function toggle() {
    const dark = document.documentElement.classList.toggle('dark');
    try {
      localStorage.setItem('theme', dark ? 'dark' : 'light');
    } catch {}
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Cambiar tema"
      onClick={toggle}
      className="text-muted-foreground"
    >
      <Moon aria-hidden className="hidden dark:block" />
      <Sun aria-hidden className="dark:hidden" />
    </Button>
  );
}
