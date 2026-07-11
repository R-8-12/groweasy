// Feature: ai-csv-importer, Property 18: Theme Resolution and Persistence
import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as fc from 'fast-check';
import { resolveInitialTheme, applyTheme } from '@/lib/themeManager';

// ---------------------------------------------------------------------------
// Helpers — mock browser APIs before each test
// ---------------------------------------------------------------------------

type StoredTheme = 'dark' | 'light' | null;
type OsPreference = 'dark' | 'light';

function setupMocks(stored: StoredTheme, osPreference: OsPreference): void {
  // Mock localStorage
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: jest.fn((key: string) => (key === 'theme' ? stored : null)),
      setItem: jest.fn(),
      removeItem: jest.fn(),
      clear: jest.fn(),
    },
    writable: true,
    configurable: true,
  });

  // Mock window.matchMedia
  Object.defineProperty(window, 'matchMedia', {
    value: jest.fn((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)' && osPreference === 'dark',
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
    writable: true,
    configurable: true,
  });
}

function setupNoMatchMedia(stored: StoredTheme): void {
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: jest.fn((key: string) => (key === 'theme' ? stored : null)),
      setItem: jest.fn(),
      removeItem: jest.fn(),
      clear: jest.fn(),
    },
    writable: true,
    configurable: true,
  });

  // Remove matchMedia entirely (simulate environments without it)
  Object.defineProperty(window, 'matchMedia', {
    value: undefined,
    writable: true,
    configurable: true,
  });
}

// ---------------------------------------------------------------------------
// Unit tests — resolveInitialTheme
// ---------------------------------------------------------------------------

describe('resolveInitialTheme — unit tests', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    document.documentElement.classList.remove('dark');
  });

  test('localStorage "dark" → returns "dark"', () => {
    setupMocks('dark', 'light');
    expect(resolveInitialTheme()).toBe('dark');
  });

  test('localStorage "light" → returns "light"', () => {
    setupMocks('light', 'dark');
    expect(resolveInitialTheme()).toBe('light');
  });

  test('no localStorage, OS dark → returns "dark"', () => {
    setupMocks(null, 'dark');
    expect(resolveInitialTheme()).toBe('dark');
  });

  test('no localStorage, OS light → returns "light"', () => {
    setupMocks(null, 'light');
    expect(resolveInitialTheme()).toBe('light');
  });

  test('no localStorage, no matchMedia → returns "light"', () => {
    setupNoMatchMedia(null);
    expect(resolveInitialTheme()).toBe('light');
  });
});

// ---------------------------------------------------------------------------
// Unit tests — applyTheme
// ---------------------------------------------------------------------------

describe('applyTheme — unit tests', () => {
  beforeEach(() => {
    setupMocks(null, 'light');
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.documentElement.classList.remove('dark');
  });

  test('applyTheme("dark") adds "dark" class to <html> and sets localStorage', () => {
    applyTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(window.localStorage.setItem).toHaveBeenCalledWith('theme', 'dark');
  });

  test('applyTheme("light") removes "dark" class from <html> and sets localStorage', () => {
    document.documentElement.classList.add('dark');
    applyTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(window.localStorage.setItem).toHaveBeenCalledWith('theme', 'light');
  });
});

// ---------------------------------------------------------------------------
// Property-based tests — Property 18
// Validates: Requirements 9.1, 9.3
// ---------------------------------------------------------------------------

describe('Property 18: Theme Resolution and Persistence (property-based)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    document.documentElement.classList.remove('dark');
  });

  /**
   * Property 18a: resolveInitialTheme honours persisted localStorage value.
   * When localStorage contains "dark" or "light", that value is returned
   * regardless of OS preference.
   */
  test('resolveInitialTheme returns persisted localStorage value when present', () => {
    const storedArb = fc.constantFrom<'dark' | 'light'>('dark', 'light');
    const osArb = fc.constantFrom<'dark' | 'light'>('dark', 'light');

    fc.assert(
      fc.property(storedArb, osArb, (stored, os) => {
        setupMocks(stored, os);
        const result = resolveInitialTheme();
        return result === stored;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 18b: resolveInitialTheme falls back to OS preference when
   * localStorage is null/absent.
   */
  test('resolveInitialTheme returns OS preference when localStorage is absent', () => {
    const osArb = fc.constantFrom<'dark' | 'light'>('dark', 'light');

    fc.assert(
      fc.property(osArb, (os) => {
        setupMocks(null, os);
        const result = resolveInitialTheme();
        return result === os;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 18c: resolveInitialTheme returns "light" when neither localStorage
   * nor matchMedia is available.
   */
  test('resolveInitialTheme returns "light" when no localStorage and no matchMedia', () => {
    fc.assert(
      fc.property(fc.constant(null), (_) => {
        setupNoMatchMedia(null);
        return resolveInitialTheme() === 'light';
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 18d: applyTheme(theme) persists the exact string to localStorage["theme"].
   */
  test('applyTheme persists the supplied theme string to localStorage', () => {
    const themeArb = fc.constantFrom<'dark' | 'light'>('dark', 'light');

    fc.assert(
      fc.property(themeArb, (theme) => {
        setupMocks(null, 'light');
        applyTheme(theme);
        const mockFn = window.localStorage.setItem as ReturnType<typeof jest.fn>;
        const calls = mockFn.mock.calls as Array<[string, string]>;
        return calls.some(([key, val]) => key === 'theme' && val === theme);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 18e: applyTheme("dark") always adds the "dark" class to
   * document.documentElement; applyTheme("light") always removes it.
   */
  test('applyTheme correctly toggles the "dark" class on <html>', () => {
    const initialClassArb = fc.boolean();
    const themeArb = fc.constantFrom<'dark' | 'light'>('dark', 'light');

    fc.assert(
      fc.property(initialClassArb, themeArb, (initiallyDark, theme) => {
        setupMocks(null, 'light');

        if (initiallyDark) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }

        applyTheme(theme);

        const hasDarkClass = document.documentElement.classList.contains('dark');
        return theme === 'dark' ? hasDarkClass === true : hasDarkClass === false;
      }),
      { numRuns: 100 }
    );
  });
});
