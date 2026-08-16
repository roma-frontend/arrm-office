/**
 * Superadmin landing text editor — Builder Studio style.
 *
 * Renders the REAL landing page (same components, same i18n bundles) and turns
 * it into an editable canvas via {@link LandingEditBridge}:
 *
 *   - hover a text → dashed outline + key badge,
 *   - double-click → edit in place (contentEditable), Enter/blur saves a
 *     DRAFT (never live), Escape discards,
 *   - single click → select the text; the toolbar shows a per-key Revert when
 *     that text has a published override,
 *   - language pills switch the canvas language (i18n.changeLanguage),
 *   - Publish all → drafts for the current language go live (the ONLY way an
 *     edit reaches the public landing),
 *   - Restore page → wipes every draft+published override for the current
 *     language back to the bundled default copy.
 *
 * Mirrors Builder Studio's draft→publish contract: nothing on the live site
 * changes until the superadmin explicitly publishes.
 *
 * Layout notes (two bugs fixed here):
 *   - Fullscreen renders through a portal to `document.body`. The editor lives
 *     inside `main.main-scrollable`, which is itself `overflow-y-auto` inside
 *     `.app-main { position: relative; z-index: 1 }`. A `fixed` overlay nested
 *     in that tree is clipped by the scroll container and trapped in the
 *     stacking context, so the dashboard navbar/sidebar painted above it and
 *     the hero was cut off. A body-level portal escapes both.
 *   - The canvas is its own scroll frame (`overflow-y-auto` on the inner div).
 *     The landing's own sticky navbar would otherwise fight the editor toolbar
 *     for `top-0` in the page scroll and slide under it.
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Globe, Languages, Maximize2, Minimize2, RotateCcw, Send, Undo2 } from 'lucide-react';

import { api } from '@/convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import LandingPageClient from '@/components/landing/LandingPageClient';
import { LandingEditBridge } from '@/components/superadmin/LandingEditBridge';
import {
  LANDING_BUNDLES,
  LANDING_LOCALES,
  flattenLeafKeys,
  type LandingLocale,
} from '@/lib/landingTexts';
import { cn } from '@/lib/utils';

const LOCALE_LABELS: Record<LandingLocale, string> = {
  en: 'English',
  ru: 'Русский',
  de: 'Deutsch',
  hy: 'Հայերեն',
};

type Row = {
  key: string;
  locale: LandingLocale;
  draftValue: string | null;
  publishedValue: string | null;
};

export function LandingEditorClient() {
  const { t, i18n } = useTranslation();
  const [locale, setLocale] = useState<LandingLocale>(() => {
    const cur = i18n.language as LandingLocale;
    return LANDING_LOCALES.includes(cur) ? cur : 'en';
  });
  const canvasRef = useRef<HTMLDivElement>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<'publish' | 'reset' | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  // The dashboard's language before the editor mounted — restored on unmount so
  // editing the landing never leaves the app in a language the user didn't pick.
  const originalLanguageRef = useRef<string | null>(null);
  if (originalLanguageRef.current === null) originalLanguageRef.current = i18n.language;

  // Portal needs a real DOM node; skip it until the client has mounted.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const rows = useQuery(api.superadmin.landingEditor.listLandingTexts);
  const saveDraft = useMutation(api.superadmin.landingEditor.saveLandingDraft);
  const publish = useMutation(api.superadmin.landingEditor.publishLandingTexts);
  const unpublish = useMutation(api.superadmin.landingEditor.unpublishLandingText);
  const resetAll = useMutation(api.superadmin.landingEditor.resetLandingTexts);

  // The canvas must render in the edited language: the landing sections use the
  // live `t` after mount, so switch the i18n instance. Restore on unmount so the
  // dashboard doesn't get left in the edited language.
  useEffect(() => {
    if (i18n.language !== locale) void i18n.changeLanguage(locale);
    return () => {
      const prev = originalLanguageRef.current;
      if (prev && prev !== i18n.language) void i18n.changeLanguage(prev);
    };
  }, [locale, i18n]);

  // ── Key catalog: every leaf string key across the landing namespaces ──
  // The EN bundle is the fullest copy; all namespaces (pricing, faq, …) live
  // inside landing.json, so one flatten covers the whole editable surface.
  const catalog = useMemo(() => {
    const flat = flattenLeafKeys(LANDING_BUNDLES.en);
    return Object.entries(flat)
      .filter(([, v]) => typeof v === 'string')
      .map(([key, value]) => ({ key, value: value as string }));
  }, []);

  const rowsForLocale = useMemo(() => {
    if (!rows) return null;
    return rows.filter((r: Row) => r.locale === locale);
  }, [rows, locale]);

  // Draft ?? published flat map — what the preview should render right now.
  const editorOverrides = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of rowsForLocale ?? []) {
      const v = r.draftValue ?? r.publishedValue;
      if (v) map[r.key] = v;
    }
    return map;
  }, [rowsForLocale]);

  // rendered text → key for the current language (defaults + overrides applied).
  const keyMap = useMemo(() => {
    const map: Record<string, string> = {};
    const localeBundle = flattenLeafKeys(LANDING_BUNDLES[locale]);
    for (const { key } of catalog) {
      const override = editorOverrides[key];
      const value = override ?? (localeBundle[key] as string | undefined);
      if (typeof value === 'string' && value.trim().length > 0) {
        map[value.replace(/\s+/g, ' ').trim()] = key;
      }
    }
    return map;
  }, [catalog, locale, editorOverrides]);

  const hasOverride = useCallback(
    (key: string) => {
      const r = rowsForLocale?.find((row: Row) => row.key === key);
      return !!(r && (r.draftValue || r.publishedValue));
    },
    [rowsForLocale],
  );

  const draftCount = rowsForLocale?.filter((r: Row) => r.draftValue).length ?? 0;
  const liveCount = rowsForLocale?.filter((r: Row) => r.publishedValue).length ?? 0;

  const run = async (fn: () => Promise<unknown>, success: string, error: string) => {
    try {
      await fn();
      toast.success(success);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : error);
    }
  };

  const handleCommit = useCallback(
    (key: string, value: string) => {
      void run(
        () => saveDraft({ key, locale, value }),
        t('superadmin.landingEditor.draftSaved', 'Draft saved'),
        t('superadmin.landingEditor.actionFailed', 'Action failed'),
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- locale is intentionally captured per commit
    [saveDraft, locale],
  );

  const handlePublish = async () => {
    setBusy('publish');
    try {
      const res = await publish({ locale });
      toast.success(
        t('superadmin.landingEditor.published', 'Published — {{count}} texts live', {
          count: res.published,
        }),
      );
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : t('superadmin.landingEditor.publishFailed', 'Publish failed'),
      );
    } finally {
      setBusy(null);
    }
  };

  const handleReset = async () => {
    if (
      !window.confirm(
        t(
          'superadmin.landingEditor.resetConfirm',
          'Restore the whole page to its default copy? All edits for this language will be discarded.',
        ),
      )
    ) {
      return;
    }
    setBusy('reset');
    try {
      await resetAll({ locale });
      toast.success(t('superadmin.landingEditor.resetDone', 'Page restored to default copy'));
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : t('superadmin.landingEditor.actionFailed', 'Action failed'),
      );
    } finally {
      setBusy(null);
    }
  };

  const handleRevertKey = (key: string) => {
    void run(
      () => unpublish({ key, locale }),
      t('superadmin.landingEditor.unpublished', 'Reverted to default'),
      t('superadmin.landingEditor.actionFailed', 'Action failed'),
    );
    setSelectedKey(null);
  };

  const toolbar = (
    <div className="shrink-0 border-b border-(--border)/60 bg-(--card)/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-2.5">
        <div className="mr-1 min-w-0">
          <h1
            className="truncate text-base font-bold leading-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            {t('superadmin.landingEditor.title', 'Landing text editor')}
          </h1>
          <p className="truncate text-[11px] text-muted-foreground">
            {t(
              'superadmin.landingEditor.inlineHint',
              'Hover a text → double-click to edit · Enter saves a draft · Esc cancels',
            )}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <Languages className="h-3 w-3" />
            {t('superadmin.landingEditor.drafts', 'Drafts')}: {draftCount}
          </Badge>
          <Badge variant="default" className="gap-1">
            <Globe className="h-3 w-3" />
            {t('superadmin.landingEditor.live', 'Live')}: {liveCount}
          </Badge>
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            disabled={busy === 'reset'}
            onClick={() => void handleReset()}
          >
            <RotateCcw className="h-4 w-4" />
            {t('superadmin.landingEditor.restorePage', 'Restore page')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={() => setFullscreen((f) => !f)}
            title={t(
              fullscreen
                ? 'superadmin.landingEditor.exitFullscreen'
                : 'superadmin.landingEditor.fullscreen',
              fullscreen ? 'Exit fullscreen' : 'Fullscreen',
            )}
          >
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            <span className="hidden sm:inline">
              {t(
                fullscreen
                  ? 'superadmin.landingEditor.exitFullscreen'
                  : 'superadmin.landingEditor.fullscreen',
                fullscreen ? 'Exit fullscreen' : 'Fullscreen',
              )}
            </span>
          </Button>
          <Button
            size="sm"
            className="gap-2"
            disabled={busy === 'publish' || draftCount === 0}
            onClick={() => void handlePublish()}
            title={
              draftCount === 0
                ? t('superadmin.landingEditor.noDrafts', 'No drafts to publish')
                : undefined
            }
          >
            <Send className="h-4 w-4" />
            {t('superadmin.landingEditor.publish', 'Publish all')}
          </Button>
        </div>
      </div>

      {/* Language pills — switch the canvas copy */}
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-2 px-4 pb-2.5">
        {LANDING_LOCALES.map((loc) => {
          const active = loc === locale;
          const hasLive = rowsForLocale?.some((r: Row) => r.locale === loc && r.publishedValue);
          return (
            <button
              key={loc}
              onClick={() => {
                setLocale(loc);
                setSelectedKey(null);
              }}
              className={cn(
                'flex items-center gap-2 rounded-full border px-3.5 py-1 text-sm font-semibold transition-all',
                active
                  ? 'border-(--brand) bg-(--brand) text-white shadow-md'
                  : 'border-(--border) bg-(--card) text-muted-foreground hover:border-(--brand)/50',
              )}
            >
              {LOCALE_LABELS[loc]}
              {loc === locale && hasLive && (
                <span className="h-1.5 w-1.5 rounded-full bg-white/80" />
              )}
            </button>
          );
        })}
        {selectedKey && (
          <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{selectedKey}</span>
            {hasOverride(selectedKey) && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-(--danger-text)"
                onClick={() => handleRevertKey(selectedKey)}
              >
                <Undo2 className="h-3.5 w-3.5" />
                {t('superadmin.landingEditor.revert', 'Revert')}
              </Button>
            )}
          </span>
        )}
      </div>
    </div>
  );

  // The canvas — the real landing page in its own scroll frame, so its sticky
  // navbar pins inside the frame instead of sliding under the editor toolbar.
  const canvas = !rows ? (
    <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
      <ShieldLoader size="xs" variant="inline" />
      {t('superadmin.controlCenter.loading', 'Loading…')}
    </div>
  ) : (
    <div className={cn('min-h-0 flex-1', fullscreen ? 'px-3 pb-3 pt-4 sm:px-4' : 'px-4 py-4')}>
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-(--border)/60 bg-white shadow-2xl dark:bg-[#0b0e14]">
        <div className="shrink-0 border-b border-(--border)/60 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {t('superadmin.landingEditor.canvasLabel', 'Live preview')} · {LOCALE_LABELS[locale]}
        </div>
        <div
          ref={canvasRef}
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
        >
          <LandingPageClient initialLanguage={locale} editorOverrides={editorOverrides} embedded />
          <LandingEditBridge
            containerRef={canvasRef}
            keyMap={keyMap}
            onCommit={handleCommit}
            onSelect={setSelectedKey}
          />
        </div>
      </div>
    </div>
  );

  const content = (
    // Normal mode fills exactly the space under the fixed navbar (h-16 = 64px);
    // fullscreen portals to <body> at z-[120], above the navbar (z-[100]) and
    // sidebar (z-60), below the command palette, so ⌘K still works over it.
    <div
      className={
        fullscreen
          ? 'fixed inset-0 z-[120] flex flex-col bg-(--background)'
          : 'flex h-[calc(100dvh-64px)] min-h-[600px] flex-col'
      }
    >
      {toolbar}
      {canvas}
    </div>
  );

  // Portal escapes the `.main-scrollable` overflow clipping and the
  // `.app-main` stacking context — a plain `fixed` child of <main> can never
  // paint above the dashboard chrome.
  return fullscreen && mounted ? createPortal(content, document.body) : content;
}
