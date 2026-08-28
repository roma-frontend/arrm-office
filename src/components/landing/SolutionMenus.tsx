'use client';

/**
 * Landing mega-menus: Solutions, Why Strata, Resources.
 *
 * All use the same PeopleForce-style design:
 *  - Left: items with icons and descriptions
 *  - Right: promotional content
 *  - All labels use t() — no hardcoded English strings.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import {
  Users,
  Briefcase,
  Building2,
  Crown,
  Rocket,
  TrendingUp,
  ShieldCheck,
  CreditCard,
  Puzzle,
  Heart,
  Play,
  BookOpen,
  FileText,
  GraduationCap,
  HelpCircle,
  ArrowRight,
  ChevronRight,
} from 'lucide-react';

/* ── Shared hover-menu behaviour ─────────────────────────────────────────── */

const CLOSE_DELAY_MS = 180;

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

/* ── Chevron icon ────────────────────────────────────────────────────────── */

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

/* ═══════════════════════════════════════════════════════════════════════════
 * SOLUTIONS MENU
 * ═══════════════════════════════════════════════════════════════════════════ */

type SolutionGroup = {
  key: string;
  color: string;
  bgColor: string;
  items: Array<{ key: string; href: string }>;
};

const SOLUTION_GROUPS: SolutionGroup[] = [
  {
    key: 'byTeam',
    color: '#3b82f6',
    bgColor: 'rgba(59, 130, 246, 0.1)',
    items: [
      { key: 'hr', href: '/features' },
      { key: 'ops', href: '/features' },
      { key: 'finance', href: '/#pricing' },
      { key: 'executives', href: '/#story' },
    ],
  },
  {
    key: 'bySize',
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.1)',
    items: [
      { key: 'startup', href: '/#pricing' },
      { key: 'growth', href: '/#pricing' },
      { key: 'enterprise', href: '/features' },
    ],
  },
  {
    key: 'byIndustry',
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.1)',
    items: [
      { key: 'retail', href: '/features' },
      { key: 'healthcare', href: '/features' },
      { key: 'logistics', href: '/features' },
      { key: 'professional', href: '/features' },
    ],
  },
];

const TEAM_ICONS: Record<string, React.ReactNode> = {
  hr: <Users className="w-4 h-4" />,
  ops: <Briefcase className="w-4 h-4" />,
  finance: <CreditCard className="w-4 h-4" />,
  executives: <Crown className="w-4 h-4" />,
  startup: <Rocket className="w-4 h-4" />,
  growth: <TrendingUp className="w-4 h-4" />,
  enterprise: <Building2 className="w-4 h-4" />,
  retail: <Users className="w-4 h-4" />,
  healthcare: <Heart className="w-4 h-4" />,
  logistics: <Briefcase className="w-4 h-4" />,
  professional: <Building2 className="w-4 h-4" />,
};

export function SolutionsMenu() {
  const { t } = useTranslation('landing');
  const { open, setOpen, rootRef, cancelClose, scheduleClose } = useHoverMenu();
  const [activeGroup, setActiveGroup] = useState<string>(SOLUTION_GROUPS[0]!.key);

  const active = SOLUTION_GROUPS.find((g) => g.key === activeGroup) ?? SOLUTION_GROUPS[0]!;

  const tGroup = (key: string) => t(`landing.solutionsMenu.${key}`, key);
  const tItem = (key: string) => t(`landing.solutionsMenu.items.${key}`, key);

  return (
    <div ref={rootRef} className="relative" onMouseEnter={() => { cancelClose(); setOpen(true); }} onMouseLeave={scheduleClose}>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors duration-200 focus:outline-none focus:underline underline-offset-4"
        style={{ color: open ? 'var(--landing-navbar-text-hover)' : 'var(--landing-navbar-text)' }}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        {t('landing.solutionsMenu.title', 'Solutions')}
        <ChevronDownIcon open={open} />
      </button>

      <div
        className="absolute left-0 top-full pt-4 z-[110]"
        style={{
          opacity: open ? 1 : 0,
          transform: open ? 'translateY(0)' : 'translateY(-6px)',
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.22s cubic-bezier(0.22, 1, 0.36, 1), transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        role="menu"
        aria-hidden={!open}
      >
        <div
          className="w-[min(800px,calc(100vw-2rem))] rounded-2xl border overflow-hidden backdrop-blur-2xl"
          style={{
            background: 'var(--card)',
            borderColor: 'var(--landing-card-border)',
            boxShadow: '0 1px 2px rgba(12, 26, 46, 0.06), 0 24px 64px -12px rgba(12, 26, 46, 0.28)',
          }}
        >
          <div className="flex min-h-[340px]">
            {/* Left: group selector */}
            <div className="w-[220px] shrink-0 border-r border-(--border) p-3">
              {SOLUTION_GROUPS.map((group) => (
                <button
                  key={group.key}
                  type="button"
                  className={`group/g w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-150 ${
                    activeGroup === group.key ? 'bg-(--background-subtle)' : ''
                  }`}
                  onMouseEnter={() => setActiveGroup(group.key)}
                >
                  <span
                    className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
                    style={{ background: group.bgColor, color: group.color }}
                  >
                    {group.key === 'byTeam' && <Users className="w-4 h-4" />}
                    {group.key === 'bySize' && <Building2 className="w-4 h-4" />}
                    {group.key === 'byIndustry' && <Briefcase className="w-4 h-4" />}
                  </span>
                  <p
                    className="text-sm font-semibold"
                    style={{ color: activeGroup === group.key ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                  >
                    {tGroup(group.key)}
                  </p>
                  <ChevronRight
                    className="w-3.5 h-3.5 ml-auto shrink-0 transition-all duration-200"
                    style={{
                      color: 'var(--text-muted)',
                      opacity: activeGroup === group.key ? 1 : 0,
                      transform: activeGroup === group.key ? 'translateX(0)' : 'translateX(-4px)',
                    }}
                  />
                </button>
              ))}
            </div>

            {/* Center: items */}
            <div className="flex-1 p-5">
              <p className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text-muted)' }}>
                {tGroup(active.key)}
              </p>
              <div className="space-y-1">
                {active.items.map((item) => (
                  <Link
                    key={item.key}
                    href={item.href}
                    className="group/item w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors duration-150 hover:bg-(--background-subtle)"
                    style={{ color: 'var(--text-secondary)' }}
                    onClick={() => setOpen(false)}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
                        style={{ background: active.bgColor, color: active.color }}
                      >
                        {TEAM_ICONS[item.key] ?? <Briefcase className="w-4 h-4" />}
                      </span>
                      <span className="text-sm font-medium text-(--text-primary)">{tItem(item.key)}</span>
                    </div>
                    <ArrowRight
                      className="w-4 h-4 shrink-0 opacity-0 group-hover/item:opacity-100 transition-all duration-150 group-hover/item:translate-x-1"
                      style={{ color: active.color }}
                    />
                  </Link>
                ))}
              </div>
            </div>

            {/* Right: promotional */}
            <div
              className="w-[260px] shrink-0 p-5 flex flex-col items-center justify-center text-center"
              style={{ background: `linear-gradient(135deg, ${active.bgColor}, transparent)` }}
            >
              <span
                className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
                style={{ background: active.bgColor, color: active.color }}
              >
                {active.key === 'byTeam' && <Users className="w-7 h-7" />}
                {active.key === 'bySize' && <Building2 className="w-7 h-7" />}
                {active.key === 'byIndustry' && <Briefcase className="w-7 h-7" />}
              </span>
              <p className="text-sm font-bold text-(--text-primary) mb-1">{tGroup(active.key)}</p>
              <p className="text-xs text-(--text-muted) mb-3">{t('landing.solutionsMenu.desc', 'Tailored for your team')}</p>
              <Link
                href="/features"
                className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl transition-all duration-200 hover:scale-105"
                style={{ background: active.color, color: '#ffffff' }}
                onClick={() => setOpen(false)}
              >
                {t('landing.megaMenu.explore', 'Explore')}
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * WHY STRATA MENU
 * ═══════════════════════════════════════════════════════════════════════════ */

type WhyItem = {
  key: string;
  href: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
};

const WHY_ITEMS: WhyItem[] = [
  { key: 'security', href: '/privacy', icon: <ShieldCheck className="w-5 h-5" />, color: '#10b981', bgColor: 'rgba(16, 185, 129, 0.1)' },
  { key: 'pricing', href: '/#pricing', icon: <CreditCard className="w-5 h-5" />, color: '#3b82f6', bgColor: 'rgba(59, 130, 246, 0.1)' },
  { key: 'integrations', href: '/features', icon: <Puzzle className="w-5 h-5" />, color: '#8b5cf6', bgColor: 'rgba(139, 92, 246, 0.1)' },
  { key: 'customers', href: '/#testimonials', icon: <Heart className="w-5 h-5" />, color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.1)' },
  { key: 'tour', href: '/#story', icon: <Play className="w-5 h-5" />, color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.1)' },
];

export function WhyMenu() {
  const { t } = useTranslation('landing');
  const { open, setOpen, rootRef, cancelClose, scheduleClose } = useHoverMenu();

  const tItemTitle = (key: string) => t(`landing.whyMenu.items.${key}.title`, key);
  const tItemDesc = (key: string) => t(`landing.whyMenu.items.${key}.desc`, '');

  return (
    <div ref={rootRef} className="relative" onMouseEnter={() => { cancelClose(); setOpen(true); }} onMouseLeave={scheduleClose}>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors duration-200 focus:outline-none focus:underline underline-offset-4"
        style={{ color: open ? 'var(--landing-navbar-text-hover)' : 'var(--landing-navbar-text)' }}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        {t('landing.whyMenu.title', 'Why Strata')}
        <ChevronDownIcon open={open} />
      </button>

      <div
        className="absolute left-0 top-full pt-4 z-[110]"
        style={{
          opacity: open ? 1 : 0,
          transform: open ? 'translateY(0)' : 'translateY(-6px)',
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.22s cubic-bezier(0.22, 1, 0.36, 1), transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        role="menu"
        aria-hidden={!open}
      >
        <div
          className="w-[min(420px,calc(100vw-2rem))] rounded-2xl border overflow-hidden backdrop-blur-2xl"
          style={{
            background: 'var(--card)',
            borderColor: 'var(--landing-card-border)',
            boxShadow: '0 1px 2px rgba(12, 26, 46, 0.06), 0 24px 64px -12px rgba(12, 26, 46, 0.28)',
          }}
        >
          <div className="p-3">
            {WHY_ITEMS.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className="group/item flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150 hover:bg-(--background-subtle)"
                onClick={() => setOpen(false)}
              >
                <span
                  className="flex items-center justify-center w-9 h-9 rounded-lg shrink-0 transition-transform duration-200 group-hover/item:scale-110"
                  style={{ background: item.bgColor, color: item.color }}
                >
                  {item.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-(--text-primary) leading-tight">{tItemTitle(item.key)}</p>
                  <p className="text-xs text-(--text-muted) mt-0.5">{tItemDesc(item.key)}</p>
                </div>
                <ArrowRight
                  className="w-4 h-4 shrink-0 opacity-0 group-hover/item:opacity-100 transition-all duration-150 group-hover/item:translate-x-1"
                  style={{ color: item.color }}
                />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * RESOURCES MENU
 * ═══════════════════════════════════════════════════════════════════════════ */

type ResourceItem = {
  key: string;
  href: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
};

const RESOURCE_ITEMS: ResourceItem[] = [
  { key: 'story', href: '/#story', icon: <Play className="w-5 h-5" />, color: '#3b82f6', bgColor: 'rgba(59, 130, 246, 0.1)' },
  { key: 'features', href: '/features', icon: <FileText className="w-5 h-5" />, color: '#10b981', bgColor: 'rgba(16, 185, 129, 0.1)' },
  { key: 'testimonials', href: '/#testimonials', icon: <Heart className="w-5 h-5" />, color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.1)' },
  { key: 'faq', href: '/#faq', icon: <HelpCircle className="w-5 h-5" />, color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.1)' },
  { key: 'careers', href: '/careers', icon: <GraduationCap className="w-5 h-5" />, color: '#8b5cf6', bgColor: 'rgba(139, 92, 246, 0.1)' },
  { key: 'contact', href: '/contact', icon: <BookOpen className="w-5 h-5" />, color: '#06b6d4', bgColor: 'rgba(6, 182, 212, 0.1)' },
];

export function ResourcesMenu({ activeSection = null }: { activeSection?: string | null }) {
  const { t } = useTranslation('landing');
  const { open, setOpen, rootRef, cancelClose, scheduleClose } = useHoverMenu();

  const tItemTitle = (key: string) => {
    const val = t(`landing.megaMenu.resourcesMenu.items.${key}`, '');
    return val || t(`landing.${key}`, key);
  };

  const DESCRIPTIONS: Record<string, string> = {
    story: 'landing.megaMenu.resourcesMenu.descs.story',
    features: 'landing.megaMenu.resourcesMenu.descs.features',
    testimonials: 'landing.megaMenu.resourcesMenu.descs.testimonials',
    faq: 'landing.megaMenu.resourcesMenu.descs.faq',
    careers: 'landing.megaMenu.resourcesMenu.descs.careers',
    contact: 'landing.megaMenu.resourcesMenu.descs.contact',
  };

  const tDesc = (key: string) => {
    const keyPath = DESCRIPTIONS[key];
    return keyPath ? t(keyPath, '') : '';
  };

  return (
    <div ref={rootRef} className="relative" onMouseEnter={() => { cancelClose(); setOpen(true); }} onMouseLeave={scheduleClose}>
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
        {t('landing.megaMenu.resources', 'Resources')}
        <ChevronDownIcon open={open} />
      </button>

      <div
        className="absolute left-0 top-full pt-4 z-[110]"
        style={{
          opacity: open ? 1 : 0,
          transform: open ? 'translateY(0)' : 'translateY(-6px)',
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.22s cubic-bezier(0.22, 1, 0.36, 1), transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        role="menu"
        aria-hidden={!open}
      >
        <div
          className="w-[min(420px,calc(100vw-2rem))] rounded-2xl border overflow-hidden backdrop-blur-2xl"
          style={{
            background: 'var(--card)',
            borderColor: 'var(--landing-card-border)',
            boxShadow: '0 1px 2px rgba(12, 26, 46, 0.06), 0 24px 64px -12px rgba(12, 26, 46, 0.28)',
          }}
        >
          <div className="p-3">
            {RESOURCE_ITEMS.map((item) => {
              const isActive = activeSection === item.key;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className="group/item flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150 hover:bg-(--background-subtle)"
                  style={isActive ? { color: 'var(--primary)' } : {}}
                  onClick={() => setOpen(false)}
                >
                  <span
                    className="flex items-center justify-center w-9 h-9 rounded-lg shrink-0 transition-transform duration-200 group-hover/item:scale-110"
                    style={{ background: item.bgColor, color: item.color }}
                  >
                    {item.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-(--text-primary) leading-tight">{tItemTitle(item.key)}</p>
                    <p className="text-xs text-(--text-muted) mt-0.5">{tDesc(item.key)}</p>
                  </div>
                  <ArrowRight
                    className="w-4 h-4 shrink-0 opacity-0 group-hover/item:opacity-100 transition-all duration-150 group-hover/item:translate-x-1"
                    style={{ color: item.color }}
                  />
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
