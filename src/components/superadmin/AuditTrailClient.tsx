/**
 * Superadmin Audit Trail — every audited action across all organizations.
 * A read-only console: entries are written where the action happens, and a
 * global view is exactly what support needs to answer "who did what, when".
 */

'use client';

import { useMemo, useState } from 'react';
import { useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Search } from 'lucide-react';

import { api } from '@/convex/_generated/api';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ShieldLoader } from '@/components/ui/ShieldLoader';

const ACTION_TONE: Record<string, { badge: string }> = {
  'user.login': { badge: 'bg-(--success-quiet) text-(--success-text) border-(--success-outline)' },
  'user.login_failed': {
    badge: 'bg-(--danger-quiet) text-(--danger-text) border-(--danger-outline)',
  },
  'user.logout': { badge: 'bg-(--background-subtle) text-(--text-muted) border-(--border)' },
  'user.created': { badge: 'bg-(--brand-quiet) text-(--brand-text) border-(--brand-outline)' },
  'user.updated': { badge: 'bg-(--brand-quiet) text-(--brand-text) border-(--brand-outline)' },
  'user.deleted': { badge: 'bg-(--danger-quiet) text-(--danger-text) border-(--danger-outline)' },
  'superadmin.session.revoke': {
    badge: 'bg-(--warning-quiet) text-(--warning-text) border-(--warning-outline)',
  },
  'superadmin.session.revoke_all': {
    badge: 'bg-(--danger-quiet) text-(--danger-text) border-(--danger-outline)',
  },
};

export function AuditTrailClient() {
  const { t, i18n } = useTranslation();
  const [actionFilter, setActionFilter] = useState('');
  const logs = useQuery(
    api.superadmin.sessions.listGlobalAuditLogs,
    actionFilter ? { action: actionFilter } : {},
  );

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleString(i18n.language === 'ru' ? 'ru-RU' : 'en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

  const tone = (action: string) =>
    ACTION_TONE[action] ?? {
      badge: 'bg-(--background-subtle) text-(--text-muted) border-(--border)',
    };

  // Derive the filter dropdown from the loaded log actions.
  const knownActions = useMemo(() => {
    if (!logs) return [] as string[];
    const set = new Set<string>();
    logs.forEach((log) => set.add(log.action));
    return [...set].sort();
  }, [logs]);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl">
        <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
          <div>
            <h1
              className="text-3xl md:text-4xl font-bold mb-2"
              style={{ color: 'var(--text-primary)' }}
            >
              {t('superadmin.audit.title', 'Audit trail')}
            </h1>
            <p className="text-muted-foreground">
              {t(
                'superadmin.audit.subtitle',
                'Every audited action across all organizations, newest first',
              )}
            </p>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-(--text-muted)" />
            <Input
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              placeholder={t('superadmin.audit.filterPlaceholder', 'Filter by action…')}
              className="h-9 pl-8 text-sm"
            />
          </div>
          {knownActions.slice(0, 8).map((action) => (
            <button
              key={action}
              type="button"
              onClick={() => setActionFilter(actionFilter === action ? '' : action)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                actionFilter === action
                  ? 'border-(--brand-outline) bg-(--brand-quiet) text-(--brand-text)'
                  : 'border-(--border) text-(--text-muted) hover:text-(--text-primary)'
              }`}
            >
              {action}
            </button>
          ))}
        </div>

        <Card>
          <CardContent className="p-0">
            {logs === undefined ? (
              <div className="flex justify-center py-20">
                <ShieldLoader size="lg" />
              </div>
            ) : logs.length === 0 ? (
              <div className="py-20 text-center">
                <ShieldCheck className="mx-auto mb-3 h-12 w-12 text-(--text-muted) opacity-30" />
                <p className="text-(--text-secondary) font-medium">
                  {t('superadmin.audit.noLogs', 'No audit entries')}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-(--border)">
                {logs.map((log) => (
                  <div
                    key={log._id}
                    className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-3"
                  >
                    <div className="w-36 shrink-0 sm:text-right">
                      <p className="text-xs text-(--text-muted)">{formatDate(log.createdAt)}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-(--text-primary)">
                          {log.userName}
                        </span>
                        {log.organizationName && (
                          <span className="text-xs text-(--text-muted)">
                            · {log.organizationName}
                          </span>
                        )}
                        <Badge
                          variant="outline"
                          className={`ml-auto text-[11px] ${tone(log.action).badge}`}
                        >
                          {log.action}
                        </Badge>
                      </div>
                      {log.details && (
                        <p className="mt-0.5 break-words text-xs text-(--text-muted)">
                          {log.details}
                        </p>
                      )}
                      {log.target && (
                        <code className="mt-1 block truncate font-mono text-[11px] text-(--text-muted)">
                          {log.target}
                        </code>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default AuditTrailClient;
