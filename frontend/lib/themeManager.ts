/**
 * Theme management utilities for dark/light mode.
 * Handles localStorage persistence and OS preference detection.
 * Requirements: 9.1, 9.3
 */

/**
 * Resolves the initial theme by checking (in priority order):
 * 1. Persisted value in localStorage["theme"]
 * 2. OS prefers-color-scheme media query
 * 3. Default: "light"
 */
export function resolveInitialTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'light';

  const stored = localStorage.getItem('theme');
  if (stored === 'dark' || stored === 'light') return stored;

  if (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark';
  }

  return 'light';
}

/**
 * Applies the given theme by toggling the `dark` class on <html>
 * and persisting the choice to localStorage["theme"].
 */
export function applyTheme(theme: 'dark' | 'light'): void {
  if (typeof window === 'undefined') return;

  document.documentElement.classList.toggle('dark', theme === 'dark');
  localStorage.setItem('theme', theme);
}
