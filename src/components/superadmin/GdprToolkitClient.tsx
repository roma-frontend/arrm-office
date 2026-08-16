/**
 * Superadmin GDPR Data Toolkit UI.
 *
 * Search a data subject → see the blast radius (per-table record counts) →
 * export as JSON, anonymize PII in place, or erase the subject entirely
 * (cascade delete + account scrubbing, confirmed by typing the email/ERASE).
 */

'use client';

import { useMemo, useState } from 'react';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Download,
  Eraser,
  Eye,
  FileJson,
  Search,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-react';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ShieldLoader } from '@/components/ui/ShieldLoader';

type Subject = {
  _id: Id<'users'>;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  organizationId: string | null;
  organizationName: string | null;
  recordCount: number;
  perTable: Record<string, number>;
};

const MODULE_LABELS: Record<string, string> = {
  account: 'Account',
  hr: 'HR / Employment',
  finance: 'Finance',
  goals: 'Goals',
  learning: 'Learning',
  communication: 'Communication',
  fleet: 'Fleet',
  meetings: 'Meetings',
  productivity: 'Productivity',
  recognition: 'Recognition',
  security: 'Security',
  compliance: 'Compliance',
};

export function GdprToolkitClient() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState('');
  const results = useQuery(
    api.superadmin.gdprToolkit.searchDataSubjects,
    searched.trim() ? { query: searched } : 'skip',
  );
  const convex = useConvex();
  const anonymize = useMutation(api.superadmin.gdprToolkit.anonymizeUser);
  const erase = useMutation(api.superadmin.gdprToolkit.eraseUserData);

  const [busy, setBusy] = useState<string | null>(null);
  const [eraseConfirm, setEraseConfirm] = useState<Record<string, string>>({});
  const [exportBusy, setExportBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Id<'users'> | null>(null);

  const grouped = useMemo(() => {
    if (!expanded || !results) return null;
    const subject = results.find((r) => r._id === expanded);
    if (!subject) return null;
    const groups: Record<string, { table: string; count: number }[]> = {};
    for (const [table, count] of Object.entries(subject.perTable)) {
      const group = table.includes('chat')
        ? 'communication'
        : table.includes('announcement')
          ? 'communication'
          : table.includes('driver')
            ? 'fleet'
            : table.includes('payroll') || table.includes('compensation')
              ? 'hr'
              : table.includes('expense')
                ? 'finance'
                : table.includes('room')
                  ? 'meetings'
                  : table.includes('login') || table.includes('device')
                    ? 'security'
                    : table.includes('point') || table.includes('kudos') || table.includes('reward')
                      ? 'recognition'
                      : table.includes('work') ||
                          table.includes('preferences') ||
                          table.includes('pomodoro')
                        ? 'productivity'
                        : table.includes('objectives') ||
                            table.includes('keyResults') ||
                            table.includes('goal')
                          ? 'goals'
                          : table.includes('enrollment') ||
                              table.includes('lesson') ||
                              table.includes('quiz') ||
                              table.includes('certificate')
                            ? 'learning'
                            : table.includes('gdpr') ||
                                table.includes('consent') ||
                                table.includes('dataAccess')
                              ? 'compliance'
                              : table.includes('employee') ||
                                  table.includes('leave') ||
                                  table.includes('timeTracking') ||
                                  table.includes('documents')
                                ? 'hr'
                                : 'account';
      groups[group] ??= [];
      groups[group].push({ table, count });
    }
    return groups;
  }, [expanded, results]);

  const run = async (key: string, fn: () => Promise<unknown>, success: string, error: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(success);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : error);
    } finally {
      setBusy(null);
    }
  };

  const handleExport = async (subject: Subject) => {
    setExportBusy(subject._id);
    try {
      const payload = await convex.query(api.superadmin.gdprToolkit.exportUserData, {
        userId: subject._id,
      });
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gdpr-export-${subject.email.replace(/[^a-z0-9@.-]/gi, '_')}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t('superadmin.gdpr.exported', 'Export downloaded'));
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t('superadmin.gdpr.exportFailed', 'Export failed'),
      );
    } finally {
      setExportBusy(null);
    }
  };

  const handleErase = (subject: Subject) => {
    const confirmText = (eraseConfirm[subject._id] ?? '').trim();
    if (!confirmText) {
      setEraseConfirm((m) => ({ ...m, [subject._id]: '' }));
      return;
    }
    void run(
      `erase-${subject._id}`,
      () => erase({ userId: subject._id, confirm: confirmText }),
      t('superadmin.gdpr.erased', 'Data subject erased'),
      t('superadmin.gdpr.eraseFailed', 'Erase failed'),
    );
  };

  const tCount = (n: number) => t('superadmin.gdpr.recordCount', '{{count}} records', { count: n });

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl">
        <div className="my-6">
          <h1
            className="text-3xl md:text-4xl font-bold mb-2"
            style={{ color: 'var(--text-primary)' }}
          >
            {t('superadmin.gdpr.title', 'GDPR Data Toolkit')}
          </h1>
          <p className="text-muted-foreground">
            {t(
              'superadmin.gdpr.subtitle',
              'Find a data subject, inspect their data footprint, export, anonymize or erase',
            )}
          </p>
        </div>

        {/* Search */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setSearched(query.trim());
              }}
              placeholder={t('superadmin.gdpr.searchPlaceholder', 'Search by exact email or name…')}
              className="pl-9"
            />
          </div>
          <Button onClick={() => setSearched(query.trim())} className="gap-2">
            <Users className="h-4 w-4" />
            {t('superadmin.gdpr.search', 'Search')}
          </Button>
        </div>

        {/* Results */}
        {searched && !results && (
          <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <ShieldLoader size="xs" variant="inline" />
            {t('superadmin.controlCenter.loading', 'Loading…')}
          </div>
        )}

        {searched && results && results.length === 0 && (
          <div className="mt-6 flex flex-col items-center gap-2 rounded-2xl border border-(--border)/60 bg-(--card)/50 p-10 text-center">
            <Search className="h-8 w-8 text-(--text-muted) opacity-40" />
            <p className="text-sm text-muted-foreground">
              {t(
                'superadmin.gdpr.noResults',
                'No data subject found. GDPR search matches the exact email or full name.',
              )}
            </p>
          </div>
        )}

        {searched && results && results.length > 0 && (
          <div className="mt-6 space-y-4">
            {results.map((subject) => (
              <div
                key={subject._id}
                className="rounded-2xl border border-(--border)/60 bg-(--card)/50 overflow-hidden"
              >
                <div className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <UserRound className="h-4 w-4 text-(--brand-text)" />
                        <p
                          className="font-semibold truncate"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {subject.name}
                        </p>
                        {!subject.isActive && (
                          <span className="rounded-full bg-(--danger-quiet) px-2 py-0.5 text-[10px] font-semibold text-(--danger-text)">
                            {t('superadmin.gdpr.inactive', 'inactive')}
                          </span>
                        )}
                      </div>
                      <p className="font-mono text-xs text-muted-foreground truncate mt-0.5">
                        {subject.email}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {subject.organizationName ?? '—'} · {subject.role}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-(--brand-quiet) px-2 py-0.5 text-[11px] font-semibold text-(--brand-text)">
                          {tCount(subject.recordCount)}
                        </span>
                        {Object.entries(subject.perTable)
                          .slice(0, 6)
                          .map(([table, count]) => (
                            <span
                              key={table}
                              className="rounded-full border border-(--border)/60 px-2 py-0.5 text-[11px] text-muted-foreground"
                            >
                              {table} · {count}
                            </span>
                          ))}
                        {Object.keys(subject.perTable).length > 6 && (
                          <span className="text-[11px] text-muted-foreground">
                            +{Object.keys(subject.perTable).length - 6}{' '}
                            {t('superadmin.gdpr.moreTables', 'more')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={busy !== null}
                        onClick={() =>
                          setExpanded((cur) => (cur === subject._id ? null : subject._id))
                        }
                      >
                        <Eye className="h-3.5 w-3.5" />
                        {t('superadmin.gdpr.inspect', 'Inspect')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={exportBusy !== null || busy !== null}
                        onClick={() => void handleExport(subject)}
                      >
                        <Download className="h-3.5 w-3.5" />
                        {exportBusy === subject._id
                          ? t('superadmin.gdpr.exporting', 'Exporting…')
                          : t('superadmin.gdpr.export', 'Export')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 border-(--warning-outline) text-(--warning-text) hover:bg-(--warning-quiet)"
                        disabled={busy !== null}
                        onClick={() =>
                          run(
                            `anon-${subject._id}`,
                            () => anonymize({ userId: subject._id }),
                            t('superadmin.gdpr.anonymized', 'User anonymized'),
                            t('superadmin.gdpr.anonFailed', 'Anonymize failed'),
                          )
                        }
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        {t('superadmin.gdpr.anonymize', 'Anonymize')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 border-(--danger-outline) text-(--danger-text) hover:bg-(--danger-quiet)"
                        disabled={busy !== null}
                        onClick={() => {
                          if (!eraseConfirm[subject._id]) {
                            setEraseConfirm((m) => ({ ...m, [subject._id]: '' }));
                            return;
                          }
                          handleErase(subject);
                        }}
                      >
                        <Eraser className="h-3.5 w-3.5" />
                        {t('superadmin.gdpr.erase', 'Erase')}
                      </Button>
                    </div>
                  </div>

                  {eraseConfirm[subject._id] !== undefined && (
                    <div className="mt-3 flex gap-2 items-center">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-(--danger-text)" />
                      <Input
                        value={eraseConfirm[subject._id]}
                        onChange={(e) =>
                          setEraseConfirm((m) => ({ ...m, [subject._id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleErase(subject);
                        }}
                        placeholder={t(
                          'superadmin.gdpr.eraseConfirmPlaceholder',
                          'Type the email or ERASE to confirm permanent erasure',
                        )}
                        className="h-8 text-xs"
                      />
                      <Button
                        size="sm"
                        className="h-8 shrink-0 bg-(--danger-solid) text-white hover:bg-(--danger-solid)"
                        disabled={busy !== null}
                        onClick={() => handleErase(subject)}
                      >
                        <Eraser className="h-3.5 w-3.5" />
                        {t('superadmin.gdpr.eraseConfirm', 'Erase forever')}
                      </Button>
                    </div>
                  )}

                  {expanded === subject._id && (
                    <div className="mt-4 border-t border-(--border)/40 pt-4">
                      <div className="flex items-center gap-2 mb-3">
                        <FileJson className="h-4 w-4 text-(--brand-text)" />
                        <h3
                          className="text-sm font-semibold"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {t('superadmin.gdpr.footprint', 'Data footprint by module')}
                        </h3>
                      </div>
                      {grouped ? (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {Object.entries(grouped).map(([module, tables]) => (
                            <div
                              key={module}
                              className="rounded-xl border border-(--border)/40 bg-(--card)/30 p-3"
                            >
                              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                                {MODULE_LABELS[module] ?? module}
                              </p>
                              <ul className="space-y-1">
                                {tables.map(({ table, count }) => (
                                  <li
                                    key={table}
                                    className="flex items-center justify-between text-xs"
                                  >
                                    <span className="font-mono text-muted-foreground">{table}</span>
                                    <span
                                      className="font-semibold"
                                      style={{ color: 'var(--text-primary)' }}
                                    >
                                      {count}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {t('superadmin.gdpr.noRecords', 'No records found')}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
