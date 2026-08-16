/**
 * LandingEditBridge — the Builder Studio editing UX, ported to this project's
 * i18n-driven landing.
 *
 * The editor renders the REAL landing page (same components, same bundles) and
 * this bridge turns it into a canvas:
 *
 *   - a DOM walk maps every rendered text node back to its `landing.*` key by
 *     value. This is reliable here because the keys the landing actually
 *     renders have zero duplicate values, so text → key is unambiguous;
 *   - hover shows a dashed outline + a badge with the key (pure DOM, no React);
 *   - double-click makes the element contentEditable (inline editing, like
 *     Builder Studio) — Enter/blur commits → `onCommit(key, value)`, Escape
 *     discards;
 *   - single click selects (persistent outline) so the editor toolbar can act
 *     on the chosen text.
 *
 * Everything is event-delegated on the container, so React re-renders (after a
 * draft save, language switch, etc.) never detach the handlers. A MutationObserver
 * re-runs the text→key annotation whenever React swaps the DOM (post-save
 * re-render), skipping while an element is mid-edit.
 */

'use client';

import { useEffect, useRef } from 'react';

export type LandingEditBridgeProps = {
  /** The element wrapping the rendered landing. */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Flat `rendered text → key` map for the current locale (defaults + overrides applied). */
  keyMap: Record<string, string>;
  /** Commit an edited value for a key. */
  onCommit: (key: string, value: string) => void;
  /** Notify the toolbar which key is currently selected (or null). */
  onSelect?: (key: string | null) => void;
};

const BADGE_CLASS = 'landing-edit-badge';

function normalize(s: string) {
  return s.replace(/\s+/g, ' ').trim();
}

export function LandingEditBridge({
  containerRef,
  keyMap,
  onCommit,
  onSelect,
}: LandingEditBridgeProps) {
  const keyMapRef = useRef(keyMap);
  const commitRef = useRef(onCommit);
  const selectRef = useRef(onSelect);

  // Sync latest props into refs (the effect below reads them on events).
  useEffect(() => {
    keyMapRef.current = keyMap;
    commitRef.current = onCommit;
    selectRef.current = onSelect;
  }, [keyMap, onCommit, onSelect]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let editingEl: HTMLElement | null = null;
    let editingOrig = '';

    // ── Annotate: direct text nodes → key by value ──
    // Matches the element's OWN text nodes (not descendants), so
    // `<button><Icon/>{t('x')}</button>` and `<h2>{t('a')} <span>{t('b')}</span></h2>`
    // each get their key on the right element.
    const annotate = () => {
      if (editingEl) return; // never re-map mid-edit (committed text is transient)
      const map = keyMapRef.current;
      const els = container.querySelectorAll<HTMLElement>('*');
      for (const el of els) {
        let direct = '';
        for (const node of Array.from(el.childNodes)) {
          if (node.nodeType === Node.TEXT_NODE) direct += node.textContent ?? '';
        }
        const text = normalize(direct);
        const key = map[text];
        if (key && text.length > 0) {
          el.dataset.lk = key;
        } else {
          delete el.dataset.lk;
        }
      }
    };

    annotate();

    // Re-annotate when React re-renders (draft saved, language switched).
    const mo = new MutationObserver(() => {
      // rAF-debounce: React often mutates in bursts.
      requestAnimationFrame(() => annotate());
    });
    mo.observe(container, { childList: true, subtree: true, characterData: true });

    // ── Hover: dashed outline + badge (pure DOM) ──
    const hoverStyle = document.createElement('style');
    hoverStyle.textContent = `
      [data-lk]{cursor:pointer}
      [data-lk].lk-hover{outline:2px dashed var(--brand, #3b82f6)!important;outline-offset:2px;border-radius:4px}
      [data-lk].lk-selected{outline:2px solid var(--brand, #3b82f6)!important;outline-offset:2px;border-radius:4px;background:color-mix(in srgb, var(--brand, #3b82f6) 8%, transparent)}
      [data-lk].lk-editing{outline:2px solid var(--brand, #3b82f6)!important;outline-offset:2px;border-radius:4px;cursor:text;caret-color:var(--brand, #3b82f6)}
      .${BADGE_CLASS}{position:fixed;z-index:2147483000;pointer-events:none;transform:translateY(-100%);background:var(--brand, #3b82f6);color:#fff;font:600 10px/1.5 ui-sans-serif,system-ui,sans-serif;letter-spacing:.02em;padding:2px 7px;border-radius:6px 6px 6px 0;white-space:nowrap;box-shadow:0 2px 10px rgba(0,0,0,.28)}
    `;
    document.head.appendChild(hoverStyle);
    const badge = document.createElement('div');
    badge.className = BADGE_CLASS;
    badge.style.display = 'none';
    document.body.appendChild(badge);

    let hoverEl: HTMLElement | null = null;
    const onMouseOver = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-lk]');
      if (el && el !== hoverEl) {
        if (hoverEl) hoverEl.classList.remove('lk-hover');
        hoverEl = el;
        el.classList.add('lk-hover');
        const r = el.getBoundingClientRect();
        badge.textContent = el.dataset.lk ?? '';
        badge.style.display = 'block';
        badge.style.left = `${r.left}px`;
        badge.style.top = `${r.top}px`;
      }
    };
    const onMouseOut = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-lk]');
      if (el && hoverEl === el) {
        el.classList.remove('lk-hover');
        hoverEl = null;
        badge.style.display = 'none';
      }
    };

    // ── Click: select (or place caret while editing) ──
    let selectedEl: HTMLElement | null = null;
    const clearSelection = () => {
      if (selectedEl) selectedEl.classList.remove('lk-selected');
      selectedEl = null;
      selectRef.current?.(null);
    };

    const commitEdit = (save: boolean) => {
      const el = editingEl;
      if (!el) return;
      editingEl = null;
      el.contentEditable = 'false';
      el.classList.remove('lk-editing');
      const value = normalize(el.textContent ?? '');
      if (!save) {
        el.textContent = editingOrig;
        return;
      }
      const key = el.dataset.lk;
      if (key && value !== normalize(editingOrig) && value.length > 0) {
        commitRef.current(key, value);
      }
    };

    // ── Interactive-control guard ───────────────────────────────────────
    // The canvas is a preview: no button, link, input or form may actually
    // work. Links were already blocked; extend that to every interactive
    // element (newsletter form, play/pause, CTA anchors, dropdowns…) so the
    // editor only does one thing — edit text. Clicks on [data-lk] still
    // select for the toolbar.
    const INTERACTIVE_SELECTOR =
      'a, button, input, select, textarea, [role="button"], [role="link"], form, label';
    const blockInteractive = (e: MouseEvent | KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      // Never block the text-selection caret while editing a [data-lk] node.
      if (editingEl && editingEl.contains(t)) return;
      const ctl = t.closest<HTMLElement>(INTERACTIVE_SELECTOR);
      if (ctl && !ctl.closest('[data-lk]')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const onClick = (e: MouseEvent) => {
      // While editing, let clicks place the caret.
      if (editingEl && editingEl.contains(e.target as Node)) return;
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-lk]');
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      clearSelection();
      selectedEl = el;
      el.classList.add('lk-selected');
      selectRef.current?.(el.dataset.lk ?? null);
    };

    // Swallow form submissions (Enter inside the newsletter input, button
    // type=submit) — nothing may POST from the canvas.
    const onFormSubmit = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };

    // ── Double-click: inline edit (contentEditable) ──
    const onDblClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-lk]');
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      if (editingEl && editingEl !== el) commitEdit(true);
      clearSelection();
      editingEl = el;
      editingOrig = normalize(el.textContent ?? '');
      el.contentEditable = 'true';
      el.classList.add('lk-editing');
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!editingEl) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        editingEl.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        commitEdit(false);
        editingEl?.blur();
        editingEl = null;
      }
    };

    const onFocusOut = (e: FocusEvent) => {
      if (editingEl && e.target === editingEl) commitEdit(true);
    };

    container.addEventListener('mouseover', onMouseOver);
    container.addEventListener('mouseout', onMouseOut);
    // Capture phase so interactive elements never get a chance to act.
    container.addEventListener('click', blockInteractive, true);
    container.addEventListener('mousedown', blockInteractive, true);
    container.addEventListener('pointerdown', blockInteractive, true);
    container.addEventListener('submit', onFormSubmit, true);
    container.addEventListener('click', onClick, true);
    container.addEventListener('dblclick', onDblClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('focusout', onFocusOut, true);

    return () => {
      mo.disconnect();
      container.removeEventListener('mouseover', onMouseOver);
      container.removeEventListener('mouseout', onMouseOut);
      container.removeEventListener('click', blockInteractive, true);
      container.removeEventListener('mousedown', blockInteractive, true);
      container.removeEventListener('pointerdown', blockInteractive, true);
      container.removeEventListener('submit', onFormSubmit, true);
      container.removeEventListener('click', onClick, true);
      container.removeEventListener('dblclick', onDblClick, true);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('focusout', onFocusOut, true);
      hoverStyle.remove();
      badge.remove();
      container.querySelectorAll('[data-lk]').forEach((el) => {
        delete (el as HTMLElement).dataset.lk;
      });
    };
  }, [containerRef]);

  return null;
}
