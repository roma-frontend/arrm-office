'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useAuthStore } from '@/store/useAuthStore';
import type { Id } from '@/convex/_generated/dataModel';
import { formatRelativeTime } from '@/lib/date-format';
import {
  Shield,
  ShieldCheck,
  Activity,
  Eye,
  Clock,
  XCircle,
  Bot,
  Filter,
  Lock,
  Sliders,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';

type TabId = 'overview' | 'agents' | 'guardrails' | 'audit' | 'policies';
type AgentId = 'general' | 'recruitment' | 'policy' | 'analytics' | 'kpi';

const TABS: { id: TabId; labelKey: string; icon: typeof Shield }[] = [
  { id: 'overview', labelKey: 'aiGovernance.overview', icon: Activity },
  { id: 'agents', labelKey: 'aiGovernance.agents', icon: Bot },
  { id: 'guardrails', labelKey: 'aiGovernance.guardrails', icon: Shield },
  { id: 'audit', labelKey: 'aiGovernance.audit', icon: Eye },
  { id: 'policies', labelKey: 'aiGovernance.policies', icon: Lock },
];

/** Static agent catalog (config, not telemetry) — usage/status come from real data. */
const AGENT_CATALOG: { id: AgentId; icon: string; nameKey: string; descKey: string }[] = [
  {
    id: 'general',
    icon: '🤖',
    nameKey: 'aiGovernance.agentGeneral',
    descKey: 'aiGovernance.generalAgentDesc',
  },
  {
    id: 'recruitment',
    icon: '📋',
    nameKey: 'aiGovernance.agentRecruitment',
    descKey: 'aiGovernance.recruitmentAgentDesc',
  },
  {
    id: 'policy',
    icon: '📜',
    nameKey: 'aiGovernance.agentPolicy',
    descKey: 'aiGovernance.policyAgentDesc',
  },
  {
    id: 'analytics',
    icon: '📊',
    nameKey: 'aiGovernance.agentAnalytics',
    descKey: 'aiGovernance.analyticsAgentDesc',
  },
  { id: 'kpi', icon: '🎯', nameKey: 'aiGovernance.agentKpi', descKey: 'aiGovernance.kpiAgentDesc' },
];

const GUARDRAIL_KEYS = [
  'inputFiltering',
  'outputFiltering',
  'piiDetection',
  'rateLimiting',
  'humanApprovalRequired',
] as const;

export default function AIGovernancePanel() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [auditFilter, setAuditFilter] = useState<AgentId | 'all'>('all');

  const organizationId = user?.organizationId as Id<'organizations'> | undefined;
  const userId = user?.id as Id<'users'> | undefined;
  const queryArgs = organizationId && userId ? { organizationId, userId } : 'skip';

  // ── Real data ──
  const stats = useQuery(api.aiGovernance.getStats, queryArgs);
  const recentActivity = useQuery(api.aiGovernance.getRecentActivity, queryArgs);
  const agentHealth = useQuery(api.aiGovernance.getAgentHealth, queryArgs);
  const auditLog = useQuery(
    api.aiGovernance.getAuditLog,
    organizationId && userId
      ? { organizationId, userId, agent: auditFilter === 'all' ? undefined : auditFilter }
      : 'skip',
  );
  const guardrails = useQuery(api.aiGovernance.getGuardrails, queryArgs);
  const updateGuardrail = useMutation(api.aiGovernance.updateGuardrail);

  const agentLabel = (id: string): string => {
    const entry = AGENT_CATALOG.find((a) => a.id === id);
    return entry ? t(entry.nameKey) : id;
  };

  const statCards = [
    {
      id: 'totalRequests',
      label: t('aiGovernance.totalRequests', 'Total AI Requests'),
      value: stats ? stats.total.toLocaleString() : '—',
      icon: Activity,
      color: '#3b82f6',
    },
    {
      id: 'blockedRequests',
      label: t('aiGovernance.blockedRequests', 'Blocked Requests'),
      value: stats ? stats.blocked.toLocaleString() : '—',
      icon: XCircle,
      color: '#ef4444',
    },
    {
      id: 'activeAgents',
      label: t('aiGovernance.activeAgents', 'Active Agents'),
      value: stats ? String(stats.activeAgents) : '—',
      icon: Bot,
      color: '#10b981',
    },
    {
      id: 'avgResponseTime',
      label: t('aiGovernance.avgResponseTime', 'Avg Response'),
      value: stats ? `${(stats.avgLatencyMs / 1000).toFixed(1)}s` : '—',
      icon: Clock,
      color: '#f59e0b',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.id} className="p-4 border border-(--border) bg-(--card)">
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

      {/* Tabs */}
      <div className="flex gap-1 border-b border-(--border) overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'text-blue-500 border-blue-500'
                  : 'text-(--text-muted) border-transparent hover:text-(--text-primary)'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t(tab.labelKey, tab.labelKey.replace('.', ' » '))}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent activity */}
          <Card className="p-5 border border-(--border) bg-(--card)">
            <h3 className="font-semibold text-(--text-primary) mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-500" />
              {t('aiGovernance.recentActivity', 'Recent Activity')}
            </h3>
            <div className="space-y-3">
              {recentActivity === undefined ? (
                <p className="text-sm text-(--text-muted) py-4">
                  {t('common.loading', 'Loading…')}
                </p>
              ) : recentActivity.length === 0 ? (
                <p className="text-sm text-(--text-muted) py-4">
                  {t('aiGovernance.noActivity', 'No AI activity yet')}
                </p>
              ) : (
                recentActivity.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between py-2 border-b border-(--border)/50 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-2 h-2 rounded-full ${item.status === 'blocked' ? 'bg-red-500' : 'bg-emerald-500'}`}
                      />
                      <div>
                        <p className="text-sm font-medium text-(--text-primary)">
                          {agentLabel(item.agent)} · {item.action}
                        </p>
                        <p className="text-xs text-(--text-muted)">
                          {item.user} · {formatRelativeTime(item.createdAt, i18n.language)}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={item.status === 'blocked' ? 'destructive' : 'default'}
                      className="text-xs"
                    >
                      {item.status === 'blocked'
                        ? t('aiGovernance.statusBlocked', 'blocked')
                        : t('aiGovernance.statusAllowed', 'allowed')}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Agent health */}
          <Card className="p-5 border border-(--border) bg-(--card)">
            <h3 className="font-semibold text-(--text-primary) mb-4 flex items-center gap-2">
              <Bot className="w-4 h-4 text-emerald-500" />
              {t('aiGovernance.agentHealth', 'Agent Health')}
            </h3>
            <div className="space-y-3">
              {agentHealth === undefined ? (
                <p className="text-sm text-(--text-muted) py-4">
                  {t('common.loading', 'Loading…')}
                </p>
              ) : agentHealth.length === 0 ? (
                <p className="text-sm text-(--text-muted) py-4">
                  {t('aiGovernance.noAgentData', 'No agent traffic yet')}
                </p>
              ) : (
                agentHealth.map((agent) => (
                  <div
                    key={agent.agent}
                    className="flex items-center justify-between py-2 border-b border-(--border)/50 last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-2 h-2 rounded-full ${agent.status === 'degraded' ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      />
                      <span className="text-sm text-(--text-primary)">
                        {agentLabel(agent.agent)}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-(--text-muted)">
                      <span>{agent.uptime}%</span>
                      <span>
                        {agent.requests} {t('aiGovernance.reqUnit', 'req')}
                      </span>
                      <Badge
                        variant={agent.status === 'degraded' ? 'warning' : 'default'}
                        className="text-[10px] px-1.5"
                      >
                        {agent.status === 'degraded'
                          ? t('aiGovernance.statusDegraded', 'degraded')
                          : t('aiGovernance.statusHealthy', 'healthy')}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'guardrails' && (
        <Card className="p-5 border border-(--border) bg-(--card)">
          <h3 className="font-semibold text-(--text-primary) mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-500" />
            {t('aiGovernance.guardrailSettings', 'Guardrail Settings')}
          </h3>
          <div className="space-y-4">
            {GUARDRAIL_KEYS.map((key) => {
              const label = t(`aiGovernance.${key}`);
              const desc = t(`aiGovernance.${key}Desc`);
              const enabled = guardrails?.[key] ?? false;
              return (
                <div
                  key={key}
                  className="flex items-center justify-between p-4 rounded-lg bg-(--background-subtle) border border-(--border)"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-(--text-primary)">{label}</p>
                      {enabled && (
                        <Badge
                          variant="default"
                          className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                        >
                          {t('common.active', 'Active')}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-(--text-muted) mt-0.5">{desc}</p>
                  </div>
                  <Switch
                    checked={enabled}
                    disabled={guardrails === undefined || !organizationId || !userId}
                    onCheckedChange={(checked) => {
                      if (!organizationId || !userId) return;
                      void updateGuardrail({ organizationId, userId, key, enabled: checked });
                    }}
                  />
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {activeTab === 'agents' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {AGENT_CATALOG.map((agent) => {
            const health = agentHealth?.find((h) => h.agent === agent.id);
            const totalReq = agentHealth?.reduce((s, h) => s + h.requests, 0) ?? 0;
            const usage =
              health && totalReq > 0 ? `${Math.round((health.requests / totalReq) * 100)}%` : '0%';
            const status = health?.status ?? 'idle';
            return (
              <Card
                key={agent.id}
                className="p-4 border border-(--border) bg-(--card) hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="text-2xl">{agent.icon}</span>
                  <Badge
                    variant={status === 'degraded' ? 'warning' : 'default'}
                    className="text-[10px]"
                  >
                    {status === 'degraded'
                      ? t('aiGovernance.statusDegraded', 'degraded')
                      : status === 'idle'
                        ? t('aiGovernance.statusIdle', 'idle')
                        : t('aiGovernance.statusActive', 'active')}
                  </Badge>
                </div>
                <h4 className="font-semibold text-sm text-(--text-primary) mb-1">
                  {t(agent.nameKey)}
                </h4>
                <p className="text-xs text-(--text-muted) mb-3">{t(agent.descKey)}</p>
                <div className="flex items-center justify-between text-xs text-(--text-muted)">
                  <span>
                    {t('aiGovernance.usage', 'Usage')}: {usage}
                  </span>
                  <Button variant="ghost" size="sm" className="h-7 text-xs">
                    {t('common.details', 'Details')}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {activeTab === 'audit' && (
        <Card className="p-5 border border-(--border) bg-(--card)">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-(--text-primary) flex items-center gap-2">
              <Eye className="w-4 h-4 text-blue-500" />
              {t('aiGovernance.auditLog', 'AI Audit Log')}
            </h3>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-(--text-muted)" />
                <select
                  value={auditFilter}
                  onChange={(e) => setAuditFilter(e.target.value as AgentId | 'all')}
                  className="pl-8 pr-3 py-1.5 rounded-lg text-xs bg-(--background) border border-(--border) text-(--text-primary) appearance-none cursor-pointer"
                >
                  <option value="all">{t('aiGovernance.allAgents', 'All Agents')}</option>
                  {AGENT_CATALOG.map((a) => (
                    <option key={a.id} value={a.id}>
                      {t(a.nameKey)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            {auditLog === undefined ? (
              <p className="text-sm text-(--text-muted) py-4">{t('common.loading', 'Loading…')}</p>
            ) : auditLog.length === 0 ? (
              <p className="text-sm text-(--text-muted) py-4">
                {t('aiGovernance.noAuditEntries', 'No audit entries yet')}
              </p>
            ) : (
              auditLog.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-(--background-subtle) transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-[10px] font-mono w-24 justify-center">
                      {agentLabel(entry.agent)}
                    </Badge>
                    <div>
                      <p className="text-sm text-(--text-primary)">{entry.action}</p>
                      <p className="text-xs text-(--text-muted)">{entry.user}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-(--text-muted)">
                    <span>{formatRelativeTime(entry.createdAt, i18n.language)}</span>
                    <span>
                      {entry.tokens} {t('aiGovernance.tokUnit', 'tok')}
                    </span>
                    <span>{entry.latencyMs} ms</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      {activeTab === 'policies' && (
        <Card className="p-5 border border-(--border) bg-(--card)">
          <h3 className="font-semibold text-(--text-primary) mb-4 flex items-center gap-2">
            <Lock className="w-4 h-4 text-blue-500" />
            {t('aiGovernance.governancePolicies', 'Governance Policies')}
          </h3>
          <div className="space-y-3">
            {[
              {
                title: t('aiGovernance.policy1Title', 'Data Privacy Policy'),
                status: 'enforced',
                desc: t(
                  'aiGovernance.policy1Desc',
                  'AI agents must not access or expose personal data without authorization',
                ),
              },
              {
                title: t('aiGovernance.policy2Title', 'Scope Limitation'),
                status: 'enforced',
                desc: t(
                  'aiGovernance.policy2Desc',
                  'Agents are restricted to their domain and may not cross boundaries',
                ),
              },
              {
                title: t('aiGovernance.policy3Title', 'Human Approval Required'),
                status: 'draft',
                desc: t(
                  'aiGovernance.policy3Desc',
                  'Modifications to employee records, payroll, or approvals require human-in-the-loop',
                ),
              },
              {
                title: t('aiGovernance.policy4Title', 'Audit Trail Requirement'),
                status: 'enforced',
                desc: t(
                  'aiGovernance.policy4Desc',
                  'Every AI interaction must be logged with full context for compliance reviews',
                ),
              },
            ].map((policy) => (
              <div
                key={policy.title}
                className="flex items-center justify-between p-4 rounded-lg bg-(--background-subtle) border border-(--border)"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-(--text-primary)">{policy.title}</p>
                    <Badge
                      variant={policy.status === 'enforced' ? 'default' : 'warning'}
                      className="text-[10px]"
                    >
                      {policy.status === 'enforced'
                        ? t('aiGovernance.statusEnforced', 'enforced')
                        : t('aiGovernance.statusDraft', 'draft')}
                    </Badge>
                  </div>
                  <p className="text-xs text-(--text-muted) mt-0.5">{policy.desc}</p>
                </div>
                <Sliders className="w-4 h-4 text-(--text-muted) cursor-pointer hover:text-(--text-primary) transition-colors" />
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
