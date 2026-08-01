'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = 'theme';
const COOKIE_NAME = 'next-theme';

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredTheme(): Theme | null {
  try {
    // Try cookie first (SSR-set)
    const match = document.cookie.match(new RegExp(`(^| )${COOKIE_NAME}=([^;]+)`));
    if (match && match[2]) {
      return match[2] as Theme;
    }
    // Fall back to localStorage
    return (localStorage.getItem(STORAGE_KEY) as Theme) || null;
  } catch {
    return null;
  }
}

function applyTheme(theme: Theme) {
  const resolved = theme === 'system' ? getSystemTheme() : theme;
  const root = document.documentElement;

  if (resolved === 'dark') {
    root.classList.add('dark');
    root.classList.remove('light');
  } else {
    root.classList.add('light');
    root.classList.remove('dark');
  }
}

interface ThemeProviderProps {
  children: ReactNode;
  attribute?: string;
  defaultTheme?: Theme;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  disableTransitionOnChange = false,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');

  useEffect(() => {
    const stored = getStoredTheme();
    if (stored) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate theme state from cookie/localStorage
      setThemeState(stored);
      setResolvedTheme(stored === 'system' ? getSystemTheme() : stored);
    } else {
      setResolvedTheme(defaultTheme === 'system' ? getSystemTheme() : defaultTheme);
    }

    // Apply theme immediately
    const activeTheme = stored || defaultTheme;
    applyTheme(activeTheme);
  }, [defaultTheme]);

  // Listen for system theme changes
  useEffect(() => {
    if (theme !== 'system') return;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      setResolvedTheme(getSystemTheme());
      applyTheme('system');
    };

    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = useCallback(
    (newTheme: Theme) => {
      setThemeState(newTheme);
      const resolved = newTheme === 'system' ? getSystemTheme() : newTheme;
      setResolvedTheme(resolved);

      if (disableTransitionOnChange) {
        const el = document.createElement('style');
        el.setAttribute('data-theme-transition', 'disabled');
        el.textContent = '*{transition:none!important;animation:none!important;}';
        document.head.appendChild(el);
        applyTheme(newTheme);
        // Defer reflow to not block main thread during page load
        // Use double rAF to ensure style has been applied before reading offsetHeight
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            void document.documentElement.offsetHeight;
            el.remove();
          });
        });
      } else {
        applyTheme(newTheme);
      }

      try {
        localStorage.setItem(STORAGE_KEY, newTheme);
        document.cookie = `${COOKIE_NAME}=${newTheme};path=/;max-age=31536000;samesite=lax`;
      } catch {
        // Storage unavailable
      }
    },
    [disableTransitionOnChange],
  );

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
