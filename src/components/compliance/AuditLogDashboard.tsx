'use client';

import { useState, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useAuthStore } from '@/store/useAuthStore';
import { useTranslation } from 'react-i18next';
import {
  Search,
  Filter,
  Download,
  Eye,
  User,
  Shield,
  AlertTriangle,
  ChevronDown,
  Calendar,
  Activity,
  FileText,
  Bot,
  Settings,
  LogIn,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Doc } from '@/convex/_generated/dataModel';

// Derive category from action prefix
function deriveCategory(action: string): string {
  if (
    action.startsWith('user.') ||
    action.startsWith('auth.') ||
    action.startsWith('face_') ||
    action.startsWith('login') ||
    action.startsWith('totp') ||
    action.includes('webauthn')
  )
    return 'auth';
  if (
    action.startsWith('chat.') ||
    action.startsWith('message.') ||
    action.startsWith('leave.') ||
    action.startsWith('task.') ||
    action.startsWith('employee.') ||
    action.startsWith('payroll.') ||
    action.startsWith('driver.') ||
    action.startsWith('signature.') ||
    action.startsWith('goal.') ||
    action.startsWith('expense.')
  )
    return 'data';
  if (action.startsWith('admin.') || action.startsWith('org.') || action.startsWith('settings.'))
    return 'admin';
  if (action.startsWith('ai.') || action.startsWith('kpi.') || action.startsWith('policy.'))
    return 'ai';
  if (
    action.startsWith('security.') ||
    action.startsWith('rate_limit') ||
    action.startsWith('system.') ||
    action.startsWith('subscription.')
  )
    return 'system';
  return 'system';
}

// Derive severity from action keywords
function deriveSeverity(action: string, details?: string): 'info' | 'warning' | 'critical' {
  const lower = (action + ' ' + (details || '')).toLowerCase();
  if (
    lower.includes('failed') ||
    lower.includes('suspicious') ||
    lower.includes('blocked') ||
    lower.includes('exceeded') ||
    lower.includes('error') ||
    lower.includes('breach') ||
    lower.includes('attack')
  )
    return 'critical';
  if (
    lower.includes('warn') ||
    lower.includes('deleted') ||
    lower.includes('removed') ||
    lower.includes('rejected') ||
    lower.includes('denied') ||
    lower.includes('expired') ||
    lower.includes('limited')
  )
    return 'warning';
  return 'info';
}

const CATEGORIES = [
  { value: 'all', label: 'All Categories', icon: Activity },
  { value: 'auth', label: 'Authentication', icon: LogIn },
  { value: 'data', label: 'Data Changes', icon: FileText },
  { value: 'admin', label: 'Admin Actions', icon: Settings },
  { value: 'ai', label: 'AI Activity', icon: Bot },
  { value: 'system', label: 'System', icon: AlertTriangle },
];

const SEVERITY_COLORS: Record<string, string> = {
  info: 'text-blue-500 bg-blue-500/10',
  warning: 'text-amber-500 bg-amber-500/10',
  critical: 'text-red-500 bg-red-500/10',
};

const CATEGORY_ICONS: Record<string, typeof Shield> = {
  auth: LogIn,
  data: FileText,
  admin: Settings,
  ai: Bot,
  system: AlertTriangle,
};

function formatTimeAgo(creationTime: number): string {
  const diff = Date.now() - creationTime;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function AuditLogDashboard() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');

  // Fetch real audit logs from Convex — sorted newest-first
  const rawLogs: Doc<'auditLogs'>[] = useQuery(api.users.queries.getAuditLogs) ?? [];

  // Enrich logs with derived fields
  const enrichedLogs = useMemo(() => {
    return rawLogs.map((log) => ({
      ...log,
      _id: log._id,
      category: deriveCategory(log.action),
      severity: deriveSeverity(log.action, log.details),
    }));
  }, [rawLogs]);

  const filteredLogs = useMemo(() => {
    return enrichedLogs.filter((log) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesSearch =
          log.action.toLowerCase().includes(q) ||
          String(log.userId).toLowerCase().includes(q) ||
          (log.details || '').toLowerCase().includes(q) ||
          (log.ip || '').toLowerCase().includes(q) ||
          (log.target || '').toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }
      if (categoryFilter !== 'all' && log.category !== categoryFilter) return false;
      if (severityFilter !== 'all' && log.severity !== severityFilter) return false;
      return true;
    });
  }, [enrichedLogs, searchQuery, categoryFilter, severityFilter]);

  const criticalCount = enrichedLogs.filter((l) => l.severity === 'critical').length;
  const warningCount = enrichedLogs.filter((l) => l.severity === 'warning').length;
  const uniqueUsers = new Set(enrichedLogs.map((l) => l.userId)).size;

  const stats = [
    {
      label: t('auditLog.totalEvents', 'Total Events'),
      value: String(enrichedLogs.length),
      icon: Activity,
      color: '#3b82f6',
    },
    {
      label: t('auditLog.criticalEvents', 'Critical'),
      value: String(criticalCount),
      icon: AlertTriangle,
      color: '#ef4444',
    },
    {
      label: t('auditLog.warnings', 'Warnings'),
      value: String(warningCount),
      icon: AlertTriangle,
      color: '#f59e0b',
    },
    {
      label: t('auditLog.uniqueUsers', 'Active Users'),
      value: String(uniqueUsers),
      icon: User,
      color: '#10b981',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <Eye className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-(--text-primary)">
              {t('auditLog.title', 'Audit Trail')}
            </h2>
            <p className="text-sm text-(--text-muted)">
              {t('auditLog.subtitle', 'Comprehensive activity log for security and compliance')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            {t('auditLog.dateRange', 'Last 24 hours')}
            <ChevronDown className="w-3 h-3" />
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Download className="w-3.5 h-3.5" />
            {t('common.exportCSV', 'Export')}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="p-4 border border-(--border) bg-(--card)">
              <div className="flex items-center justify-between mb-2">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${stat.color}15` }}
                >
                  <Icon className="w-4 h-4" style={{ color: stat.color }} />
                </div>
              </div>
              <div className="text-2xl font-bold text-(--text-primary)">{stat.value}</div>
              <div className="text-xs text-(--text-muted) mt-0.5">{stat.label}</div>
            </Card>
          );
        })}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('auditLog.searchPlaceholder', 'Search events, users, actions...')}
            className="pl-9"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="pl-9 pr-8 h-10 rounded-lg text-sm bg-(--card) border border-(--border) text-(--text-primary) appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>
        <div className="relative">
          <AlertTriangle className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="pl-9 pr-8 h-10 rounded-lg text-sm bg-(--card) border border-(--border) text-(--text-primary) appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            <option value="all">{t('auditLog.allSeverities', 'All Severities')}</option>
            <option value="info">{t('auditLog.info', 'Info')}</option>
            <option value="warning">{t('auditLog.warning', 'Warning')}</option>
            <option value="critical">{t('auditLog.critical', 'Critical')}</option>
          </select>
        </div>
      </div>

      {/* Timeline */}
      <Card className="border border-(--border) bg-(--card) overflow-hidden">
        <div className="divide-y divide-(--border)/50">
          {filteredLogs.length === 0 ? (
            <div className="p-12 text-center">
              <Eye className="w-12 h-12 mx-auto mb-3 text-(--text-muted)" />
              <p className="text-(--text-muted) text-sm">
                {t('auditLog.noResults', 'No audit events match your filter criteria')}
              </p>
            </div>
          ) : (
            filteredLogs.map((log) => {
              const CatIcon = CATEGORY_ICONS[log.category] || Shield;
              return (
                <div
                  key={log._id}
                  className="flex items-start gap-4 p-4 hover:bg-(--background-subtle) transition-colors group"
                >
                  {/* Timeline dot + line */}
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <div
                      className={`w-2.5 h-2.5 rounded-full ring-4 ${
                        log.severity === 'critical'
                          ? 'bg-red-500 ring-red-500/20'
                          : log.severity === 'warning'
                            ? 'bg-amber-500 ring-amber-500/20'
                            : 'bg-blue-500 ring-blue-500/20'
                      }`}
                    />
                    <div className="w-px flex-1 bg-(--border)/30 min-h-[24px]" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-(--text-primary)">
                            {log.action.replace(/\./g, ' · ')}
                          </span>
                          <Badge
                            className={`text-[10px] px-1.5 py-0.5 ${SEVERITY_COLORS[log.severity]}`}
                          >
                            {log.severity}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 gap-1">
                            <CatIcon className="w-2.5 h-2.5" />
                            {log.category}
                          </Badge>
                        </div>
                        <p className="text-sm text-(--text-secondary) mt-0.5">
                          {log.details || log.action}
                        </p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-(--text-muted)">
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {String(log.userId).slice(0, 12)}...
                          </span>
                          {log.ip && <span className="font-mono">{log.ip}</span>}
                          {log.target && <span className="text-blue-500">{log.target}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-(--text-muted) whitespace-nowrap">
                          {formatTimeAgo(log._creationTime)}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      {/* Legend */}
      <div className="flex items-center gap-6 text-xs text-(--text-muted) px-2">
        <span className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-blue-500 ring-2 ring-blue-500/20" />
          {t('auditLog.info', 'Info')}
        </span>
        <span className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-amber-500 ring-2 ring-amber-500/20" />
          {t('auditLog.warning', 'Warning')}
        </span>
        <span className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500 ring-2 ring-red-500/20" />
          {t('auditLog.critical', 'Critical')}
        </span>
      </div>
    </div>
  );
}
