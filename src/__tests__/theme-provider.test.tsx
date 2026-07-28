/**
 * Tests for ThemeProvider — theme context with localStorage/cookie management.
 *
 * Covers: ThemeProvider, useTheme hook, theme switching, system theme,
 * localStorage persistence, cookie setting, transitions.
 */

import React from 'react';
import { render, screen, fireEvent, act, renderHook } from '@testing-library/react';
import { ThemeProvider, useTheme } from '@/components/ThemeProvider';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] ?? null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  value: jest.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock document.cookie
let mockCookies = '';
Object.defineProperty(document, 'cookie', {
  get: jest.fn(() => mockCookies),
  set: jest.fn((value: string) => {
    mockCookies = value;
  }),
  configurable: true,
});

function TestConsumer() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button data-testid="set-light" onClick={() => setTheme('light')}>
        Light
      </button>
      <button data-testid="set-dark" onClick={() => setTheme('dark')}>
        Dark
      </button>
      <button data-testid="set-system" onClick={() => setTheme('system')}>
        System
      </button>
    </div>
  );
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();
    mockCookies = '';
    // Ensure class is removed
    document.documentElement.classList.remove('dark', 'light');
  });

  it('renders children', () => {
    render(
      <ThemeProvider>
        <div>Child</div>
      </ThemeProvider>,
    );
    expect(screen.getByText('Child')).toBeInTheDocument();
  });

  it('defaults to light theme (no stored preference)', () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );
    const themeEl = screen.getByTestId('theme');
    expect(themeEl.textContent).toBe('system');
    const resolvedEl = screen.getByTestId('resolved');
    expect(resolvedEl.textContent).toBe('light');
  });

  it('applies defaultTheme when provided', () => {
    render(
      <ThemeProvider defaultTheme="dark">
        <TestConsumer />
      </ThemeProvider>,
    );
    // Since matchMedia returns matches: false, resolved should default to defaultTheme
    expect(screen.getByTestId('resolved').textContent).toBe('dark');
  });

  it('reads stored theme from localStorage', () => {
    localStorageMock.getItem.mockReturnValue('dark');
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(screen.getByTestId('resolved').textContent).toBe('dark');
  });

  it('setTheme updates the theme via callback', () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByTestId('set-dark'));
    });
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    // Should have been saved to localStorage
    expect(localStorageMock.setItem).toHaveBeenCalledWith('theme', 'dark');
  });

  it('setTheme toggles back to light', () => {
    render(
      <ThemeProvider defaultTheme="dark">
        <TestConsumer />
      </ThemeProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByTestId('set-light'));
    });
    expect(screen.getByTestId('theme').textContent).toBe('light');
  });

  it('setTheme to system resolves to the system preference', () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByTestId('set-system'));
    });
    expect(screen.getByTestId('theme').textContent).toBe('system');
    // Since matchMedia returns matches: false, resolved should be 'light'
    expect(screen.getByTestId('resolved').textContent).toBe('light');
  });

  it('handles disableTransitionOnChange by adding style element', () => {
    render(
      <ThemeProvider disableTransitionOnChange>
        <TestConsumer />
      </ThemeProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByTestId('set-dark'));
    });
    // Should have added a style element synchronously
    const style = document.head.querySelector('[data-theme-transition="disabled"]');
    expect(style).toBeInTheDocument();
  });

  it('applies dark class to html element when dark theme is set', () => {
    render(
      <ThemeProvider defaultTheme="dark">
        <TestConsumer />
      </ThemeProvider>,
    );
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });

  it('applies light class to html element when light theme set', () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByTestId('set-light'));
    });
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('sets cookie when theme changes', () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByTestId('set-dark'));
    });
    expect(mockCookies).toContain('next-theme=dark');
  });

  it('handles localStorage setItem throwing (storage unavailable)', () => {
    localStorageMock.setItem.mockImplementationOnce(() => {
      throw new Error('Storage full');
    });
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByTestId('set-dark'));
    });
    // Should not throw even when localStorage fails
    expect(screen.getByTestId('theme').textContent).toBe('dark');
  });

  it('useTheme throws when used outside provider', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    function BadComponent() {
      useTheme();
      return <div>bad</div>;
    }
    expect(() => render(<BadComponent />)).toThrow('useTheme must be used within');
    consoleSpy.mockRestore();
  });
});

describe('useTheme hook', () => {
  it('returns theme, resolvedTheme and setTheme', () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });
    expect(result.current).toHaveProperty('theme');
    expect(result.current).toHaveProperty('resolvedTheme');
    expect(result.current).toHaveProperty('setTheme');
    expect(typeof result.current.setTheme).toBe('function');
  });
});
