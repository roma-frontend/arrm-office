'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useAuthStoreShallow } from '@/store/useAuthStore';

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

function SparklesIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
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

/* ── Shared hover-menu behaviour ─────────────────────────────────────────── */

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

  // Escape + outside click
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

/* ── Product map ─────────────────────────────────────────────────────────── */

type MenuItem = { key: string; appHref?: string; href?: string };
type MenuGroup = { key: string; items: MenuItem[] };

// Every item deep-links into the app module it belongs to (spark.work-style:
// the nav is the product map). Authenticated users land directly in the
// module; guests are routed to /login by the auth-aware click handler.
const GROUPS: MenuGroup[] = [
  {
    key: 'people',
    items: [
      { key: 'directory', appHref: '/employees' },
      { key: 'orgchart', appHref: '/org-chart' },
      { key: 'documents', appHref: '/documents' },
      { key: 'esign', appHref: '/signatures' },
    ],
  },
  {
    key: 'ops',
    items: [
      { key: 'leave', appHref: '/leaves' },
      { key: 'attendance', appHref: '/attendance' },
      { key: 'tasks', appHref: '/tasks' },
      { key: 'calendar', appHref: '/calendar' },
    ],
  },
  {
    key: 'strategy',
    items: [
      { key: 'okr', appHref: '/goals' },
      { key: 'strategyMaps', appHref: '/strategy' },
      { key: 'performance', appHref: '/performance' },
      { key: 'recognition', appHref: '/recognition' },
    ],
  },
  {
    key: 'talent',
    items: [
      { key: 'ats', appHref: '/recruitment' },
      { key: 'onboarding', appHref: '/onboarding' },
      { key: 'surveys', appHref: '/surveys' },
      { key: 'ai', appHref: '/ai-chat' },
    ],
  },
  {
    key: 'finance',
    items: [
      { key: 'payroll', appHref: '/payroll' },
      { key: 'compensation', appHref: '/compensation' },
      { key: 'expenses', appHref: '/expenses' },
    ],
  },
  {
    key: 'insights',
    items: [
      { key: 'reports', appHref: '/reports' },
      { key: 'analytics', appHref: '/analytics' },
      { key: 'compliance', appHref: '/compliance' },
      { key: 'automation', appHref: '/superadmin/automation' },
    ],
  },
];

/**
 * Desktop-only "Platform" mega menu — a full product map grouped by domain,
 * spark.work-style. Opens on hover (with close-intent delay) or click,
 * closes on Escape / outside click / link navigation.
 *
 * Every item deep-links into the corresponding app module: authenticated
 * users go straight there, guests are sent to /login (which redirects back
 * into the app after sign-in).
 *
 * The panel is `position: fixed` and centered on the viewport (not on the
 * trigger) so it can never be clipped by the screen edge; its top is measured
 * from the trigger's bounding box right before opening and kept in sync on
 * resize/scroll while open.
 */
export default function PlatformMegaMenu() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isAuthenticated } = useAuthStoreShallow();
  const { open, setOpen, rootRef, cancelClose, scheduleClose } = useHoverMenu();
  const [panelTop, setPanelTop] = useState<number>(76);

  const measureTop = useCallback(() => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect ? rect.bottom + 12 : 76;
  }, [rootRef]);

  const openMenu = useCallback(() => {
    cancelClose();
    setPanelTop(measureTop());
    setOpen(true);
  }, [cancelClose, measureTop, setOpen]);

  // Keep the panel glued to the trigger while open (external events only —
  // no synchronous setState inside the effect body).
  useEffect(() => {
    if (!open) return;
    const sync = () => setPanelTop(measureTop());
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, true);
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync, true);
    };
  }, [open, measureTop]);

  const navigate = useCallback(
    (appHref: string) => {
      setOpen(false);
      router.push(isAuthenticated ? appHref : '/login');
    },
    [isAuthenticated, router, setOpen],
  );

  return (
    <div ref={rootRef} className="relative" onMouseEnter={openMenu} onMouseLeave={scheduleClose}>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors duration-200 focus:outline-none focus:underline underline-offset-4"
        style={{ color: open ? 'var(--landing-navbar-text-hover)' : 'var(--landing-navbar-text)' }}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => (open ? setOpen(false) : openMenu())}
      >
        {t('landing.megaMenu.platform')}
        <ChevronDownIcon open={open} />
      </button>

      {/* Panel — fixed and viewport-centered so it never clips at screen edges */}
      <div
        className="fixed left-1/2 z-[110]"
        style={{
          top: panelTop,
          opacity: open ? 1 : 0,
          transform: open ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(-6px)',
          pointerEvents: open ? 'auto' : 'none',
          transition:
            'opacity 0.22s cubic-bezier(0.22, 1, 0.36, 1), transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        role="menu"
        aria-hidden={!open}
      >
        <div
          className="w-[min(1160px,calc(100vw-2rem))] rounded-3xl border overflow-hidden backdrop-blur-2xl"
          style={{
            background: 'var(--card)',
            borderColor: 'var(--landing-card-border)',
            boxShadow: '0 1px 2px rgba(12, 26, 46, 0.06), 0 24px 64px -12px rgba(12, 26, 46, 0.28)',
          }}
        >
          {/* Product map columns */}
          <div className="grid grid-cols-3 gap-x-6 gap-y-5 p-6">
            {GROUPS.map((group) => (
              <div key={group.key}>
                <p
                  className="text-[11px] font-bold uppercase tracking-[0.14em] mb-3 px-2.5"
                  style={{ color: 'var(--landing-text-muted)' }}
                >
                  {t(`landing.megaMenu.groups.${group.key}`)}
                </p>
                <ul className="space-y-0.5">
                  {group.items.map((item) => (
                    <li key={item.key}>
                      <button
                        type="button"
                        tabIndex={open ? 0 : -1}
                        className="group/item w-full flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-sm font-medium text-left transition-colors duration-150 cursor-pointer"
                        style={{
                          color: 'var(--landing-text-secondary)',
                          background: 'transparent',
                          border: 'none',
                        }}
                        onClick={() => item.appHref && navigate(item.appHref)}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--muted)';
                          e.currentTarget.style.color = 'var(--landing-text-primary)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = 'var(--landing-text-secondary)';
                        }}
                      >
                        <span>{t(`landing.megaMenu.items.${item.key}`)}</span>
                        <span
                          className="opacity-0 group-hover/item:opacity-100 transition-opacity duration-150 shrink-0"
                          style={{ color: 'var(--primary)' }}
                        >
                          <ArrowRightIcon />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Featured strip */}
          <div
            className="flex items-center justify-between gap-4 px-6 py-4"
            style={{
              borderTop: '1px solid var(--landing-card-border)',
              background: 'rgb(var(--brand-600-ch) / 5%)',
            }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span
                className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0"
                style={{
                  background: 'rgb(var(--brand-600-ch) / 10%)',
                  border: '1px solid rgb(var(--brand-600-ch) / 20%)',
                  color: 'var(--primary)',
                }}
              >
                <SparklesIcon />
              </span>
              <div className="min-w-0">
                <p
                  className="text-sm font-semibold leading-tight truncate"
                  style={{ color: 'var(--landing-text-primary)' }}
                >
                  {t('landing.megaMenu.featuredTitle')}
                </p>
                <p
                  className="text-xs leading-tight truncate"
                  style={{ color: 'var(--landing-text-muted)' }}
                >
                  {t('landing.megaMenu.featuredDesc')}
                </p>
              </div>
            </div>
            <Link
              href={isAuthenticated ? '/dashboard' : '/register'}
              tabIndex={open ? 0 : -1}
              className="inline-flex items-center gap-2 shrink-0 text-sm font-semibold px-4 py-2 rounded-xl transition-all duration-200 hover:scale-[1.03]"
              style={{
                background: 'var(--primary)',
                color: '#ffffff',
              }}
              onClick={() => setOpen(false)}
            >
              {isAuthenticated ? t('landing.goToDashboard') : t('landing.megaMenu.featuredCta')}
              <ArrowRightIcon />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Resources dropdown ──────────────────────────────────────────────────── */

const RESOURCE_GROUPS: Array<{ groupKey: string; items: Array<{ key: string; href: string }> }> = [
  {
    groupKey: 'resourcesMenu.learn',
    items: [
      { key: 'story', href: '/#story' },
      { key: 'features', href: '/features' },
      { key: 'testimonials', href: '/#testimonials' },
      { key: 'faq', href: '/#faq' },
    ],
  },
  {
    groupKey: 'resourcesMenu.company',
    items: [
      { key: 'careers', href: '/careers' },
      { key: 'contact', href: '/contact' },
      { key: 'privacy', href: '/privacy' },
    ],
  },
];

const RESOURCE_LABELS: Record<string, { key: string; fallback: string }> = {
  story: { key: 'landing.megaMenu.resourcesMenu.items.story', fallback: 'How it works' },
  features: { key: 'landing.features', fallback: 'Features' },
  testimonials: { key: 'landing.testimonials', fallback: 'Testimonials' },
  faq: { key: 'landing.faq', fallback: 'FAQ' },
  careers: { key: 'nav.recruitment', fallback: 'Careers' },
  contact: { key: 'landing.megaMenu.contact', fallback: 'Contact' },
  privacy: { key: 'landing.megaMenu.resourcesMenu.items.privacy', fallback: 'Privacy' },
};

/**
 * "Resources" dropdown — secondary landing links split into two groups
 * (Learn + Company) so the top bar stays short without hiding destinations.
 */
export function ResourcesMenu({ activeSection = null }: { activeSection?: string | null }) {
  const { t } = useTranslation();
  const { open, setOpen, rootRef, cancelClose, scheduleClose } = useHoverMenu();

  const label = (key: string) => {
    const cfg = RESOURCE_LABELS[key];
    return cfg ? t(cfg.key, cfg.fallback) : key;
  };

  // Sections on the landing page whose anchor lives inside this dropdown — the
  // trigger gets the same accent as the desktop section links when one of them
  // is in view.
  const hasActiveChild = activeSection === 'testimonials' || activeSection === 'faq';

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
          color:
            open || hasActiveChild
              ? 'var(--landing-navbar-text-hover)'
              : 'var(--landing-navbar-text)',
          transition: 'color 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        {t('landing.megaMenu.resources')}
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
          className="w-[min(520px,calc(100vw-2rem))] rounded-2xl border overflow-hidden backdrop-blur-2xl p-3"
          style={{
            background: 'var(--card)',
            borderColor: 'var(--landing-card-border)',
            boxShadow: '0 1px 2px rgba(12, 26, 46, 0.06), 0 20px 48px -12px rgba(12, 26, 46, 0.25)',
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            {RESOURCE_GROUPS.map((group) => (
              <div key={group.groupKey}>
                <p
                  className="text-[11px] font-bold uppercase tracking-[0.14em] px-2.5 pt-1 pb-1.5"
                  style={{ color: 'var(--landing-text-muted)' }}
                >
                  {t(`landing.${group.groupKey}`)}
                </p>
                {group.items.map((item) => {
                  const isActive = activeSection === item.key;
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      tabIndex={open ? 0 : -1}
                      className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-medium transition-colors duration-150"
                      style={{
                        color: isActive ? 'var(--primary)' : 'var(--landing-text-secondary)',
                      }}
                      onClick={() => setOpen(false)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--muted)';
                        if (!isActive) e.currentTarget.style.color = 'var(--landing-text-primary)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        if (!isActive)
                          e.currentTarget.style.color = 'var(--landing-text-secondary)';
                      }}
                    >
                      {isActive && (
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{
                            background: 'var(--primary)',
                            animation: 'nav-dot-in 0.3s cubic-bezier(0.22, 1, 0.36, 1) both',
                          }}
                        />
                      )}
                      {label(item.key)}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
