'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useAuthStore } from '@/store/useAuthStore';
import type { Id } from '@/convex/_generated/dataModel';
import {
  Shield,
  ShieldCheck,
  AlertTriangle,
  Activity,
  Eye,
  Clock,
  CheckCircle,
  XCircle,
  Bot,
  User,
  Filter,
  Lock,
  Sliders,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';

type TabId = 'overview' | 'agents' | 'guardrails' | 'audit' | 'policies';

const TABS: { id: TabId; labelKey: string; icon: typeof Shield }[] = [
  { id: 'overview', labelKey: 'aiGovernance.overview', icon: Activity },
  { id: 'agents', labelKey: 'aiGovernance.agents', icon: Bot },
  { id: 'guardrails', labelKey: 'aiGovernance.guardrails', icon: Shield },
  { id: 'audit', labelKey: 'aiGovernance.audit', icon: Eye },
  { id: 'policies', labelKey: 'aiGovernance.policies', icon: Lock },
];

export default function AIGovernancePanel() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [guardrails, setGuardrails] = useState({
    inputFiltering: true,
    outputFiltering: true,
    piiDetection: true,
    rateLimiting: true,
    humanApprovalRequired: false,
    maxTokensPerSession: 50000,
    allowedDomains: ['hr', 'policy', 'payroll', 'recruitment'],
  });

  // ── Stats overview ──
  const stats = [
    {
      label: t('aiGovernance.totalRequests', 'Total AI Requests'),
      value: '1,247',
      icon: Activity,
      color: '#3b82f6',
    },
    {
      label: t('aiGovernance.blockedRequests', 'Blocked Requests'),
      value: '23',
      icon: XCircle,
      color: '#ef4444',
    },
    {
      label: t('aiGovernance.activeAgents', 'Active Agents'),
      value: '6',
      icon: Bot,
      color: '#10b981',
    },
    {
      label: t('aiGovernance.avgResponseTime', 'Avg Response'),
      value: '1.2s',
      icon: Clock,
      color: '#f59e0b',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <ShieldCheck className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-(--text-primary)">
              {t('aiGovernance.title', 'AI Governance')}
            </h2>
            <p className="text-sm text-(--text-muted)">
              {t('aiGovernance.subtitle', 'Monitor, control, and audit AI agent activity')}
            </p>
          </div>
        </div>
        <Badge variant="outline" className="gap-1.5 px-3 py-1.5">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          {t('aiGovernance.allSystemsOperational', 'All systems operational')}
        </Badge>
      </div>

      {/* Stats cards */}
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
              {[
                {
                  action: t('aiGovernance.activityKpiQueried', 'KPI Agent queried'),
                  user: 'Anna S.',
                  minutes: 2,
                  status: 'allowed',
                },
                {
                  action: t(
                    'aiGovernance.activityRecruitmentAccessed',
                    'Recruitment Agent accessed',
                  ),
                  user: 'Michael R.',
                  minutes: 5,
                  status: 'allowed',
                },
                {
                  action: t('aiGovernance.activityPolicyBlocked', 'Policy Agent blocked'),
                  user: t('aiGovernance.systemUser', 'System'),
                  minutes: 12,
                  status: 'blocked',
                },
                {
                  action: t('aiGovernance.activityPayrollQueried', 'Payroll Agent queried'),
                  user: 'David K.',
                  minutes: 18,
                  status: 'allowed',
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-2 border-b border-(--border)/50 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-2 h-2 rounded-full ${item.status === 'blocked' ? 'bg-red-500' : 'bg-emerald-500'}`}
                    />
                    <div>
                      <p className="text-sm font-medium text-(--text-primary)">{item.action}</p>
                      <p className="text-xs text-(--text-muted)">
                        {item.user} ·{' '}
                        {t('aiGovernance.minutesAgo', '{{count}} min ago', { count: item.minutes })}
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
              ))}
            </div>
          </Card>

          {/* Agent health */}
          <Card className="p-5 border border-(--border) bg-(--card)">
            <h3 className="font-semibold text-(--text-primary) mb-4 flex items-center gap-2">
              <Bot className="w-4 h-4 text-emerald-500" />
              {t('aiGovernance.agentHealth', 'Agent Health')}
            </h3>
            <div className="space-y-3">
              {[
                {
                  name: t('aiGovernance.agentGeneral', 'General Assistant'),
                  status: 'healthy',
                  uptime: '99.9%',
                  requests: 523,
                },
                {
                  name: t('aiGovernance.agentRecruitment', 'Recruitment Agent'),
                  status: 'healthy',
                  uptime: '99.8%',
                  requests: 312,
                },
                {
                  name: t('aiGovernance.agentPolicy', 'Policy Agent'),
                  status: 'healthy',
                  uptime: '99.7%',
                  requests: 189,
                },
                {
                  name: t('aiGovernance.agentKpi', 'KPI Agent'),
                  status: 'degraded',
                  uptime: '98.2%',
                  requests: 98,
                },
                {
                  name: t('aiGovernance.agentPayroll', 'Payroll Agent'),
                  status: 'healthy',
                  uptime: '99.9%',
                  requests: 76,
                },
                {
                  name: t('aiGovernance.agentCompensation', 'Compensation Agent'),
                  status: 'healthy',
                  uptime: '99.9%',
                  requests: 49,
                },
              ].map((agent, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-2 border-b border-(--border)/50 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${agent.status === 'degraded' ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    />
                    <span className="text-sm text-(--text-primary)">{agent.name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-(--text-muted)">
                    <span>{agent.uptime}</span>
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
              ))}
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
            {[
              {
                key: 'inputFiltering',
                label: t('aiGovernance.inputFiltering', 'Input Content Filtering'),
                desc: t(
                  'aiGovernance.inputFilteringDesc',
                  'Filter harmful, offensive, or out-of-scope inputs before they reach AI models',
                ),
              },
              {
                key: 'outputFiltering',
                label: t('aiGovernance.outputFiltering', 'Output Content Filtering'),
                desc: t(
                  'aiGovernance.outputFilteringDesc',
                  'Scan AI responses for sensitive data, hallucinations, or policy violations',
                ),
              },
              {
                key: 'piiDetection',
                label: t('aiGovernance.piiDetection', 'PII Detection & Masking'),
                desc: t(
                  'aiGovernance.piiDetectionDesc',
                  'Automatically detect and mask personally identifiable information in AI conversations',
                ),
              },
              {
                key: 'rateLimiting',
                label: t('aiGovernance.rateLimiting', 'Rate Limiting'),
                desc: t(
                  'aiGovernance.rateLimitingDesc',
                  'Prevent abuse by limiting requests per user per time window',
                ),
              },
              {
                key: 'humanApprovalRequired',
                label: t('aiGovernance.humanApproval', 'Human-in-the-Loop'),
                desc: t(
                  'aiGovernance.humanApprovalDesc',
                  'Require human approval for AI actions that modify data, create records, or affect payroll',
                ),
              },
            ].map(({ key, label, desc }) => (
              <div
                key={key}
                className="flex items-center justify-between p-4 rounded-lg bg-(--background-subtle) border border-(--border)"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-(--text-primary)">{label}</p>
                    {guardrails[key as keyof typeof guardrails] && (
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
                  checked={guardrails[key as keyof typeof guardrails] as boolean}
                  onCheckedChange={(checked) =>
                    setGuardrails((prev) => ({ ...prev, [key]: checked }))
                  }
                />
              </div>
            ))}
          </div>
        </Card>
      )}

      {activeTab === 'agents' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            {
              id: 'general',
              name: t('aiGovernance.agentGeneral', 'General Assistant'),
              icon: '🤖',
              status: 'active',
              usage: '45%',
              desc: t(
                'aiGovernance.generalAgentDesc',
                'Multi-purpose HR assistant for common queries',
              ),
            },
            {
              id: 'recruitment',
              name: t('aiGovernance.agentRecruitment', 'Recruitment Agent'),
              icon: '📋',
              status: 'active',
              usage: '25%',
              desc: t(
                'aiGovernance.recruitmentAgentDesc',
                'Screening, interviewing, and candidate management',
              ),
            },
            {
              id: 'policy',
              name: t('aiGovernance.agentPolicy', 'Policy Agent'),
              icon: '📜',
              status: 'active',
              usage: '12%',
              desc: t(
                'aiGovernance.policyAgentDesc',
                'Company policy explanations and compliance checks',
              ),
            },
            {
              id: 'kpi',
              name: t('aiGovernance.agentKpi', 'KPI Agent'),
              icon: '📊',
              status: 'degraded',
              usage: '8%',
              desc: t(
                'aiGovernance.kpiAgentDesc',
                'OKR tracking, KPI analysis, and performance insights',
              ),
            },
            {
              id: 'payroll',
              name: t('aiGovernance.agentPayroll', 'Payroll Agent'),
              icon: '💰',
              status: 'active',
              usage: '6%',
              desc: t(
                'aiGovernance.payrollAgentDesc',
                'Payroll calculations, tax info, and salary queries',
              ),
            },
            {
              id: 'compensation',
              name: t('aiGovernance.agentCompensation', 'Compensation Agent'),
              icon: '🏆',
              status: 'active',
              usage: '4%',
              desc: t(
                'aiGovernance.compAgentDesc',
                'Compensation bands, bonuses, and benefits info',
              ),
            },
          ].map((agent) => (
            <Card
              key={agent.id}
              className="p-4 border border-(--border) bg-(--card) hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-2xl">{agent.icon}</span>
                <Badge
                  variant={agent.status === 'degraded' ? 'warning' : 'default'}
                  className="text-[10px]"
                >
                  {agent.status === 'degraded'
                    ? t('aiGovernance.statusDegraded', 'degraded')
                    : t('aiGovernance.statusActive', 'active')}
                </Badge>
              </div>
              <h4 className="font-semibold text-sm text-(--text-primary) mb-1">{agent.name}</h4>
              <p className="text-xs text-(--text-muted) mb-3">{agent.desc}</p>
              <div className="flex items-center justify-between text-xs text-(--text-muted)">
                <span>
                  {t('aiGovernance.usage', 'Usage')}: {agent.usage}
                </span>
                <Button variant="ghost" size="sm" className="h-7 text-xs">
                  {t('common.details', 'Details')}
                </Button>
              </div>
            </Card>
          ))}
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
                <select className="pl-8 pr-3 py-1.5 rounded-lg text-xs bg-(--background) border border-(--border) text-(--text-primary) appearance-none cursor-pointer">
                  <option>{t('aiGovernance.allAgents', 'All Agents')}</option>
                  <option>{t('aiGovernance.filterGeneral', 'General')}</option>
                  <option>{t('aiGovernance.filterRecruitment', 'Recruitment')}</option>
                  <option>{t('aiGovernance.filterPolicy', 'Policy')}</option>
                  <option>{t('aiGovernance.filterKpi', 'KPI')}</option>
                </select>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            {[
              {
                agent: t('aiGovernance.agentKpi', 'KPI Agent'),
                action: t('aiGovernance.actionAnalyticsQuery', 'Analytics query'),
                user: 'Anna S.',
                minutes: 2,
                tokens: 340,
                cost: '$0.006',
              },
              {
                agent: t('aiGovernance.filterRecruitment', 'Recruitment'),
                action: t('aiGovernance.actionCandidatesSearch', 'Candidate search'),
                user: 'Michael R.',
                minutes: 5,
                tokens: 890,
                cost: '$0.018',
              },
              {
                agent: t('aiGovernance.agentPolicy', 'Policy Agent'),
                action: t('aiGovernance.actionPolicyLookup', 'Policy lookup'),
                user: 'Lilit A.',
                minutes: 8,
                tokens: 210,
                cost: '$0.004',
              },
              {
                agent: t('aiGovernance.filterGeneral', 'General'),
                action: t('aiGovernance.actionGeneralQa', 'General Q&A'),
                user: 'David K.',
                minutes: 11,
                tokens: 150,
                cost: '$0.003',
              },
              {
                agent: t('aiGovernance.agentPayroll', 'Payroll Agent'),
                action: t('aiGovernance.actionPayrollCalc', 'Payroll calculation'),
                user: 'Mariam G.',
                minutes: 15,
                tokens: 670,
                cost: '$0.013',
              },
            ].map((entry, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-(--background-subtle) transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-[10px] font-mono w-20 justify-center">
                    {entry.agent}
                  </Badge>
                  <div>
                    <p className="text-sm text-(--text-primary)">{entry.action}</p>
                    <p className="text-xs text-(--text-muted)">{entry.user}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-(--text-muted)">
                  <span>
                    {t('aiGovernance.minutesAgo', '{{count}} min ago', { count: entry.minutes })}
                  </span>
                  <span>
                    {entry.tokens} {t('aiGovernance.tokUnit', 'tok')}
                  </span>
                  <span>{entry.cost}</span>
                </div>
              </div>
            ))}
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
