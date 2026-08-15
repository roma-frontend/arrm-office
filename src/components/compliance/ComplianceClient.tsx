'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, usePaginatedQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useAuthStore } from '@/store/useAuthStore';
import type { Id } from '@/convex/_generated/dataModel';
import {
  Shield,
  ShieldCheck,
  FileText,
  ClipboardList,
  Eye,
  CheckCircle,
  XCircle,
  ChevronRight,
  ChevronLeft,
  Activity,
  User,
  Lock,
  AlertTriangle,
  Search,
  Filter,
} from 'lucide-react';

type TabId = 'stats' | 'audit' | 'gdpr' | 'consents' | 'dataAccess' | 'policies';

const TABS: { id: TabId; labelKey: string; icon: typeof Shield }[] = [
  { id: 'stats', labelKey: 'compliance.stats', icon: Activity },
  { id: 'audit', labelKey: 'compliance.auditLogs', icon: Eye },
  { id: 'gdpr', labelKey: 'compliance.gdprRequests', icon: FileText },
  { id: 'consents', labelKey: 'compliance.consentManagement', icon: ShieldCheck },
  { id: 'dataAccess', labelKey: 'compliance.dataAccessLogs', icon: Lock },
  { id: 'policies', labelKey: 'compliance.policies', icon: ClipboardList },
];

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const colorMap: Record<string, string> = {
    pending: 'var(--warning)',
    in_progress: 'var(--primary)',
    completed: 'var(--success)',
    rejected: 'var(--destructive)',
  };
  const bgMap: Record<string, string> = {
    pending: 'rgba(245,158,11,0.1)',
    in_progress: 'rgba(37,99,235,0.1)',
    completed: 'rgba(16,185,129,0.1)',
    rejected: 'rgba(239,68,68,0.1)',
  };
  const key = `compliance.gdprStatus.${status}`;
  return (
    <span
      className="px-2 py-0.5 rounded text-xs font-medium"
      style={{
        background: bgMap[status] || 'var(--muted)',
        color: colorMap[status] || 'var(--text-muted)',
      }}
    >
      {t(key)}
    </span>
  );
}

function AccessTypeBadge({ accessType }: { accessType: string }) {
  const { t } = useTranslation();
  const colorMap: Record<string, string> = {
    view: 'var(--primary)',
    export: 'var(--warning)',
    modify: 'var(--success)',
    delete: 'var(--destructive)',
  };
  const key = `compliance.accessTypes.${accessType}`;
  return (
    <span
      className="px-2 py-0.5 rounded text-xs font-mono font-medium"
      style={{
        background: `${colorMap[accessType] || 'var(--text-muted)'}22`,
        color: colorMap[accessType] || 'var(--text-muted)',
      }}
    >
      {t(key)}
    </span>
  );
}

export default function ComplianceClient() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabId>('stats');
  const [gdprFilter, setGdprFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const tabsRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = tabsRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [checkScroll]);

  const scrollTabs = (dir: 'left' | 'right') => {
    const el = tabsRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -150 : 150, behavior: 'smooth' });
  };

  const adminId = user?.id as Id<'users'> | undefined;

  const stats = useQuery(api.compliance.getComplianceStats, adminId ? { adminId } : 'skip');
  const {
    results: auditLogs,
    status: auditStatus,
    loadMore: loadMoreAudit,
  } = usePaginatedQuery(api.security.listAuditLogsPaginated, adminId ? { adminId } : 'skip', {
    initialNumItems: 50,
  });
  const gdprRequests = useQuery(
    api.compliance.getGdprRequests,
    adminId ? { adminId, limit: 100 } : 'skip',
  );
  const consents = useQuery(api.compliance.getUserConsents, adminId ? { adminId } : 'skip');
  const dataAccessLogs = useQuery(
    api.compliance.getDataAccessLogs,
    adminId ? { adminId, limit: 100 } : 'skip',
  );
  const policies = useQuery(api.compliance.getPolicies, adminId ? { adminId } : 'skip');

  if (!user) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]" />
      </div>
    );
  }

  const filteredGdprRequests = gdprRequests?.filter((r) => {
    if (gdprFilter !== 'all' && r.status !== gdprFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        r.userName?.toLowerCase().includes(q) ||
        r.userEmail?.toLowerCase().includes(q) ||
        r.requestType?.toLowerCase().includes(q) ||
        r.details?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredAuditLogs = auditLogs?.filter((log) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        log.userName?.toLowerCase().includes(q) ||
        log.userEmail?.toLowerCase().includes(q) ||
        log.action?.toLowerCase().includes(q) ||
        log.details?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredDataAccessLogs = dataAccessLogs?.filter((log) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        log.userName?.toLowerCase().includes(q) ||
        log.userEmail?.toLowerCase().includes(q) ||
        log.dataType?.toLowerCase().includes(q) ||
        log.accessType?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div style={{ color: 'var(--text-primary)' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-[var(--background)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--background)]/60 border-b border-[var(--border)]">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 sm:mb-8">
          <div className="flex items-center gap-2 sm:gap-3">
            <div
              className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl border shrink-0"
              style={{ background: 'rgba(37,99,235,0.1)', borderColor: 'rgba(37,99,235,0.3)' }}
            >
              <Shield className="w-5 h-5 sm:w-7 sm:h-7" style={{ color: 'var(--primary)' }} />
            </div>
            <div>
              <h1
                className="text-lg sm:text-2xl font-bold"
                style={{ color: 'var(--text-primary)' }}
              >
                {t('compliance.title')}
              </h1>
              <p
                className="text-xs sm:text-sm hidden sm:block"
                style={{ color: 'var(--text-muted)' }}
              >
                {t('compliance.stats')}
              </p>
            </div>
          </div>
          <div
            className="flex items-center gap-2 text-xs sm:text-sm"
            style={{ color: 'var(--text-muted)' }}
          >
            <Activity className="w-3 h-3 sm:w-4 sm:h-4" style={{ color: 'var(--success)' }} />
            {t('compliance.active')}
          </div>
        </div>

        {/* Search and Filter */}
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
              style={{ color: 'var(--text-muted)' }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('compliance.searchPlaceholder')}
              className="w-full pl-9 pr-4 py-2 rounded-lg text-sm bg-[var(--card)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
            />
          </div>
          {activeTab === 'gdpr' && (
            <div className="relative">
              <Filter
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                style={{ color: 'var(--text-muted)' }}
              />
              <select
                value={gdprFilter}
                onChange={(e) => setGdprFilter(e.target.value)}
                className="pl-9 pr-8 py-2 rounded-lg text-sm bg-[var(--card)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 appearance-none cursor-pointer"
              >
                <option value="all">{t('compliance.allStatuses')}</option>
                <option value="pending">{t('compliance.gdprStatus.pending')}</option>
                <option value="in_progress">{t('compliance.gdprStatus.in_progress')}</option>
                <option value="completed">{t('compliance.gdprStatus.completed')}</option>
                <option value="rejected">{t('compliance.gdprStatus.rejected')}</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Stats Bar */}
      {activeTab === 'stats' && stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-4 mb-6 sm:mb-8">
          {[
            {
              id: 'statsTotal',
              label: t('compliance.statsTotal'),
              value: stats.gdprRequests,
              color: 'var(--text-primary)',
            },
            {
              id: 'statsPending',
              label: t('compliance.statsPending'),
              value: stats.gdprByStatus.pending,
              color: 'var(--warning)',
            },
            {
              id: 'statsInProgress',
              label: t('compliance.statsInProgress'),
              value: stats.gdprByStatus.in_progress,
              color: 'var(--primary)',
            },
            {
              id: 'statsCompleted',
              label: t('compliance.statsCompleted'),
              value: stats.gdprByStatus.completed,
              color: 'var(--success)',
            },
            {
              id: 'statsRejected',
              label: t('compliance.statsRejected'),
              value: stats.gdprByStatus.rejected,
              color: 'var(--destructive)',
            },
          ].map((stat) => (
            <div
              key={stat.id}
              className="rounded-lg sm:rounded-xl p-2 sm:p-4 text-center border"
              style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
            >
              <div className="text-lg sm:text-2xl font-bold truncate" style={{ color: stat.color }}>
                {stat.value}
              </div>
              <div
                className="text-[9px] sm:text-xs mt-0.5 sm:mt-1 truncate"
                style={{ color: 'var(--text-muted)' }}
              >
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs Slider */}
      <div className="relative mb-4 sm:mb-6 group">
        {canScrollLeft && (
          <button
            onClick={() => scrollTabs('left')}
            className="absolute left-0 top-0 bottom-0 z-10 flex items-center justify-center w-8 transition-opacity"
            style={{ background: 'linear-gradient(to right, var(--background) 60%, transparent)' }}
          >
            <ChevronLeft className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          </button>
        )}

        <div
          ref={tabsRef}
          onScroll={checkScroll}
          className="flex gap-1 sm:gap-2 overflow-x-auto overflow-y-hidden scrollbar-hide border-b"
          style={{
            borderColor: 'var(--border)',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-1.5 px-3 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap shrink-0"
                style={{
                  background: activeTab === tab.id ? '#3b82f6' : 'transparent',
                  color: activeTab === tab.id ? 'white' : 'var(--text-muted)',
                  border:
                    activeTab === tab.id ? '1px solid var(--border)' : '1px solid transparent',
                  borderBottom:
                    activeTab === tab.id ? '1px solid var(--card)' : '1px solid transparent',
                  marginBottom: activeTab === tab.id ? '-1px' : '0',
                }}
              >
                <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                {t(tab.labelKey)}
              </button>
            );
          })}
        </div>

        {canScrollRight && (
          <button
            onClick={() => scrollTabs('right')}
            className="absolute right-0 top-0 bottom-0 z-10 flex items-center justify-center w-8 transition-opacity"
            style={{ background: 'linear-gradient(to left, var(--background) 60%, transparent)' }}
          >
            <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          </button>
        )}
      </div>

      {/* Tab: Stats */}
      {activeTab === 'stats' && stats && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
              className="rounded-xl p-5 border"
              style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
            >
              <h3 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                {t('compliance.consentManagement')}
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--text-muted)' }}>{t('compliance.statsTotal')}</span>
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {stats.consentStats.total}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--text-muted)' }}>
                    {t('compliance.statsActiveConsents')}
                  </span>
                  <span className="font-medium" style={{ color: 'var(--success)' }}>
                    {stats.consentStats.active}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--text-muted)' }}>
                    {t('compliance.statsWithdrawnConsents')}
                  </span>
                  <span className="font-medium" style={{ color: 'var(--destructive)' }}>
                    {stats.consentStats.withdrawn}
                  </span>
                </div>
              </div>
            </div>
            <div
              className="rounded-xl p-5 border"
              style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
            >
              <h3 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                {t('compliance.policies')}
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--text-muted)' }}>{t('compliance.statsTotal')}</span>
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {stats.policyStats.total}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--text-muted)' }}>
                    {t('compliance.statsActivePolicies')}
                  </span>
                  <span className="font-medium" style={{ color: 'var(--success)' }}>
                    {stats.policyStats.active}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--text-muted)' }}>{t('compliance.inactive')}</span>
                  <span className="font-medium" style={{ color: 'var(--text-muted)' }}>
                    {stats.policyStats.inactive}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div
            className="rounded-xl p-5 border"
            style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
          >
            <h3 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
              {t('compliance.dataAccessLogs')}
            </h3>
            <div className="text-3xl font-bold" style={{ color: 'var(--primary)' }}>
              {stats.dataAccessLogs}
            </div>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              {t('compliance.dataAccessLogs')}
            </p>
          </div>
        </div>
      )}

      {/* Tab: Audit Logs */}
      {activeTab === 'audit' && (
        <div>
          {!filteredAuditLogs?.length ? (
            <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>
              <Eye className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--text-disabled)' }} />
              {t('compliance.noAuditLogs')}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredAuditLogs.map((log) => (
                <div
                  key={log._id}
                  className="rounded-lg p-4 flex items-center gap-4 border"
                  style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
                >
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: 'var(--primary)' }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className="font-medium text-sm"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {log.userName}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {log.userEmail}
                      </span>
                    </div>
                    <div className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>
                      <span
                        className="font-mono text-xs px-1.5 py-0.5 rounded mr-2 inline-block shrink-0"
                        style={{ background: 'rgba(37,99,235,0.12)', color: 'var(--primary)' }}
                      >
                        {log.action}
                      </span>
                      <span className="truncate">{log.details}</span>
                    </div>
                    {log.ip && (
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-disabled)' }}>
                        {t('compliance.ipAddress')}: {log.ip}
                      </div>
                    )}
                  </div>
                  <div className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {new Date(log.createdAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
          {auditStatus === 'CanLoadMore' && (
            <button
              onClick={() => loadMoreAudit(50)}
              className="w-full mt-3 py-2 text-sm text-(--brand-text) hover:underline rounded-lg border"
              style={{ borderColor: 'var(--border)' }}
            >
              {t('compliance.loadMore', { defaultValue: 'Load more logs' })}
            </button>
          )}
        </div>
      )}

      {/* Tab: GDPR Requests */}
      {activeTab === 'gdpr' && (
        <div>
          {!filteredGdprRequests?.length ? (
            <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>
              <FileText
                className="w-12 h-12 mx-auto mb-3"
                style={{ color: 'var(--text-disabled)' }}
              />
              {t('compliance.noGdprRequests')}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredGdprRequests.map((req) => (
                <div
                  key={req._id}
                  className="rounded-lg p-4 border"
                  style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="shrink-0">
                        <div className="w-10 h-10 rounded-full bg-[var(--muted)] flex items-center justify-center">
                          <User className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span
                            className="font-medium text-sm truncate"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {req.userName}
                          </span>
                          <StatusBadge status={req.status} />
                          <span
                            className="text-[10px] sm:text-xs capitalize px-1.5 sm:px-2 py-0.5 rounded"
                            style={{ background: 'var(--muted)', color: 'var(--text-muted)' }}
                          >
                            {t(`compliance.gdprRequestTypes.${req.requestType}`)}
                          </span>
                        </div>
                        {req.details && (
                          <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                            {req.details}
                          </p>
                        )}
                        <div
                          className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-[10px] sm:text-xs"
                          style={{ color: 'var(--text-disabled)' }}
                        >
                          <span>
                            {t('compliance.requestedBy')}: {req.requestedByName}
                          </span>
                          <span>
                            {t('compliance.requestedAt')}:{' '}
                            {new Date(req.requestedAt).toLocaleDateString()}
                          </span>
                          {req.processedAt && (
                            <span>
                              {t('compliance.processedAt')}:{' '}
                              {new Date(req.processedAt).toLocaleDateString()}
                            </span>
                          )}
                          {req.completedAt && (
                            <span>
                              {t('compliance.completedAt')}:{' '}
                              {new Date(req.completedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {req.rejectionReason && (
                      <div
                        className="text-xs px-2 py-1 rounded"
                        style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--destructive)' }}
                      >
                        <AlertTriangle className="w-3 h-3 inline mr-1" />
                        {req.rejectionReason}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Consents */}
      {activeTab === 'consents' && (
        <div>
          {!consents?.length ? (
            <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>
              <ShieldCheck
                className="w-12 h-12 mx-auto mb-3"
                style={{ color: 'var(--text-disabled)' }}
              />
              {t('compliance.noConsents')}
            </div>
          ) : (
            <div className="space-y-2">
              {consents.map((consent) => (
                <div
                  key={consent._id}
                  className="rounded-lg p-4 flex items-center gap-4 border"
                  style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
                >
                  <div className="shrink-0">
                    {consent.granted && !consent.withdrawnAt ? (
                      <CheckCircle className="w-5 h-5" style={{ color: 'var(--success)' }} />
                    ) : (
                      <XCircle className="w-5 h-5" style={{ color: 'var(--destructive)' }} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="font-medium text-sm"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {consent.consentType}
                      </span>
                      <span
                        className="text-xs px-2 py-0.5 rounded"
                        style={{
                          background:
                            consent.granted && !consent.withdrawnAt
                              ? 'rgba(16,185,129,0.1)'
                              : 'rgba(239,68,68,0.1)',
                          color:
                            consent.granted && !consent.withdrawnAt
                              ? 'var(--success)'
                              : 'var(--destructive)',
                        }}
                      >
                        {consent.granted && !consent.withdrawnAt
                          ? t('compliance.granted')
                          : t('compliance.withdrawn')}
                      </span>
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {t('compliance.grantedAt')}: {new Date(consent.grantedAt).toLocaleString()}
                      {consent.withdrawnAt &&
                        ` | ${t('compliance.withdrawnAt')}: ${new Date(consent.withdrawnAt).toLocaleString()}`}
                    </div>
                  </div>
                  {consent.version && (
                    <span
                      className="text-xs px-2 py-1 rounded"
                      style={{ background: 'var(--muted)', color: 'var(--text-muted)' }}
                    >
                      v{consent.version}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Data Access Logs */}
      {activeTab === 'dataAccess' && (
        <div>
          {!filteredDataAccessLogs?.length ? (
            <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>
              <Lock className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--text-disabled)' }} />
              {t('compliance.noDataAccessLogs')}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredDataAccessLogs.map((log) => (
                <div
                  key={log._id}
                  className="rounded-lg p-4 flex items-center gap-4 border"
                  style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
                >
                  <AccessTypeBadge accessType={log.accessType} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className="font-medium text-sm"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {log.dataType}
                      </span>
                      {log.recordId && (
                        <span
                          className="text-xs font-mono px-1.5 py-0.5 rounded"
                          style={{ background: 'var(--muted)', color: 'var(--text-muted)' }}
                        >
                          {log.recordId}
                        </span>
                      )}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {t('compliance.accessedBy')}: {log.accessedByName} | {log.userName}
                    </div>
                    {log.reason && (
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-disabled)' }}>
                        {t('compliance.accessReason')}: {log.reason}
                      </div>
                    )}
                  </div>
                  <div className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {new Date(log.createdAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Policies */}
      {activeTab === 'policies' && (
        <div>
          {!policies?.length ? (
            <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>
              <ClipboardList
                className="w-12 h-12 mx-auto mb-3"
                style={{ color: 'var(--text-disabled)' }}
              />
              {t('compliance.noPolicies')}
            </div>
          ) : (
            <div className="space-y-2">
              {policies.map((policy) => (
                <div
                  key={policy._id}
                  className="rounded-lg p-4 border"
                  style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span
                          className="font-medium text-sm"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {policy.title}
                        </span>
                        <span
                          className="text-xs px-2 py-0.5 rounded"
                          style={{
                            background: policy.isActive ? 'rgba(16,185,129,0.1)' : 'var(--muted)',
                            color: policy.isActive ? 'var(--success)' : 'var(--text-muted)',
                          }}
                        >
                          {policy.isActive ? t('compliance.active') : t('compliance.inactive')}
                        </span>
                        <span
                          className="text-[10px] sm:text-xs capitalize px-1.5 sm:px-2 py-0.5 rounded"
                          style={{ background: 'var(--muted)', color: 'var(--text-muted)' }}
                        >
                          {t(`compliance.policyTypes.${policy.policyType}`)}
                        </span>
                      </div>
                      {policy.description && (
                        <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                          {policy.description}
                        </p>
                      )}
                      <div
                        className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] sm:text-xs"
                        style={{ color: 'var(--text-disabled)' }}
                      >
                        <span>
                          {t('compliance.policyVersion')}: {policy.version}
                        </span>
                        <span>
                          {t('compliance.effectiveFrom')}:{' '}
                          {new Date(policy.effectiveFrom).toLocaleDateString()}
                        </span>
                        <span>
                          {t('compliance.createdBy')}: {policy.createdByName}
                        </span>
                        <span>
                          {t('compliance.updatedBy')}: {policy.updatedByName}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
