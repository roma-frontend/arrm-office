import fs from 'fs';
import path from 'path';

/**
 * Guard for the app-shell height regression.
 *
 * `.app-shell` sizes the whole dashboard viewport and every scroll container
 * inside it (`main.main-scrollable`, the sidebar nav) depends on that height
 * being *definite*. A bare `env(safe-area-inset-*)` is left unresolved by UAs
 * that do not define those variables, which makes the entire `height`
 * declaration invalid at computed-value time — the property then falls back to
 * `auto` (not to an earlier `height` declaration in the same rule). The shell
 * grows to the full page height, the document becomes the scroller and the
 * `h-screen` sidebar scrolls out of the viewport, leaving a background gap
 * under it.
 *
 * Every `env()` in the global stylesheet therefore needs an explicit fallback.
 */
describe('globals.css safe-area handling', () => {
  const cssPath = path.join(__dirname, '..', 'app', 'globals.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  it('gives every env() an explicit fallback value', () => {
    const withoutFallback = [...css.matchAll(/env\(\s*[a-z-]+\s*\)/g)].map((m) => m[0]);
    expect(withoutFallback).toEqual([]);
  });

  it('keeps .app-shell height definite, with a non-dvh fallback first', () => {
    const rule = /\.app-shell\s*\{([^}]*)\}/.exec(css);
    expect(rule).not.toBeNull();

    const declarations = (rule?.[1] ?? '')
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean);

    // UAs without `dvh` drop the calc at parse time and keep this line.
    expect(declarations[0]).toBe('height: 100vh');
    // The real rule: viewport height minus the safe-area insets, always resolvable.
    expect(declarations[1]).toBe(
      'height: calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))',
    );
  });
});
