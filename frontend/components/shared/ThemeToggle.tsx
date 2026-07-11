'use client';

/**
 * ThemeToggle — a button that switches between dark and light mode.
 * Shows 🌙 when in light mode (click to go dark) and ☀️ when in dark mode (click to go light).
 * Requirements: 9.2, 9.3
 */

import { applyTheme } from '../../lib/themeManager';

interface ThemeToggleProps {
  /** The currently active theme. */
  theme: 'dark' | 'light';
  /** Called with the new theme after the user clicks the toggle. */
  onThemeChange: (theme: 'dark' | 'light') => void;
}

export default function ThemeToggle({ theme, onThemeChange }: ThemeToggleProps) {
  const isDark = theme === 'dark';
  const nextTheme: 'dark' | 'light' = isDark ? 'light' : 'dark';

  function handleClick() {
    applyTheme(nextTheme);
    onThemeChange(nextTheme);
  }

  return (
    <button
      type="button"
      role="button"
      onClick={handleClick}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
      className={[
        'inline-flex items-center justify-center',
        'w-10 h-10 rounded-full',
        'text-xl leading-none',
        'transition-colors duration-200',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        isDark
          ? 'bg-gray-700 text-yellow-300 hover:bg-gray-600 focus-visible:ring-yellow-300'
          : 'bg-gray-200 text-gray-800 hover:bg-gray-300 focus-visible:ring-gray-500',
      ].join(' ')}
    >
      <span aria-hidden="true">{isDark ? '☀️' : '🌙'}</span>
    </button>
  );
}
