'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

/* ── Inline SVG icons (no lucide on the landing bundle) ──────────────────── */

function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{
        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
        transition: 'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

/* ── Shared hover-menu behaviour (same as PlatformMegaMenu) ──────────────── */

const CLOSE_DELAY_MS = 160;

function useHoverMenu() {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }, [cancelClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  useEffect(() => cancelClose, [cancelClose]);

  return { open, setOpen, rootRef, cancelClose, scheduleClose };
}

/* ── Solutions mega menu ─────────────────────────────────────────────────── */

type SolutionItem = { key: string; href: string };
type SolutionColumn = { groupKey: string; items: SolutionItem[] };

const SOLUTION_COLUMNS: SolutionColumn[] = [
  {
    groupKey: 'solutionsMenu.byTeam',
    items: [
      { key: 'hr', href: '/features' },
      { key: 'ops', href: '/features' },
      { key: 'finance', href: '/#pricing' },
      { key: 'executives', href: '/#story' },
    ],
  },
  {
    groupKey: 'solutionsMenu.bySize',
    items: [
      { key: 'startup', href: '/#pricing' },
      { key: 'growth', href: '/#pricing' },
      { key: 'enterprise', href: '/features' },
    ],
  },
  {
    groupKey: 'solutionsMenu.byIndustry',
    items: [
      { key: 'retail', href: '/features' },
      { key: 'healthcare', href: '/features' },
      { key: 'logistics', href: '/features' },
      { key: 'professional', href: '/features' },
    ],
  },
];

/**
 * "Solutions" mega menu — who Strata is for, split into team / size / industry
 * columns the way enterprise product navbars surface positioning without a
 * separate landing page per segment.
 */
export function SolutionsMenu() {
  const { t } = useTranslation();
  const { open, setOpen, rootRef, cancelClose, scheduleClose } = useHoverMenu();

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors duration-200 focus:outline-none focus:underline underline-offset-4"
        style={{
          color: open ? 'var(--landing-navbar-text-hover)' : 'var(--landing-navbar-text)',
          transition: 'color 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        {t('landing.solutionsMenu.title')}
        <ChevronDownIcon open={open} />
      </button>

      <div
        className="absolute left-0 top-full pt-4 z-[110]"
        style={{
          opacity: open ? 1 : 0,
          transform: open ? 'translateY(0)' : 'translateY(-6px)',
          pointerEvents: open ? 'auto' : 'none',
          transition:
            'opacity 0.22s cubic-bezier(0.22, 1, 0.36, 1), transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        role="menu"
        aria-hidden={!open}
      >
        <div
          className="w-[min(720px,calc(100vw-2rem))] rounded-3xl border overflow-hidden backdrop-blur-2xl"
          style={{
            background: 'var(--card)',
            borderColor: 'var(--landing-card-border)',
            boxShadow: '0 1px 2px rgba(12, 26, 46, 0.06), 0 24px 64px -12px rgba(12, 26, 46, 0.28)',
          }}
        >
          <div className="grid grid-cols-3 gap-2 p-6">
            {SOLUTION_COLUMNS.map((col) => (
              <div key={col.groupKey}>
                <p
                  className="text-[11px] font-bold uppercase tracking-[0.14em] mb-3 px-2.5"
                  style={{ color: 'var(--landing-text-muted)' }}
                >
                  {t(`landing.${col.groupKey}`)}
                </p>
                <ul className="space-y-0.5">
                  {col.items.map((item) => (
                    <li key={item.key}>
                      <Link
                        href={item.href}
                        tabIndex={open ? 0 : -1}
                        className="group/item w-full flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-sm font-medium text-left transition-colors duration-150"
                        style={{
                          color: 'var(--landing-text-secondary)',
                          background: 'transparent',
                        }}
                        onClick={() => setOpen(false)}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--muted)';
                          e.currentTarget.style.color = 'var(--landing-text-primary)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = 'var(--landing-text-secondary)';
                        }}
                      >
                        <span>{t(`landing.solutionsMenu.items.${item.key}`)}</span>
                        <span
                          className="opacity-0 group-hover/item:opacity-100 transition-opacity duration-150 shrink-0"
                          style={{ color: 'var(--primary)' }}
                        >
                          <ArrowRightIcon />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Why Strata dropdown ─────────────────────────────────────────────────── */

const WHY_ITEMS: Array<{ key: string; href: string }> = [
  { key: 'security', href: '/privacy' },
  { key: 'pricing', href: '/#pricing' },
  { key: 'integrations', href: '/features' },
  { key: 'customers', href: '/#testimonials' },
  { key: 'tour', href: '/#story' },
];

/**
 * "Why Strata" dropdown — the trust rows (security, pricing, integrations,
 * customers, product tour) with one-line descriptions, so objections are
 * answered before the visitor reaches the CTA.
 */
export function WhyMenu() {
  const { t } = useTranslation();
  const { open, setOpen, rootRef, cancelClose, scheduleClose } = useHoverMenu();

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors duration-200 focus:outline-none focus:underline underline-offset-4"
        style={{
          color: open ? 'var(--landing-navbar-text-hover)' : 'var(--landing-navbar-text)',
          transition: 'color 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        {t('landing.whyMenu.title')}
        <ChevronDownIcon open={open} />
      </button>

      <div
        className="absolute left-0 top-full pt-4 z-[110]"
        style={{
          opacity: open ? 1 : 0,
          transform: open ? 'translateY(0)' : 'translateY(-6px)',
          pointerEvents: open ? 'auto' : 'none',
          transition:
            'opacity 0.22s cubic-bezier(0.22, 1, 0.36, 1), transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        role="menu"
        aria-hidden={!open}
      >
        <div
          className="w-[min(380px,calc(100vw-2rem))] rounded-2xl border overflow-hidden backdrop-blur-2xl p-2"
          style={{
            background: 'var(--card)',
            borderColor: 'var(--landing-card-border)',
            boxShadow: '0 1px 2px rgba(12, 26, 46, 0.06), 0 20px 48px -12px rgba(12, 26, 46, 0.25)',
          }}
        >
          {WHY_ITEMS.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              tabIndex={open ? 0 : -1}
              className="group/item flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150"
              style={{ background: 'transparent' }}
              onClick={() => setOpen(false)}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--muted)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <span className="min-w-0">
                <span
                  className="block text-sm font-medium leading-tight"
                  style={{ color: 'var(--landing-text-primary)' }}
                >
                  {t(`landing.whyMenu.items.${item.key}.title`)}
                </span>
                <span
                  className="block text-xs leading-tight mt-0.5 truncate"
                  style={{ color: 'var(--landing-text-muted)' }}
                >
                  {t(`landing.whyMenu.items.${item.key}.desc`)}
                </span>
              </span>
              <span
                className="opacity-0 group-hover/item:opacity-100 transition-opacity duration-150 shrink-0"
                style={{ color: 'var(--primary)' }}
              >
                <ArrowRightIcon />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
