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
    // Anchored: `.dark .app-shell` (the dark wash) also contains `.app-shell {`,
    // and an unanchored match would read that rule's declarations instead.
    const rule = /^\.app-shell\s*\{([^}]*)\}/m.exec(css);
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

/**
 * Guard for the dark-theme ambient wash.
 *
 * The graphite wash and the top glow used to be painted as
 * `.dashboard-ambient::before` / `::after` — `position: absolute; inset: 0` on a
 * pseudo-element of a *static* div. Two consequences:
 *
 *   • the layer resolved its containing block against `html`, so it spanned the
 *     whole document rather than the shell;
 *   • as a positioned box with `z-index: auto` it painted above every static,
 *     non-positioned box in the shell. The wash is opaque, so the in-flow
 *     banners between the navbar and `<main>` (maintenance, status update,
 *     notification) were hidden behind it on the dark theme only — `.app-main`
 *     (z-index: 1), the navbar (z-50) and the impersonation banner (z-40) were
 *     the only siblings lifted above it.
 *
 * A background paints below content and cannot be hit-tested, so the wash
 * belongs on the shell as `background-image`, not as an overlay layer.
 */
describe('globals.css dark ambient wash', () => {
  const cssPath = path.join(__dirname, '..', 'app', 'globals.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  it('paints the wash and glow as backgrounds on the shell', () => {
    const rule = /\.dark\s+\.app-shell\s*\{([^}]*)\}/.exec(css);
    expect(rule).not.toBeNull();

    const body = rule?.[1] ?? '';
    expect(body).toContain('background-image:');
    // Glow first — earlier background layers paint on top of later ones.
    expect(body.indexOf('radial-gradient')).toBeLessThan(body.indexOf('linear-gradient'));
    // A background layer must not be turned back into a positioned box.
    expect(body).not.toContain('position:');
  });

  it('never overlays the ambient layer on top of in-flow content', () => {
    const overlays = [...css.matchAll(/\.dashboard-ambient\s*::?(before|after)\s*\{([^}]*)\}/g)];
    expect(overlays.map((m) => m[0])).toEqual([]);
  });
});
