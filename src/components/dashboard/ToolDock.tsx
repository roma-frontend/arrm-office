'use client';

/**
 * Tool Dock — a floating trigger on the right edge of every dashboard page.
 *
 * Fixed-position, so it never takes layout space from the page. Clicking it
 * slides in a sheet of the most-used modules as a grid of tiles; the "all
 * modules" row at the bottom opens a second, wider sheet with every module
 * grouped by its sidebar section. Mounted once in Providers so it follows the
 * user across the whole dashboard, not just /dashboard.
 */

import React, { useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';
import { isPast } from 'date-fns';
import { Pin, Search, LayoutGrid, Sparkles, Layers, PinOff } from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import { useToolDock } from '@/hooks/useToolDock';
import { useAuthUser } from '@/store/useAuthStore';
import { useCommandPaletteStore } from '@/store/useCommandPaletteStore';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetBody } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const REVIEWER_ROLES = new Set(['superadmin', 'admin', 'supervisor']);
const APPROVAL_ADMIN_ROLES = new Set(['superadmin', 'admin']);

/** Max tiles before the panel scrolls; everything else lives in the all-sheet. */
const MAX_TILES = 10;

export function ToolDock() {
  const { t } = useTranslation();
  const user = useAuthUser();
  const openPalette = useCommandPaletteStore((s) => s.openPalette);
  const { modules, recordVisit, togglePin, isPinned } = useToolDock();

  // The landing editor is a full-workspace canvas — the floating dock would
  // sit on top of the preview. Keep every other dashboard page covered.
  const pathname = usePathname();
  const hideDock = pathname?.startsWith('/superadmin/landing-editor') ?? false;

  const [open, setOpen] = useState(false);
  const [allOpen, setAllOpen] = useState(false);

  const canReview = user?.role ? REVIEWER_ROLES.has(user.role) : false;
  const isApprovalAdmin = user?.role ? APPROVAL_ADMIN_ROLES.has(user.role) : false;

  const tiles = useMemo(() => modules.slice(0, MAX_TILES), [modules]);

  // Live state for badges — one query per tile, matching what that page shows.
  // The Approvals page reviews pending *user registrations*, not leaves; the
  // pending-leave review queue lives on the Leaves page.
  const myTasks = useQuery(api.dashboard.getMyTasks, {});
  const pendingApprovals = useQuery(
    api.users.queries.getPendingApprovalUsers,
    isApprovalAdmin ? {} : 'skip',
  );
  const pendingLeaves = useQuery(api.leaves.getPendingLeaves, canReview ? {} : 'skip');
  const pendingReviewCount = useQuery(api.dashboard.getPendingReviewCount, canReview ? {} : 'skip');

  const overdueCount = useMemo(() => {
    if (!myTasks) return 0;
    return myTasks.filter((task) => task.deadline && isPast(new Date(task.deadline))).length;
  }, [myTasks]);

  const approvalsCount = pendingApprovals?.length ?? 0;
  const pendingLeavesCount = pendingLeaves?.length ?? 0;
  const reviewCount = pendingReviewCount ?? 0;
  const attentionTotal =
    overdueCount + (canReview ? pendingLeavesCount : 0) + approvalsCount + reviewCount;

  const badgeFor = (href: string): { tone: string; count: number; label: string } | null => {
    if (href === '/tasks') {
      if (reviewCount > 0) {
        return {
          tone: 'warning',
          count: reviewCount,
          label: t('toolDock.review', 'awaiting review'),
        };
      }
      if (overdueCount > 0) {
        return { tone: 'danger', count: overdueCount, label: t('toolDock.overdue', 'overdue') };
      }
    }
    if (href === '/approvals' && isApprovalAdmin && approvalsCount > 0) {
      return { tone: 'warning', count: approvalsCount, label: t('toolDock.pending', 'pending') };
    }
    if (href === '/leaves' && canReview && pendingLeavesCount > 0) {
      return {
        tone: 'warning',
        count: pendingLeavesCount,
        label: t('toolDock.pending', 'pending'),
      };
    }
    return null;
  };

  // Grouped view for the "all modules" sheet: sidebar sections in nav order.
  const grouped = useMemo(() => {
    const map = new Map<string, typeof modules>();
    for (const mod of modules) {
      const key = mod.groupKey ?? 'nav.modules';
      const bucket = map.get(key);
      if (bucket) bucket.push(mod);
      else map.set(key, [mod]);
    }
    return [...map.entries()];
  }, [modules]);

  const closeAll = useCallback(() => {
    setOpen(false);
    setAllOpen(false);
  }, []);

  const Tile = ({
    href,
    labelKey,
    icon: Icon,
  }: {
    href: string;
    labelKey: string;
    icon: React.ComponentType<{ className?: string }>;
  }) => {
    const pinned = isPinned(href);
    const badge = badgeFor(href);
    return (
      <div className="group relative">
        <Link
          href={href}
          onClick={() => {
            recordVisit(href);
            closeAll();
          }}
          className={cn(
            'flex flex-col items-center gap-2 rounded-xl border border-(--border) bg-(--card) p-3 text-center',
            'group-hover:-translate-y-1 group-hover:border-(--primary)/35 group-hover:shadow-lg',
            'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25',
          )}
          style={{ transition: 'all 0.2s cubic-bezier(0.22, 1, 0.36, 1)' }}
        >
          <span className="relative">
            <span
              className="flex size-9 items-center justify-center rounded-lg text-(--brand-text) transition-transform duration-200 ease-out group-hover:scale-110"
              style={{ background: 'color-mix(in srgb, var(--primary) 10%, transparent)' }}
            >
              <Icon className="size-4.5" aria-hidden="true" />
            </span>
            {badge && (
              <span
                className={cn(
                  'num absolute -top-1.5 -right-1.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white',
                  badge.tone === 'danger' ? 'bg-(--danger-solid)' : 'bg-(--warning-solid)',
                )}
                title={badge.label}
              >
                {badge.count}
              </span>
            )}
          </span>
          <span className="line-clamp-2 text-xs font-semibold leading-tight text-(--text-primary)">
            {t(labelKey, href)}
          </span>
        </Link>

        <button
          type="button"
          onClick={() => togglePin(href)}
          aria-label={
            pinned
              ? t('toolDock.unpin', 'Unpin {{name}}', { name: t(labelKey) })
              : t('toolDock.pin', 'Pin {{name}}', { name: t(labelKey) })
          }
          aria-pressed={pinned}
          title={pinned ? t('toolDock.unpin', 'Unpin') : t('toolDock.pin', 'Pin')}
          className={cn(
            'absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border transition-all duration-200',
            'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none',
            pinned
              ? 'border-(--primary) bg-(--primary) text-white opacity-100'
              : 'border-(--border-strong) bg-(--card) text-(--text-3) hover:text-(--brand-text)',
          )}
        >
          {pinned ? (
            <PinOff className="size-3" aria-hidden="true" />
          ) : (
            <Pin className="size-3" aria-hidden="true" />
          )}
        </button>
      </div>
    );
  };

  if (hideDock) return null;

  return (
    <>
      {/* Floating trigger — fixed on the right edge, never takes layout space.
          On hover it slides out to the left and tilts gently; on mouse-leave it
          glides back to the edge. */}
      <motion.div
        className="fixed z-(--z-sheet) top-1/2 -translate-y-1/2 right-0"
        animate={{ rotate: 0, x: 0 }}
        whileHover={{ x: -10, rotate: -6 }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t('toolDock.title', 'Your tools')}
          title={t('toolDock.title', 'Your tools')}
          className={cn(
            'relative flex w-11 flex-col items-center gap-2 rounded-l-2xl border border-r-0 py-4',
            'border-(--border) bg-(--card)/90 shadow-lg backdrop-blur-xl transition-colors duration-200',
            'hover:bg-(--card) hover:shadow-xl hover:border-(--primary)/40',
            'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25',
          )}
        >
          <span className="relative">
            <LayoutGrid className="size-4.5 text-(--brand-text)" aria-hidden="true" />
            {attentionTotal > 0 && (
              <span className="num absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-(--danger-solid) text-[9px] font-bold text-white">
                {attentionTotal}
              </span>
            )}
          </span>
          <span className="text-[9px] font-bold uppercase tracking-widest text-(--text-muted) [writing-mode:vertical-rl]">
            {t('toolDock.title', 'Your tools')}
          </span>
        </button>
      </motion.div>

      {/* ── Sheet 1: top tools as a tile grid ────────────────────────── */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" size="lg" hideClose className="!p-0">
          <SheetHeader className="flex-row items-center justify-between pr-5">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4.5 text-(--brand-text)" aria-hidden="true" />
              {t('toolDock.title', 'Your tools')}
            </SheetTitle>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t('common.close', 'Close')}
              className={cn(
                'flex size-8 items-center justify-center rounded-control text-(--text-muted)',
                'transition-colors duration-140 ease-spark hover:bg-(--surface-2) hover:text-(--text-primary)',
                'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25',
              )}
            >
              <svg
                viewBox="0 0 24 24"
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </SheetHeader>

          <SheetBody className="content-start">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {tiles.map((mod) => (
                <Tile key={mod.href} href={mod.href} labelKey={mod.labelKey} icon={mod.icon} />
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setAllOpen(true);
              }}
              className={cn(
                'mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-(--border-strong) py-2.5',
                'text-sm font-medium text-(--text-2) transition-all duration-200',
                'hover:border-(--primary)/40 hover:text-(--brand-text) hover:bg-(--background-subtle)',
                'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25',
              )}
            >
              <Layers className="size-4" aria-hidden="true" />
              {t('toolDock.allModules', 'All {{count}} modules', { count: modules.length })}
            </button>
          </SheetBody>
        </SheetContent>
      </Sheet>

      {/* ── Sheet 2: every module, grouped by sidebar section ────────── */}
      <Sheet open={allOpen} onOpenChange={setAllOpen}>
        <SheetContent side="right" size="xl" hideClose className="!p-0">
          <SheetHeader className="flex-row items-center justify-between pr-5">
            <div className="flex items-center gap-2">
              <SheetTitle className="flex items-center gap-2 text-base">
                <Layers className="size-4.5 text-(--brand-text)" aria-hidden="true" />
                {t('toolDock.allModulesTitle', 'All modules')}
              </SheetTitle>
              <span className="num text-xs text-(--text-muted)">{modules.length}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={openPalette}
                aria-label={t('toolDock.search', 'Search')}
                title={t('toolDock.search', 'Search')}
                className={cn(
                  'flex size-8 items-center justify-center rounded-control text-(--text-muted)',
                  'transition-colors duration-140 ease-spark hover:bg-(--surface-2) hover:text-(--text-primary)',
                  'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25',
                )}
              >
                <Search className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setAllOpen(false)}
                aria-label={t('common.close', 'Close')}
                className={cn(
                  'flex size-8 items-center justify-center rounded-control text-(--text-muted)',
                  'transition-colors duration-140 ease-spark hover:bg-(--surface-2) hover:text-(--text-primary)',
                  'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25',
                )}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
          </SheetHeader>

          <SheetBody className="space-y-6">
            {grouped.map(([groupKey, groupModules]) => (
              <section key={groupKey}>
                <h3 className="px-1 pb-2 text-[11px] font-bold uppercase tracking-wider text-(--text-muted)">
                  {t(groupKey)}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {groupModules.map((mod) => (
                    <Tile key={mod.href} href={mod.href} labelKey={mod.labelKey} icon={mod.icon} />
                  ))}
                </div>
              </section>
            ))}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}

export default ToolDock;
