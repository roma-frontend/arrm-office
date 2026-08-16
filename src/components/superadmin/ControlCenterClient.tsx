/**
 * Superadmin Control Center — the operator's live cockpit.
 *
 * One screen, seven tabs: Monitor (live pulse with trends, data quality,
 * platform health, backup readiness), Security (leveled alert feed), Sessions
 * (remote logout), Users (paginated directory), Orgs, Audit and one-click
 * Exports. The pattern follows Builder Studio's control center: everything a
 * platform operator needs to run the product sits in one place.
 */

'use client';

import { useState } from 'react';
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Activity,
  Archive,
  ArrowDownToLine,
  Building2,
  Download,
  FileJson,
  FileSpreadsheet,
  Globe,
  KeyRound,
  Loader2,
  LogOut,
  Monitor,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';

import type { TFunction } from 'i18next';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { cn } from '@/lib/utils';

type TabId = 'monitor' | 'security' | 'sessions' | 'users' | 'orgs' | 'audit' | 'export';

const TAB_DEFS: { id: TabId; icon: typeof Activity }[] = [
  { id: 'monitor', icon: Activity },
  { id: 'security', icon: ShieldAlert },
  { id: 'sessions', icon: Monitor },
  { id: 'users', icon: Users },
  { id: 'orgs', icon: Building2 },
  { id: 'audit', icon: ScrollText },
  { id: 'export', icon: Download },
];

const LEVEL_CLS: Record<string, string> = {
  critical: 'bg-(--danger-quiet) text-(--danger-text) border-(--danger-outline)',
  warn: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  info: 'bg-(--brand-quiet) text-(--brand-text) border-(--brand-quiet-hover)',
};

interface PulseMetric {
  lastHour: number;
  last24h: number;
  prev24h: number;
}

function PulseCard({
  label,
  metric,
  icon: Icon,
  t,
}: {
  label: string;
  metric: PulseMetric;
  icon: typeof Activity;
  t: TFunction;
}) {
  const delta = metric.last24h - metric.prev24h;
  const Trend = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : null;
  const trendCls =
    delta > 0
      ? 'text-green-600 dark:text-green-400'
      : delta < 0
        ? 'text-(--danger-text)'
        : 'text-muted-foreground';
  return (
    <div className="rounded-2xl border border-(--border)/60 bg-(--card)/50 p-4 transition-colors hover:border-(--border)">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        <Icon className="h-4 w-4 text-(--primary)" />
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p
          className="text-2xl font-black tracking-tight tabular-nums"
          style={{ color: 'var(--text-primary)' }}
        >
          {metric.last24h}
          <span className="ml-1 text-xs font-medium text-muted-foreground">
            {t('superadmin.controlCenter.per24h', '/24h')}
          </span>
        </p>
        {Trend && (
          <span className={cn('inline-flex items-center gap-1 text-xs font-semibold', trendCls)}>
            <Trend className="h-3.5 w-3.5" />
            {delta > 0 ? `+${delta}` : delta}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {t('superadmin.controlCenter.lastHour', '{{n}} last hour', { n: metric.lastHour })}
      </p>
    </div>
  );
}

function csvDownload(filename: string, rows: Record<string, unknown>[]) {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function jsonDownload(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ControlCenterClient() {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<TabId>('monitor');

  const locale =
    i18n.language === 'ru'
      ? 'ru-RU'
      : i18n.language === 'de'
        ? 'de-DE'
        : i18n.language === 'hy'
          ? 'hy-AM'
          : 'en-US';
  const fmt = (ts: number) =>
    new Date(ts).toLocaleString(locale, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  const ago = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60_000) return t('superadmin.controlCenter.justNow', 'just now');
    if (diff < 3_600_000)
      return t('superadmin.controlCenter.minAgo', '{{n}} min ago', {
        n: Math.floor(diff / 60_000),
      });
    if (diff < 86_400_000)
      return t('superadmin.controlCenter.hAgo', '{{n}}h ago', { n: Math.floor(diff / 3_600_000) });
    return fmt(ts);
  };

  // Per-tab lazy queries — a tab only fetches what it shows.
  const pulse = useQuery(
    api.superadmin.controlCenter.getControlPulse,
    tab === 'monitor' ? {} : 'skip',
  );
  const security = useQuery(
    api.superadmin.controlCenter.getControlSecurity,
    tab === 'security' ? {} : 'skip',
  );
  const quality = useQuery(
    api.superadmin.controlCenter.getDataQuality,
    tab === 'monitor' ? {} : 'skip',
  );
  const health = useQuery(api.superadmin.hub.getPlatformHealth, tab === 'monitor' ? {} : 'skip');
  const backups = useQuery(api.backups.getBackupStats, tab === 'monitor' ? {} : 'skip');
  const exports = useQuery(
    api.superadmin.controlCenter.getControlExports,
    tab === 'export' ? {} : 'skip',
  );
  const sessions = useQuery(
    api.superadmin.sessions.listActiveSessions,
    tab === 'sessions' ? {} : 'skip',
  );
  const audit = useQuery(
    api.superadmin.sessions.listGlobalAuditLogs,
    tab === 'audit' ? { limit: 100 } : 'skip',
  );
  const orgs = useQuery(api.organizations.getAllOrganizations, tab === 'orgs' ? {} : 'skip');
  const usersPage = usePaginatedQuery(api.users.listUsersPaginated, tab === 'users' ? {} : 'skip', {
    initialNumItems: 50,
  });

  const revokeSession = useMutation(api.superadmin.sessions.revokeSession);
  const [revokingId, setRevokingId] = useState<Id<'users'> | null>(null);

  const handleRevoke = async (userId: Id<'users'>) => {
    setRevokingId(userId);
    try {
      await revokeSession({ userId });
      toast.success(t('superadmin.sessions.revoked', 'Session revoked'));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('superadmin.sessions.revokeFailed', 'Could not revoke the session'),
      );
    } finally {
      setRevokingId(null);
    }
  };

  const PULSE_LABELS: {
    key: 'logins' | 'registrations' | 'newOrgs' | 'checkIns' | 'leaveRequests' | 'tasksCreated';
    icon: typeof Activity;
  }[] = [
    { key: 'logins', icon: KeyRound },
    { key: 'registrations', icon: Users },
    { key: 'newOrgs', icon: Building2 },
    { key: 'checkIns', icon: ShieldCheck },
    { key: 'leaveRequests', icon: Archive },
    { key: 'tasksCreated', icon: Activity },
  ];

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="my-6">
          <h1
            className="text-3xl md:text-4xl font-bold mb-2"
            style={{ color: 'var(--text-primary)' }}
          >
            {t('superadmin.controlCenter.title', 'Control Center')}
          </h1>
          <p className="text-muted-foreground">
            {t('superadmin.controlCenter.subtitle', 'Every operator tool in one live cockpit')}
          </p>
        </div>

        {/* Tab bar */}
        <div
          role="tablist"
          aria-label={t('superadmin.controlCenter.title', 'Control Center')}
          className="mb-6 flex flex-wrap gap-1 rounded-xl border border-(--border)/60 bg-(--muted)/30 p-1"
        >
          {TAB_DEFS.map((tb) => (
            <button
              key={tb.id}
              role="tab"
              aria-selected={tab === tb.id}
              tabIndex={tab === tb.id ? 0 : -1}
              onClick={() => setTab(tb.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                tab === tb.id
                  ? 'bg-(--card) shadow-sm'
                  : 'text-muted-foreground hover:text-(--text-primary)',
              )}
            >
              <tb.icon className="h-4 w-4" />
              {t(`superadmin.controlCenter.tabs.${tb.id}`)}
            </button>
          ))}
        </div>

        {/* ── Monitor ─────────────────────────────────────────────────────── */}
        {tab === 'monitor' && (
          <div className="space-y-6">
            {/* Live pulse */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              {PULSE_LABELS.map(({ key, icon }) => (
                <PulseCard
                  key={key}
                  label={t(`superadmin.controlCenter.pulse.${key}`)}
                  metric={pulse?.[key] ?? { lastHour: 0, last24h: 0, prev24h: 0 }}
                  icon={icon}
                  t={t}
                />
              ))}
            </div>

            {/* Hot orgs + platform health */}
            <div className="grid lg:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-(--border)/60 bg-(--card)/50 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Globe className="h-4 w-4 text-(--primary)" />
                  <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {t('superadmin.controlCenter.hotOrgs', 'Hottest organizations')}
                  </h3>
                </div>
                {!pulse ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ShieldLoader size="xs" variant="inline" />
                    {t('superadmin.controlCenter.loading', 'Loading…')}
                  </div>
                ) : pulse.hotOrgs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t('superadmin.controlCenter.noHotOrgs', 'No activity in the last 24h yet')}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {pulse.hotOrgs.map((o, i) => (
                      <li
                        key={o.id}
                        className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 bg-(--muted)/40"
                      >
                        <span className="flex items-center gap-2.5 min-w-0">
                          <span className="w-5 h-5 shrink-0 rounded-md text-[11px] font-bold flex items-center justify-center bg-(--brand-quiet) text-(--brand-text)">
                            {i + 1}
                          </span>
                          <span
                            className="text-sm font-medium truncate"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {o.name}
                          </span>
                        </span>
                        <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                          {o.count} {t('superadmin.controlCenter.actions', 'actions')}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-2xl border border-(--border)/60 bg-(--card)/50 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Activity className="h-4 w-4 text-(--primary)" />
                  <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {t('superadmin.controlCenter.health', 'Platform health')}
                  </h3>
                </div>
                {!health ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ShieldLoader size="xs" variant="inline" />
                    {t('superadmin.controlCenter.loading', 'Loading…')}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2.5">
                    {(
                      [
                        ['organizations', 'superadmin.controlCenter.healthOrgs'],
                        ['users', 'superadmin.controlCenter.healthUsers'],
                        ['activeSubscriptions', 'superadmin.controlCenter.healthSubs'],
                        ['sessions', 'superadmin.controlCenter.healthSessions'],
                        ['pendingLeaves', 'superadmin.controlCenter.healthPendingLeaves'],
                        ['openTickets', 'superadmin.controlCenter.healthTickets'],
                        ['activeIncidents', 'superadmin.controlCenter.healthIncidents'],
                        ['expiringTrials', 'superadmin.controlCenter.healthTrials'],
                      ] as const
                    ).map(([key, label]) => (
                      <div key={key} className="rounded-xl bg-(--muted)/40 px-3 py-2.5">
                        <p
                          className="text-lg font-black tabular-nums"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {health[key]}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{t(label)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Data quality + backup */}
            <div className="grid lg:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-(--border)/60 bg-(--card)/50 p-5">
                <div className="flex items-center justify-between gap-2 mb-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-(--primary)" />
                    <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {t('superadmin.controlCenter.quality.title', 'Data quality')}
                    </h3>
                  </div>
                  {quality && (
                    <span
                      className={cn(
                        'text-lg font-black tabular-nums',
                        quality.globalScore >= 90
                          ? 'text-green-600 dark:text-green-400'
                          : quality.globalScore >= 70
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-(--danger-text)',
                      )}
                    >
                      {quality.globalScore}%
                    </span>
                  )}
                </div>
                {!quality ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ShieldLoader size="xs" variant="inline" />
                    {t('superadmin.controlCenter.loading', 'Loading…')}
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2 mb-4">
                      <Badge variant="outline">
                        {t('superadmin.controlCenter.quality.excellent', 'Excellent')} ·{' '}
                        {quality.byBand.excellent}
                      </Badge>
                      <Badge variant="outline">
                        {t('superadmin.controlCenter.quality.good', 'Good')} · {quality.byBand.good}
                      </Badge>
                      <Badge variant="outline">
                        {t('superadmin.controlCenter.quality.attention', 'Needs attention')} ·{' '}
                        {quality.byBand.attention}
                      </Badge>
                      <Badge variant="outline">
                        {t('superadmin.controlCenter.quality.critical', 'Critical')} ·{' '}
                        {quality.byBand.critical}
                      </Badge>
                    </div>
                    <ul className="space-y-2">
                      {quality.worstOrgs.map((o) => (
                        <li
                          key={o.name}
                          className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 bg-(--muted)/40"
                        >
                          <div className="min-w-0">
                            <p
                              className="text-sm font-medium truncate"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              {o.name}
                            </p>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {o.missing.join(', ') || '—'}
                            </p>
                          </div>
                          <span
                            className={cn(
                              'text-sm font-bold tabular-nums',
                              o.score >= 90
                                ? 'text-green-600 dark:text-green-400'
                                : o.score >= 70
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-(--danger-text)',
                            )}
                          >
                            {o.score}%
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>

              <div className="rounded-2xl border border-(--border)/60 bg-(--card)/50 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Archive className="h-4 w-4 text-(--primary)" />
                  <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {t('superadmin.controlCenter.backup.title', 'Backup readiness')}
                  </h3>
                </div>
                {!backups ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ShieldLoader size="xs" variant="inline" />
                    {t('superadmin.controlCenter.loading', 'Loading…')}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="rounded-xl bg-(--muted)/40 px-3 py-3 text-center">
                      <p
                        className="text-xl font-black tabular-nums"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {backups.totalBackups}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {t('superadmin.controlCenter.backup.total', 'Backups')}
                      </p>
                    </div>
                    <div className="rounded-xl bg-(--muted)/40 px-3 py-3 text-center">
                      <p
                        className="text-xl font-black tabular-nums"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {backups.orgsBackedUp}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {t('superadmin.controlCenter.backup.orgs', 'Orgs backed up')}
                      </p>
                    </div>
                    <div className="rounded-xl bg-(--muted)/40 px-3 py-3 text-center">
                      <p
                        className="text-xl font-black tabular-nums"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {backups.totalSize >= 1_048_576
                          ? `${(backups.totalSize / 1_048_576).toFixed(1)} MB`
                          : `${(backups.totalSize / 1024).toFixed(0)} KB`}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {t('superadmin.controlCenter.backup.size', 'Total size')}
                      </p>
                    </div>
                  </div>
                )}
                <p className="mt-4 text-xs text-muted-foreground">
                  {t(
                    'superadmin.controlCenter.backup.note',
                    'Full database and employee snapshots are managed on the Backups page.',
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Security ────────────────────────────────────────────────────── */}
        {tab === 'security' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-(--danger-quiet) text-(--danger-text) border-(--danger-outline)">
                {t('superadmin.controlCenter.security.critical', 'Critical')} ·{' '}
                {security?.counts.critical ?? 0}
              </Badge>
              <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30">
                {t('superadmin.controlCenter.security.warn', 'Warnings')} ·{' '}
                {security?.counts.warn ?? 0}
              </Badge>
              <Badge className="bg-(--brand-quiet) text-(--brand-text) border-(--brand-quiet-hover)">
                {t('superadmin.controlCenter.security.info', 'Info')} · {security?.counts.info ?? 0}
              </Badge>
            </div>

            <div className="rounded-2xl border border-(--border)/60 bg-(--card)/50 overflow-hidden">
              {!security ? (
                <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                  <ShieldLoader size="xs" variant="inline" />
                  {t('superadmin.controlCenter.loading', 'Loading…')}
                </div>
              ) : security.alerts.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">
                  {t(
                    'superadmin.controlCenter.security.noAlerts',
                    'No security events in the last 24h — all quiet.',
                  )}
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-(--border)/60 text-left text-xs uppercase tracking-widest text-muted-foreground">
                      <th className="px-4 py-3 font-semibold">
                        {t('superadmin.controlCenter.security.level', 'Level')}
                      </th>
                      <th className="px-4 py-3 font-semibold">
                        {t('superadmin.controlCenter.security.event', 'Event')}
                      </th>
                      <th className="hidden px-4 py-3 font-semibold sm:table-cell">
                        {t('superadmin.controlCenter.security.actor', 'Actor / detail')}
                      </th>
                      <th className="px-4 py-3 font-semibold">
                        {t('superadmin.controlCenter.security.when', 'When')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {security.alerts.map((a) => (
                      <tr
                        key={a.id}
                        className="border-b border-(--border)/40 last:border-0 hover:bg-(--muted)/30"
                      >
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                              LEVEL_CLS[a.level],
                            )}
                          >
                            <ShieldAlert className="h-3 w-3" />
                            {a.level}
                          </span>
                        </td>
                        <td
                          className="px-4 py-3 font-medium"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {a.kind}
                        </td>
                        <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                          <span className="block truncate max-w-[280px]">{a.actor}</span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {ago(a.at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── Sessions ────────────────────────────────────────────────────── */}
        {tab === 'sessions' && (
          <div className="rounded-2xl border border-(--border)/60 bg-(--card)/50 overflow-hidden">
            {!sessions ? (
              <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                <ShieldLoader size="xs" variant="inline" />
                {t('superadmin.controlCenter.loading', 'Loading…')}
              </div>
            ) : sessions.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                {t('superadmin.controlCenter.noSessions', 'Nobody is logged in right now.')}
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-(--border)/60 text-left text-xs uppercase tracking-widest text-muted-foreground">
                    <th className="px-4 py-3 font-semibold">
                      {t('superadmin.sessions.userCol', 'User')}
                    </th>
                    <th className="hidden px-4 py-3 font-semibold md:table-cell">
                      {t('superadmin.sessions.orgCol', 'Organization')}
                    </th>
                    <th className="hidden px-4 py-3 font-semibold lg:table-cell">
                      {t('superadmin.sessions.deviceCol', 'Device')}
                    </th>
                    <th className="hidden px-4 py-3 font-semibold md:table-cell">
                      {t('superadmin.sessions.expiresCol', 'Expires')}
                    </th>
                    <th className="px-4 py-3 font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr
                      key={s.userId}
                      className="border-b border-(--border)/40 last:border-0 hover:bg-(--muted)/30"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                          {s.name}
                        </p>
                        <p className="text-xs text-muted-foreground">{s.email}</p>
                      </td>
                      <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                        {s.organizationName ?? '—'}
                      </td>
                      <td className="hidden px-4 py-3 lg:table-cell">
                        <p className="text-(--text-secondary)">
                          {s.device ?? t('superadmin.sessions.unknownDevice', 'Unknown device')}
                        </p>
                        {(s.ip || s.location) && (
                          <p className="font-mono text-xs text-muted-foreground">
                            {s.ip ?? ''}
                            {s.ip && s.location ? ' · ' : ''}
                            {s.location ?? ''}
                          </p>
                        )}
                      </td>
                      <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                        {fmt(s.sessionExpiry)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          disabled={revokingId === s.userId}
                          onClick={() => handleRevoke(s.userId)}
                        >
                          {revokingId === s.userId ? (
                            <ShieldLoader size="xs" variant="inline" />
                          ) : (
                            <LogOut className="h-3.5 w-3.5" />
                          )}
                          {t('superadmin.sessions.revoke', 'Log out')}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Users ───────────────────────────────────────────────────────── */}
        {tab === 'users' && (
          <div className="rounded-2xl border border-(--border)/60 bg-(--card)/50 overflow-hidden">
            {!usersPage ? (
              <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                <ShieldLoader size="xs" variant="inline" />
                {t('superadmin.controlCenter.loading', 'Loading…')}
              </div>
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-(--border)/60 text-left text-xs uppercase tracking-widest text-muted-foreground">
                      <th className="px-4 py-3 font-semibold">
                        {t('superadmin.controlCenter.user', 'User')}
                      </th>
                      <th className="hidden px-4 py-3 font-semibold md:table-cell">
                        {t('superadmin.controlCenter.role', 'Role')}
                      </th>
                      <th className="hidden px-4 py-3 font-semibold lg:table-cell">
                        {t('superadmin.controlCenter.org', 'Organization')}
                      </th>
                      <th className="px-4 py-3 font-semibold">
                        {t('superadmin.controlCenter.status', 'Status')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersPage.results.map((u) => (
                      <tr
                        key={u._id}
                        className="border-b border-(--border)/40 last:border-0 hover:bg-(--muted)/30"
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                            {u.name ?? '—'}
                          </p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </td>
                        <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                          {u.role}
                        </td>
                        <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                          {u.organizationId ? '✓' : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold',
                              u.isActive === false
                                ? 'bg-(--danger-quiet) text-(--danger-text)'
                                : 'bg-green-500/10 text-green-600 dark:text-green-400',
                            )}
                          >
                            {u.isActive === false
                              ? t('superadmin.controlCenter.blocked', 'Blocked')
                              : t('superadmin.controlCenter.active', 'Active')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex items-center justify-between p-4 border-t border-(--border)/60">
                  <p className="text-xs text-muted-foreground">
                    {t('superadmin.controlCenter.usersCount', '{{n}} users shown', {
                      n: usersPage.results.length,
                    })}
                  </p>
                  {usersPage.status === 'CanLoadMore' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => usersPage.loadMore(50)}
                    >
                      <Loader2 className="h-3.5 w-3.5" />
                      {t('superadmin.controlCenter.loadMore', 'Load more')}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Orgs ────────────────────────────────────────────────────────── */}
        {tab === 'orgs' && (
          <div className="rounded-2xl border border-(--border)/60 bg-(--card)/50 overflow-hidden">
            {!orgs ? (
              <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                <ShieldLoader size="xs" variant="inline" />
                {t('superadmin.controlCenter.loading', 'Loading…')}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-(--border)/60 text-left text-xs uppercase tracking-widest text-muted-foreground">
                    <th className="px-4 py-3 font-semibold">
                      {t('superadmin.controlCenter.org', 'Organization')}
                    </th>
                    <th className="hidden px-4 py-3 font-semibold md:table-cell">
                      {t('superadmin.controlCenter.industry', 'Industry')}
                    </th>
                    <th className="hidden px-4 py-3 font-semibold md:table-cell">
                      {t('superadmin.controlCenter.users', 'Users')}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {t('superadmin.controlCenter.status', 'Status')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {orgs.map((o) => (
                    <tr
                      key={o._id}
                      className="border-b border-(--border)/40 last:border-0 hover:bg-(--muted)/30"
                    >
                      <td
                        className="px-4 py-3 font-medium"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {o.name}
                      </td>
                      <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                        {o.industry ?? '—'}
                      </td>
                      <td className="hidden px-4 py-3 tabular-nums text-muted-foreground md:table-cell">
                        {(o as { employees?: number }).employees ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold',
                            o.isActive === false
                              ? 'bg-(--danger-quiet) text-(--danger-text)'
                              : 'bg-green-500/10 text-green-600 dark:text-green-400',
                          )}
                        >
                          {o.isActive === false
                            ? t('superadmin.controlCenter.blocked', 'Blocked')
                            : t('superadmin.controlCenter.active', 'Active')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Audit ───────────────────────────────────────────────────────── */}
        {tab === 'audit' && (
          <div className="rounded-2xl border border-(--border)/60 bg-(--card)/50 overflow-hidden">
            {!audit ? (
              <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                <ShieldLoader size="xs" variant="inline" />
                {t('superadmin.controlCenter.loading', 'Loading…')}
              </div>
            ) : audit.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                {t('superadmin.controlCenter.noAudit', 'No audit events recorded.')}
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-(--border)/60 text-left text-xs uppercase tracking-widest text-muted-foreground">
                    <th className="px-4 py-3 font-semibold">
                      {t('superadmin.controlCenter.security.action', 'Action')}
                    </th>
                    <th className="hidden px-4 py-3 font-semibold md:table-cell">
                      {t('superadmin.controlCenter.security.actor', 'Actor')}
                    </th>
                    <th className="hidden px-4 py-3 font-semibold lg:table-cell">
                      {t('superadmin.controlCenter.org', 'Organization')}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {t('superadmin.controlCenter.security.when', 'When')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((log) => (
                    <tr
                      key={log._id}
                      className="border-b border-(--border)/40 last:border-0 hover:bg-(--muted)/30"
                    >
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs" style={{ color: 'var(--text-primary)' }}>
                          {log.action}
                        </p>
                        {log.details && (
                          <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                            {log.details}
                          </p>
                        )}
                      </td>
                      <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                        {log.userEmail || log.userName}
                      </td>
                      <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                        {log.organizationName ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {ago(log.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Export ──────────────────────────────────────────────────────── */}
        {tab === 'export' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground max-w-2xl">
              {t(
                'superadmin.controlCenter.export.subtitle',
                'Download flat snapshots for audits, backups or analysis — CSV opens in any spreadsheet, JSON keeps the full structure.',
              )}
            </p>
            {!exports ? (
              <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                <ShieldLoader size="xs" variant="inline" />
                {t('superadmin.controlCenter.loading', 'Loading…')}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ['users', exports.users, FileSpreadsheet],
                    ['orgs', exports.orgs, FileSpreadsheet],
                    ['sessions', exports.sessions, FileSpreadsheet],
                    ['audit', exports.audit, FileSpreadsheet],
                  ] as const
                ).map(([key, rows, Icon]) => (
                  <div
                    key={key}
                    className="rounded-2xl border border-(--border)/60 bg-(--card)/50 p-4 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 shrink-0 rounded-xl bg-(--brand-quiet) text-(--brand-text) flex items-center justify-center">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p
                          className="text-sm font-semibold"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {t(`superadmin.controlCenter.export.${key}`)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {rows.length} {t('superadmin.controlCenter.rows', 'rows')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() =>
                          csvDownload(
                            `strata-${key}-${new Date().toISOString().slice(0, 10)}.csv`,
                            rows,
                          )
                        }
                      >
                        <ArrowDownToLine className="h-3.5 w-3.5" />
                        CSV
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() =>
                          jsonDownload(
                            `strata-${key}-${new Date().toISOString().slice(0, 10)}.json`,
                            rows,
                          )
                        }
                      >
                        <FileJson className="h-3.5 w-3.5" />
                        JSON
                      </Button>
                    </div>
                  </div>
                ))}
                <div className="rounded-2xl border border-(--border)/60 bg-(--card)/50 p-4 flex items-center justify-between gap-3 sm:col-span-2">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 shrink-0 rounded-xl bg-(--brand-quiet) text-(--brand-text) flex items-center justify-center">
                      <FileJson className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {t('superadmin.controlCenter.export.fullDump', 'Full snapshot')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t(
                          'superadmin.controlCenter.export.fullDumpDesc',
                          'All four datasets in one JSON file',
                        )}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() =>
                      jsonDownload(
                        `strata-control-center-${new Date().toISOString().slice(0, 10)}.json`,
                        exports,
                      )
                    }
                  >
                    <Download className="h-3.5 w-3.5" />
                    JSON
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
