'use client';

import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function toggleTheme() {
  const dark = document.documentElement.classList.toggle('dark');
  try {
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  } catch {}
}

export function ThemeToggle() {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Cambiar tema"
      onClick={toggleTheme}
      className="text-muted-foreground max-md:hidden"
    >
      <Moon aria-hidden className="hidden dark:block" />
      <Sun aria-hidden className="dark:hidden" />
    </Button>
  );
}
