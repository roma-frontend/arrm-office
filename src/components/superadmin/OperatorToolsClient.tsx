/**
 * Operator tools — Tier 1 of the no-code administration console.
 *
 * One page, four tabs, all superadmin-only:
 *   1. Translations — search any i18n key, override its text per locale, live
 *   2. Limits       — tune platform caps (session timeout, upload size, …)
 *   3. Scheduled ops— pause/resume/run platform cron jobs
 *   4. Maintenance  — plan windows, announce them, open/close them
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  CalendarClock,
  Clock,
  Gauge,
  Languages,
  Pause,
  Play,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
  Zap,
} from 'lucide-react';

import { api } from '@/convex/_generated/api';
import { postJsonWithCsrf } from '@/lib/csrf-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { cn } from '@/lib/utils';

const LOCALES = ['en', 'ru', 'de', 'hy'] as const;
// Namespaces of the app's locale files (public/locales/<lng>/<ns>.json). Kept
// local instead of importing from @/i18n/config, which boots i18next on import
// and breaks the Jest mocks that replace react-i18next wholesale.
const NAMESPACES = [
  'common',
  'landing',
  'auth',
  'dashboard',
  'leaves',
  'tasks',
  'employees',
  'chat',
  'admin',
  'drivers',
  'settings',
  'modules',
  'payroll',
  'compensation',
  'learning',
  'expenses',
] as const;
type Tab = 'translations' | 'limits' | 'scheduled' | 'maintenance';

const TABS: Array<{ id: Tab; labelKey: string; icon: typeof Languages }> = [
  { id: 'translations', labelKey: 'superadmin.operatorTools.tabs.translations', icon: Languages },
  { id: 'limits', labelKey: 'superadmin.operatorTools.tabs.limits', icon: Gauge },
  { id: 'scheduled', labelKey: 'superadmin.operatorTools.tabs.scheduled', icon: Clock },
  { id: 'maintenance', labelKey: 'superadmin.operatorTools.tabs.maintenance', icon: CalendarClock },
];

// Flatten a nested JSON bundle into "path.to.key" → value.
function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v as Record<string, unknown>, path));
    } else if (typeof v === 'string') {
      out[path] = v;
    }
  }
  return out;
}

function localeName(locale: string) {
  return { en: 'EN', ru: 'RU', de: 'DE', hy: 'HY' }[locale] ?? locale.toUpperCase();
}

export function OperatorToolsClient() {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<Tab>('translations');

  const overrides = useQuery(api.superadmin.operatorTools.listI18nOverrides, {});
  const limits = useQuery(api.superadmin.operatorTools.listPlatformLimits, {});
  const ops = useQuery(api.superadmin.operatorTools.listScheduledOps, {});
  const windows = useQuery(api.superadmin.operatorTools.listMaintenanceWindows, {});

  const setI18nOverride = useMutation(api.superadmin.operatorTools.setI18nOverride);
  const deleteI18nOverride = useMutation(api.superadmin.operatorTools.deleteI18nOverride);
  const setLimit = useMutation(api.superadmin.operatorTools.setPlatformLimit);
  const resetLimit = useMutation(api.superadmin.operatorTools.resetPlatformLimit);
  const setPaused = useMutation(api.superadmin.operatorTools.setScheduledOpPaused);
  const runNow = useMutation(api.superadmin.operatorTools.runScheduledOpNow);
  const createWindow = useMutation(api.superadmin.operatorTools.createMaintenanceWindow);
  const setWindowActive = useMutation(api.superadmin.operatorTools.setMaintenanceWindowActive);
  const deleteWindow = useMutation(api.superadmin.operatorTools.deleteMaintenanceWindow);

  // ── Translations tab state ────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // Which cell is currently being AI-translated (key::locale).
  const [translating, setTranslating] = useState<string | null>(null);

  // Read locale bundles straight from the JSON files (public/locales/*), not
  // from the live i18next resources: i18next only loads the active language +
  // EN at runtime, so getResourceBundle('de'|'hy') would be empty and the
  // DE/HY columns would show English even though the files are translated.
  const [fileBundles, setFileBundles] = useState<Record<
    string,
    Record<string, Record<string, unknown>>
  > | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result: Record<string, Record<string, Record<string, unknown>>> = {
        en: {},
        ru: {},
        de: {},
        hy: {},
      };
      await Promise.all(
        LOCALES.map(async (loc) => {
          await Promise.all(
            NAMESPACES.map(async (ns) => {
              try {
                const res = await fetch(`/locales/${loc}/${ns}.json`);
                if (res.ok) result[loc]![ns] = (await res.json()) as Record<string, unknown>;
              } catch {
                /* missing namespace file — skip */
              }
            }),
          );
        }),
      );
      if (!cancelled) setFileBundles(result);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // All known EN keys across namespaces (flattened from the EN bundle files).
  const allKeys = useMemo(() => {
    if (!fileBundles) return [];
    const out: Array<{ full: string; namespace: string; path: string; value: string }> = [];
    for (const [ns, bundle] of Object.entries(fileBundles.en ?? {})) {
      const flat = flatten(bundle);
      for (const [path, value] of Object.entries(flat)) {
        out.push({ full: `${ns}.${path}`, namespace: ns, path, value });
      }
    }
    return out.sort((a, b) => a.full.localeCompare(b.full));
  }, [fileBundles]);

  const overrideByKey = useMemo(() => {
    const m = new Map<string, Record<string, string>>();
    for (const row of overrides ?? []) {
      if (!m.has(row.key)) m.set(row.key, {});
      m.get(row.key)![row.locale] = row.value;
    }
    return m;
  }, [overrides]);

  // The CURRENT value of every key in every locale, read from the JSON files
  // plus any published overrides (the same source of truth the app renders
  // with). The RU/DE/HY columns show the real translation for that locale,
  // falling back to English only when a key is untranslated.
  const localeValues = useMemo(() => {
    const byLocale: Record<string, Record<string, string>> = { en: {}, ru: {}, de: {}, hy: {} };
    for (const loc of LOCALES) {
      const map: Record<string, string> = {};
      for (const bundle of Object.values(fileBundles?.[loc as string] ?? {})) {
        Object.assign(map, flatten(bundle));
      }
      byLocale[loc as string] = map;
    }
    // Published overrides win over the files — they are what the app renders.
    for (const [fullKey, perLocale] of overrideByKey) {
      const dot = fullKey.indexOf('.');
      if (dot <= 0) continue;
      const path = fullKey.slice(dot + 1);
      for (const [loc, value] of Object.entries(perLocale)) {
        byLocale[loc] = byLocale[loc] ?? {};
        byLocale[loc][path] = value;
      }
    }
    return byLocale;
  }, [fileBundles, overrideByKey]);

  const filteredKeys = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allKeys.slice(0, 200);
    return allKeys.filter((k) => k.full.toLowerCase().includes(q)).slice(0, 200);
  }, [allKeys, search]);

  const draftId = (fullKey: string, locale: string) => `${fullKey}::${locale}`;

  /** Ask Gemini (via the superadmin translate endpoint) for a ready translation. */
  const translateWithAi = async (fullKey: string, locale: string, source: string) => {
    const cellId = draftId(fullKey, locale);
    setTranslating(cellId);
    try {
      const res = await postJsonWithCsrf('/api/superadmin/translate', {
        text: source,
        targetLang: locale,
      });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || !data.text) {
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      setDrafts((d) => ({ ...d, [cellId]: data.text! }));
      toast.success(
        t('superadmin.operatorTools.aiTranslated', 'AI translation ready — review and save'),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setTranslating(null);
    }
  };

  const saveOverride = async (fullKey: string, locale: string) => {
    const value = drafts[draftId(fullKey, locale)] ?? '';
    if (!value.trim()) return;
    try {
      await setI18nOverride({ key: fullKey, locale, value });
      setDrafts((d) => {
        const next = { ...d };
        delete next[draftId(fullKey, locale)];
        return next;
      });
      toast.success(t('superadmin.operatorTools.saved', 'Saved — live everywhere'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  // ── Limits tab state ──────────────────────────────────────────────────────
  const [limitDrafts, setLimitDrafts] = useState<Record<string, string>>({});

  // ── Maintenance tab state ─────────────────────────────────────────────────
  const [winTitle, setWinTitle] = useState('');
  const [winMessage, setWinMessage] = useState('');
  const [winStart, setWinStart] = useState('');
  const [winEnd, setWinEnd] = useState('');
  const [winBroadcast, setWinBroadcast] = useState('');

  const loading = !overrides || !limits || !ops || !windows;

  const fmtDate = (ts: number | null | undefined) =>
    ts ? new Date(ts).toLocaleString(i18n.language) : '—';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <ShieldLoader size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-(--brand)/10 text-(--brand)">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
              {t('superadmin.operatorTools.title', 'Operator tools')}
            </h1>
            <p className="text-sm text-(--text-muted)">
              {t('superadmin.operatorTools.subtitle', 'Run the product without touching code.')}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 rounded-xl border border-(--border) bg-(--card)/60 p-1 w-fit">
          {TABS.map((tb) => (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors',
                tab === tb.id
                  ? 'bg-(--brand) text-white'
                  : 'text-(--text-muted) hover:text-(--text-primary)',
              )}
            >
              <tb.icon className="h-4 w-4" />
              {t(tb.labelKey, tb.labelKey.split('.').pop() ?? '')}
            </button>
          ))}
        </div>

        {/* ── Translations ─────────────────────────────────────────────────── */}
        {tab === 'translations' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--text-muted)" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t(
                    'superadmin.operatorTools.searchKeys',
                    'Search keys, e.g. notifications.saved',
                  )}
                  className="pl-9"
                />
              </div>
              <span className="text-xs text-(--text-muted)">
                {t('superadmin.operatorTools.keyCount', '{{n}} overrides active', {
                  n: overrides?.length ?? 0,
                })}
              </span>
            </div>

            <div className="rounded-2xl border border-(--border) overflow-x-auto">
              <table className="w-full min-w-[900px] table-fixed text-sm">
                <thead>
                  <tr className="border-b border-(--border)/60 text-left text-xs uppercase tracking-widest text-muted-foreground">
                    <th className="w-[24%] px-4 py-3 font-semibold">
                      {t('superadmin.operatorTools.keyCol', 'Key')}
                    </th>
                    <th className="w-[14%] px-4 py-3 font-semibold">
                      {t('superadmin.operatorTools.enValue', 'English (current)')}
                    </th>
                    {LOCALES.map((loc) => (
                      <th key={loc} className="w-[15.5%] px-2 py-3 font-semibold">
                        {localeName(loc)}
                        {overrideByKey.get(filteredKeys[0]?.full ?? '')?.[loc] && (
                          <span className="ml-1 text-[10px] text-(--brand)">●</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredKeys.map((key) => (
                    <tr key={key.full} className="border-b border-(--border)/40 last:border-0">
                      <td className="px-4 py-2.5">
                        <p className="font-mono text-xs" style={{ color: 'var(--text-primary)' }}>
                          {key.full}
                        </p>
                        <p className="text-xs text-(--text-muted) line-clamp-1">{key.value}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="text-xs text-(--text-secondary) line-clamp-2">{key.value}</p>
                      </td>
                      {LOCALES.map((loc) => {
                        const ov = overrideByKey.get(key.full)?.[loc];
                        const id = draftId(key.full, loc);
                        const draft = drafts[id];
                        const current = localeValues[loc as string]?.[key.path] ?? key.value;
                        const value = draft ?? ov ?? current;
                        const hasOverride = !!ov;
                        return (
                          <td key={loc} className="px-2 py-2.5">
                            <div className="flex items-center gap-1">
                              <Input
                                value={value}
                                onChange={(e) =>
                                  setDrafts((d) => ({
                                    ...d,
                                    [id]: e.target.value,
                                  }))
                                }
                                className={cn(
                                  'h-8 min-w-0 flex-1 text-xs',
                                  hasOverride && 'border-(--brand)/50',
                                )}
                              />
                              {loc !== 'en' && draft === undefined && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 shrink-0 text-(--brand)"
                                  disabled={translating === draftId(key.full, loc)}
                                  onClick={() => translateWithAi(key.full, loc, key.value)}
                                  title={t(
                                    'superadmin.operatorTools.aiTranslate',
                                    'Translate with AI',
                                  )}
                                >
                                  {translating === draftId(key.full, loc) ? (
                                    <ShieldLoader size="xs" variant="inline" />
                                  ) : (
                                    <Sparkles className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              )}
                              {draft !== undefined && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 shrink-0"
                                  onClick={() => saveOverride(key.full, loc)}
                                  title={t('superadmin.operatorTools.save', 'Save override')}
                                >
                                  <Save className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {hasOverride && draft === undefined && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 shrink-0 text-destructive"
                                  onClick={async () => {
                                    const row = overrides?.find(
                                      (r) => r.key === key.full && r.locale === loc,
                                    );
                                    if (row) {
                                      await deleteI18nOverride({ id: row._id });
                                      toast.success(
                                        t(
                                          'superadmin.operatorTools.reverted',
                                          'Reverted to default',
                                        ),
                                      );
                                    }
                                  }}
                                  title={t('superadmin.operatorTools.revert', 'Revert to default')}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {filteredKeys.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-(--text-muted)">
                        {t(
                          'superadmin.operatorTools.noKeys',
                          'No keys match — try a different search.',
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Limits ───────────────────────────────────────────────────────── */}
        {tab === 'limits' && (
          <div className="grid gap-4 md:grid-cols-2">
            {(limits ?? []).map((lim) => {
              const draft = limitDrafts[lim.key];
              const value = draft ?? String(lim.value);
              const isOverridden = lim.value !== lim.default;
              return (
                <Card key={lim.key} className="border-(--border)">
                  <CardHeader className="pb-2">
                    <CardTitle
                      className="font-mono text-sm"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {lim.key}
                    </CardTitle>
                    <p className="text-xs text-(--text-muted)">
                      {t(`superadmin.operatorTools.limitDesc.${lim.key}`, lim.description)}
                    </p>
                  </CardHeader>
                  <CardContent className="flex items-center gap-2">
                    <Input
                      value={value}
                      type="number"
                      onChange={(e) => setLimitDrafts((d) => ({ ...d, [lim.key]: e.target.value }))}
                      className="w-32"
                    />
                    <span className="text-xs text-(--text-muted)">
                      {t('superadmin.operatorTools.default', 'default {{n}}', { n: lim.default })}
                    </span>
                    <div className="ml-auto flex items-center gap-1">
                      {draft !== undefined && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={async () => {
                            const num = Number(draft);
                            if (!Number.isFinite(num) || num <= 0) {
                              toast.error(
                                t(
                                  'superadmin.operatorTools.invalidNumber',
                                  'Enter a positive number',
                                ),
                              );
                              return;
                            }
                            await setLimit({ key: lim.key, value: num });
                            setLimitDrafts((d) => {
                              const next = { ...d };
                              delete next[lim.key];
                              return next;
                            });
                            toast.success(
                              t('superadmin.operatorTools.saved', 'Saved — live everywhere'),
                            );
                          }}
                        >
                          <Save className="h-3.5 w-3.5" />
                          {t('superadmin.operatorTools.save', 'Save')}
                        </Button>
                      )}
                      {isOverridden && draft === undefined && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1 text-(--text-muted) hover:text-(--danger-text)"
                          title={t(
                            'superadmin.operatorTools.resetLimit',
                            'Reset to default ({{n}})',
                            { n: lim.default },
                          )}
                          aria-label={t(
                            'superadmin.operatorTools.resetLimit',
                            'Reset to default ({{n}})',
                            { n: lim.default },
                          )}
                          onClick={async () => {
                            await resetLimit({ key: lim.key });
                            toast.success(
                              t('superadmin.operatorTools.reverted', 'Reverted to default'),
                            );
                          }}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* ── Scheduled ops ────────────────────────────────────────────────── */}
        {tab === 'scheduled' && (
          <div className="rounded-2xl border border-(--border) overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-(--border)/60 text-left text-xs uppercase tracking-widest text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">
                    {t('superadmin.operatorTools.jobCol', 'Job')}
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    {t('superadmin.operatorTools.scheduleCol', 'Schedule')}
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    {t('superadmin.operatorTools.lastRunCol', 'Last run')}
                  </th>
                  <th className="px-4 py-3 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {(ops ?? []).map((op) => (
                  <tr key={op.jobKey} className="border-b border-(--border)/40 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                        {t(`superadmin.operatorTools.jobLabel.${op.jobKey}`, op.label)}
                      </p>
                      <p className="text-xs text-(--text-muted) line-clamp-1">
                        {t(`superadmin.operatorTools.jobDesc.${op.jobKey}`, op.description)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-(--text-secondary)">
                      {t(`superadmin.operatorTools.jobSchedule.${op.jobKey}`, op.schedule)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-(--text-secondary)">{fmtDate(op.lastRunAt)}</p>
                      <Badge
                        variant={
                          op.lastRunOutcome === 'error'
                            ? 'destructive'
                            : op.lastRunOutcome === 'skipped'
                              ? 'outline'
                              : 'secondary'
                        }
                        className="mt-1 text-[10px]"
                      >
                        {op.lastRunOutcome ?? t('superadmin.operatorTools.never', 'never')}
                      </Badge>
                      {op.lastRunError && (
                        <p className="mt-1 font-mono text-[10px] text-destructive line-clamp-1">
                          {op.lastRunError}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          disabled={op.isPaused}
                          onClick={async () => {
                            await runNow({ jobKey: op.jobKey });
                            toast.success(
                              t(
                                'superadmin.operatorTools.kicked',
                                'Job kicked off — check back shortly',
                              ),
                            );
                          }}
                        >
                          <Play className="h-3.5 w-3.5" />
                          {t('superadmin.operatorTools.runNow', 'Run now')}
                        </Button>
                        <Button
                          size="sm"
                          variant={op.isPaused ? 'default' : 'ghost'}
                          className="gap-1"
                          onClick={async () => {
                            await setPaused({ jobKey: op.jobKey, isPaused: !op.isPaused });
                            toast.success(
                              op.isPaused
                                ? t('superadmin.operatorTools.resumed', 'Resumed')
                                : t('superadmin.operatorTools.paused', 'Paused — next run skipped'),
                            );
                          }}
                        >
                          {op.isPaused ? (
                            <Play className="h-3.5 w-3.5" />
                          ) : (
                            <Pause className="h-3.5 w-3.5" />
                          )}
                          {op.isPaused
                            ? t('superadmin.operatorTools.resume', 'Resume')
                            : t('superadmin.operatorTools.pause', 'Pause')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Maintenance ──────────────────────────────────────────────────── */}
        {tab === 'maintenance' && (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="border-(--border)">
              <CardHeader>
                <CardTitle className="text-sm" style={{ color: 'var(--text-primary)' }}>
                  {t('superadmin.operatorTools.newWindow', 'Plan a maintenance window')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  value={winTitle}
                  onChange={(e) => setWinTitle(e.target.value)}
                  placeholder={t(
                    'superadmin.operatorTools.windowTitlePh',
                    'e.g. Scheduled maintenance — Saturday 22:00',
                  )}
                />
                <Input
                  value={winMessage}
                  onChange={(e) => setWinMessage(e.target.value)}
                  placeholder={t(
                    'superadmin.operatorTools.windowMessagePh',
                    'What users will see during the window',
                  )}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    type="datetime-local"
                    value={winStart}
                    onChange={(e) => setWinStart(e.target.value)}
                    aria-label={t('superadmin.operatorTools.start', 'Start')}
                  />
                  <Input
                    type="datetime-local"
                    value={winEnd}
                    onChange={(e) => setWinEnd(e.target.value)}
                    aria-label={t('superadmin.operatorTools.end', 'End')}
                  />
                </div>
                <Input
                  value={winBroadcast}
                  onChange={(e) => setWinBroadcast(e.target.value)}
                  placeholder={t(
                    'superadmin.operatorTools.broadcastPh',
                    'Optional: pre-window broadcast to all orgs',
                  )}
                />
                <Button
                  className="w-full gap-1.5"
                  disabled={!winTitle || !winStart || !winEnd}
                  onClick={async () => {
                    const start = new Date(winStart).getTime();
                    const end = new Date(winEnd).getTime();
                    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
                      toast.error(
                        t('superadmin.operatorTools.badWindow', 'End must be after start'),
                      );
                      return;
                    }
                    await createWindow({
                      title: winTitle,
                      message: winMessage || winTitle,
                      startsAt: start,
                      endsAt: end,
                      broadcastTitle: winBroadcast ? winTitle : undefined,
                      broadcastMessage: winBroadcast || undefined,
                    });
                    setWinTitle('');
                    setWinMessage('');
                    setWinStart('');
                    setWinEnd('');
                    setWinBroadcast('');
                    toast.success(
                      t(
                        'superadmin.operatorTools.windowPlanned',
                        'Window planned — it opens and announces itself',
                      ),
                    );
                  }}
                >
                  <CalendarClock className="h-4 w-4" />
                  {t('superadmin.operatorTools.planWindow', 'Plan window')}
                </Button>
              </CardContent>
            </Card>

            <div className="space-y-3">
              {(windows ?? []).length === 0 && (
                <p className="text-sm text-(--text-muted) py-8 text-center">
                  {t('superadmin.operatorTools.noWindows', 'No maintenance windows yet.')}
                </p>
              )}
              {(windows ?? []).map((w) => (
                <Card key={w._id} className="border-(--border)">
                  <CardContent className="flex items-start gap-3 py-4">
                    <div
                      className={cn(
                        'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                        w.isActive
                          ? 'bg-destructive/10 text-destructive'
                          : 'bg-(--muted) text-(--text-muted)',
                      )}
                    >
                      {w.isActive ? (
                        <ShieldAlert className="h-4 w-4" />
                      ) : (
                        <CalendarClock className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {w.title}
                      </p>
                      <p className="text-xs text-(--text-muted) line-clamp-2">{w.message}</p>
                      <p className="mt-1 text-xs text-(--text-secondary)">
                        {fmtDate(w.startsAt)} → {fmtDate(w.endsAt)}
                        {w.broadcastMessage && !w.isBroadcastSent && (
                          <span className="ml-2 text-(--brand)">
                            {t('superadmin.operatorTools.broadcastPending', 'broadcast pending')}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="sm"
                        variant={w.isActive ? 'destructive' : 'outline'}
                        className="gap-1"
                        onClick={async () => {
                          await setWindowActive({ id: w._id, isActive: !w.isActive });
                          toast.success(
                            w.isActive
                              ? t('superadmin.operatorTools.windowClosed', 'Window closed')
                              : t('superadmin.operatorTools.windowOpened', 'Window opened now'),
                          );
                        }}
                      >
                        {w.isActive
                          ? t('superadmin.operatorTools.close', 'Close now')
                          : t('superadmin.operatorTools.openNow', 'Open now')}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive"
                        onClick={async () => {
                          await deleteWindow({ id: w._id });
                          toast.success(t('superadmin.operatorTools.deleted', 'Deleted'));
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
