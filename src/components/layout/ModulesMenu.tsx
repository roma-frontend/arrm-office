'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { navItems, isSeparator, type NavItem } from '@/lib/nav';
import { useAuthStore } from '@/store/useAuthStore';
import { useShallow } from 'zustand/shallow';
import { ChevronDown, LayoutGrid, CornerDownRight, Lock } from 'lucide-react';
import { usePlanGatedNav, isHrefLocked } from '@/lib/planGating';

type Section = { labelKey?: string; items: NavItem[] };

/**
 * "All modules" menu — the full product map surfaced in the top navbar.
 *
 * The sidebar already groups every route by domain; this is the same `navItems`
 * source of truth rendered as a two-pane mega menu: a compact section rail on
 * the left (Core, Performance, Talent, …) and the selected section's modules
 * on the right, with each module's sub-items nested beneath it. Role-filtered
 * exactly like the sidebar, so nobody sees routes they cannot open.
 *
 * Click navigates and closes; Escape / outside click closes without navigating.
 */
export function ModulesMenu() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore(useShallow((state: { user: { role?: string } | null }) => state.user));
  const [open, setOpen] = useState(false);
  const [activeSection, setActiveSection] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const [panelTop, setPanelTop] = useState(64);

  const userRole = user?.role ?? 'employee';
  const { entitlements } = usePlanGatedNav();

  // Group navItems into sections, role-filtered (same rule as Sidebar) and
  // plan-gated (modules not included in the caller's tariff are hidden).
  const sections = useMemo<Section[]>(() => {
    const result: Section[] = [];
    let current: Section | null = null;
    for (let i = 0; i < navItems.length; i++) {
      const entry = navItems[i];
      if (!entry) continue;
      if (isSeparator(entry)) {
        // Keep the separator only if some following item is visible to this role.
        let hasVisible = false;
        for (let j = i + 1; j < navItems.length; j++) {
          const next = navItems[j];
          if (!next || isSeparator(next)) break;
          if (next.roles.includes(userRole)) {
            hasVisible = true;
            break;
          }
        }
        if (!hasVisible) continue;
        current = { labelKey: entry.labelKey, items: [] };
        result.push(current);
      } else if (!isSeparator(entry)) {
        if (!entry.roles.includes(userRole)) continue;
        if (!current) {
          // Items before the first separator sit in the "Workspace" group.
          current = { labelKey: 'nav.groups.workspace', items: [] };
          result.push(current);
        }
        current.items.push(entry);
      }
    }
    return result.filter((s) => s.items.length > 0);
  }, [userRole]);

  const measureTop = useCallback(() => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect ? rect.bottom + 8 : 64;
  }, []);

  const openMenu = useCallback(() => {
    setPanelTop(measureTop());
    setOpen(true);
  }, [measureTop]);

  // Escape + outside click
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  const navigate = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const isActive = (href: string) =>
    pathname === href || (href !== '/' && pathname.startsWith(href));

  const current = sections[activeSection] ?? sections[0];

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-expanded={open}
        aria-haspopup="true"
        title={t('nav.modules', { defaultValue: 'All modules' })}
        className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm font-medium transition-colors outline-none ${
          open
            ? 'bg-(--background-subtle) text-(--text-primary)'
            : 'text-(--text-muted) hover:text-(--text-primary) hover:bg-(--background-subtle)'
        }`}
      >
        <LayoutGrid className="w-4 h-4" />
        <span className="hidden xl:inline">
          {t('nav.modules', { defaultValue: 'All modules' })}
        </span>
        <ChevronDown
          className="w-3 h-3 hidden xl:block transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>

      {/* Panel — fixed under the trigger so it can never be clipped */}
      <div
        className="fixed left-4 right-4 sm:left-auto z-[110]"
        style={{
          top: panelTop,
          opacity: open ? 1 : 0,
          transform: open ? 'translateY(0)' : 'translateY(-6px)',
          pointerEvents: open ? 'auto' : 'none',
          transition:
            'opacity 0.22s cubic-bezier(0.22, 1, 0.36, 1), transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        role="menu"
        aria-hidden={!open}
      >
        <div className="w-[min(680px,calc(100vw-2rem))] rounded-2xl border border-(--border) bg-(--card) shadow-2xl overflow-hidden">
          <div className="flex">
            {/* Section rail */}
            <div className="w-44 shrink-0 border-r border-(--border) py-2 max-h-[70vh] overflow-y-auto">
              {sections.map((section, idx) => {
                const sectionActive = section.labelKey === current?.labelKey;
                return (
                  <button
                    key={section.labelKey ?? idx}
                    type="button"
                    onMouseEnter={() => setActiveSection(idx)}
                    onClick={() => setActiveSection(idx)}
                    className={`w-full flex items-center justify-between px-3.5 py-2 text-[13px] font-medium transition-colors ${
                      sectionActive
                        ? 'bg-(--background-subtle) text-(--brand-text)'
                        : 'text-(--text-muted) hover:text-(--text-primary) hover:bg-(--background-subtle)'
                    }`}
                  >
                    {section.labelKey ? t(section.labelKey) : ''}
                  </button>
                );
              })}
            </div>

            {/* Module items with nested sub-items */}
            <div className="flex-1 py-3 px-2 max-h-[70vh] overflow-y-auto">
              {current?.items.map((item) => {
                const active = isActive(item.href);
                const locked = isHrefLocked(entitlements, item.href);
                const children = (item.children ?? []).filter(
                  (c) => !c.roles || c.roles.includes(userRole),
                );
                return (
                  <div key={item.href} className="mb-1">
                    <button
                      type="button"
                      onClick={() => (locked ? router.push('/pricing') : navigate(item.href))}
                      title={
                        locked ? t('plan.lockedTooltip', 'Available on a higher plan') : undefined
                      }
                      className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                        active
                          ? 'bg-(--brand)/10 text-(--brand-text)'
                          : locked
                            ? 'text-(--text-muted) hover:bg-(--background-subtle)'
                            : 'text-(--text-primary) hover:bg-(--background-subtle)'
                      }`}
                    >
                      <span className="relative shrink-0">
                        <item.icon className="w-4 h-4 opacity-80" />
                        {locked && (
                          <Lock className="absolute -top-1.5 -right-2 w-3 h-3 text-(--warning-text)" />
                        )}
                      </span>
                      <span className="truncate">{t(item.labelKey)}</span>
                      {locked ? (
                        <span className="ml-auto text-[9px] font-bold uppercase tracking-wide rounded bg-(--warning-quiet) text-(--warning-text) px-1.5 py-0.5">
                          {t('plan.upgrade', 'Upgrade')}
                        </span>
                      ) : item.badge ? (
                        <span className="ml-auto text-[9px] font-bold tracking-wider bg-(--brand)/10 text-(--brand-text) rounded px-1.5 py-0.5">
                          {item.badge}
                        </span>
                      ) : null}
                    </button>
                    {children.length > 0 && (
                      <div className="ml-4 mt-0.5 border-l border-(--border) pl-2">
                        {children.map((child) => {
                          const childActive = isActive(child.href);
                          const childLocked = isHrefLocked(entitlements, child.href);
                          return (
                            <button
                              key={child.href}
                              type="button"
                              onClick={() =>
                                childLocked ? router.push('/pricing') : navigate(child.href)
                              }
                              title={
                                childLocked
                                  ? t('plan.lockedTooltip', 'Available on a higher plan')
                                  : undefined
                              }
                              className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                                childActive
                                  ? 'text-(--brand-text) font-medium'
                                  : 'text-(--text-muted) hover:text-(--text-primary) hover:bg-(--background-subtle)'
                              }`}
                            >
                              <CornerDownRight className="w-3 h-3 shrink-0 opacity-50" />
                              <span className="truncate">{t(child.labelKey)}</span>
                              {childLocked && (
                                <Lock className="w-3 h-3 shrink-0 text-(--warning-text)" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
