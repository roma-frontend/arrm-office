'use client';

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useAuthStore } from '@/store/useAuthStore';
import { useTranslation } from 'react-i18next';
import { motion } from '@/lib/cssMotion';
import {
  Zap,
  Activity,
  FileText,
  CheckCircle,
  Clock,
  AlertTriangle,
  TrendingUp,
  Play,
  Pause,
} from 'lucide-react';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import WorkflowBuilderClient from '@/components/workflow/WorkflowBuilderClient';

interface AutomationStats {
  totalTasks: number;
  tasksTrend: number;
  completedTasks: number;
  completedTrend: number;
  pendingTasks: number;
  pendingTrend: number;
  failedTasks: number;
  failedTrend: number;
}

interface Workflow {
  _id: string;
  isActive: boolean;
  name: string;
  description: string;
}

interface Task {
  _id: string;
  status: string;
  name: string;
  createdAt: string | number | Date;
}

// cspell:disable
// Isolate Convex API refs to avoid infinite type instantiation
const getStatsApi = api.automation.getStats;
const getRecentTasksApi = api.automation.getRecentTasks;
const getActiveWorkflowsApi = api.automation.getActiveWorkflows;
// cspell:enable

export default function AutomationClient() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');

  // Fetch automation stats (hooks must always be called unconditionally)
  const stats = useQuery(getStatsApi) as AutomationStats | undefined;
  const recentTasks = useQuery(getRecentTasksApi, { limit: 50 }) as Task[] | undefined;
  const activeWorkflows = useQuery(getActiveWorkflowsApi) as Workflow[] | undefined;

  // Mutations
  const runAutomationAction = useAction(api.automationActions.runAutomation);
  const toggleWorkflow = useMutation(api.automationMutations.toggleWorkflow);

  const isSuperadmin = user?.role === 'superadmin';

  const handleRunAutomation = async () => {
    setIsRunning(true);
    try {
      await runAutomationAction();
      toast.success(t('automation.runSuccess') || 'Automation started successfully');
    } catch (_error) {
      toast.error(t('automation.runError') || 'Failed to run automation');
    } finally {
      setIsRunning(false);
    }
  };

  // Memoize denial UI to avoid conditional hook calls
  const denialUI = useMemo(
    () => (
      <div className="flex items-center justify-center h-full min-h-100">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-(--text-primary) mb-2">
            {t('common.accessDenied') || 'Access Denied'}
          </h2>
          <p className="text-(--text-muted)">
            {t('common.onlySuperadminAccess') || 'Only superadmin can access this page'}
          </p>
        </div>
      </div>
    ),
    [t],
  );

  if (!isSuperadmin) {
    return denialUI;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-(--text-primary)">
              {t('superadmin.automation.title') || 'Automation Dashboard'}
            </h1>
            <p className="text-sm text-(--text-muted) mt-1">
              {t('superadmin.automation.description') ||
                'Monitor and manage your automation workflows'}
            </p>
          </div>
          <Button
            onClick={handleRunAutomation}
            disabled={isRunning}
            className="flex items-center gap-2 w-full sm:w-auto justify-center btn-gradient text-white font-medium shadow-md hover:shadow-lg"
          >
            {isRunning ? <ShieldLoader size="xs" variant="inline" /> : <Play className="w-4 h-4" />}
            {isRunning
              ? t('automation.running') || 'Running...'
              : t('automation.runNow') || 'Run Now'}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="dashboard">{t('automation.dashboard') as any}</TabsTrigger>
          <TabsTrigger value="builder">{t('automation.builder.title') as any}</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-6 mt-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard
              title={t('automation.stats.totalTasks') || 'Total Tasks'}
              value={stats?.totalTasks ?? 0}
              icon={<Activity className="w-5 h-5" />}
              color="blue"
              trend={stats?.tasksTrend ?? 0}
            />
            <StatsCard
              title={t('automation.stats.completed') || 'Completed'}
              value={stats?.completedTasks ?? 0}
              icon={<CheckCircle className="w-5 h-5" />}
              color="green"
              trend={stats?.completedTrend ?? 0}
            />
            <StatsCard
              title={t('automation.stats.pending') || 'Pending'}
              value={stats?.pendingTasks ?? 0}
              icon={<Clock className="w-5 h-5" />}
              color="yellow"
              trend={stats?.pendingTrend ?? 0}
            />
            <StatsCard
              title={t('automation.stats.failed') || 'Failed'}
              value={stats?.failedTasks ?? 0}
              icon={<AlertTriangle className="w-5 h-5" />}
              color="red"
              trend={stats?.failedTrend ?? 0}
            />
          </div>

          {/* Active Workflows */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-yellow-500" />
                {t('automation.activeWorkflows') || 'Active Workflows'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activeWorkflows && activeWorkflows.length > 0 ? (
                <div className="space-y-3">
                  {activeWorkflows?.map((workflow: any) => (
                    <div
                      key={workflow._id}
                      className="flex items-center justify-between p-3 rounded-lg border border-(--border)"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            workflow.isActive ? 'bg-green-500' : 'bg-gray-400'
                          }`}
                        />
                        <div>
                          <p className="font-medium text-(--text-primary)">{workflow.name}</p>
                          <p className="text-xs text-(--text-muted)">{workflow.description}</p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleWorkflow({ workflowId: workflow._id })}
                      >
                        {workflow.isActive ? (
                          <Pause className="w-4 h-4" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-(--text-muted) text-center py-4">
                  {t('automation.noWorkflows') || 'No active workflows'}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Recent Tasks */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-500" />
                {t('automation.recentTasks') || 'Recent Tasks'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentTasks && recentTasks.length > 0 ? (
                <div className="space-y-2">
                  {recentTasks?.map((task: any) => (
                    <div
                      key={task._id}
                      className="flex items-center justify-between p-2 rounded hover:bg-(--background-subtle)"
                    >
                      <div className="flex items-center gap-3">
                        <StatusIcon status={task.status} />
                        <div>
                          <p className="text-sm font-medium text-(--text-primary)">{task.name}</p>
                          <p className="text-xs text-(--text-muted)">
                            {new Date(task.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant={
                          task.status === 'completed'
                            ? 'success'
                            : task.status === 'failed'
                              ? 'destructive'
                              : 'secondary'
                        }
                      >
                        {String(t(`automation.status.${task.status}`, task.status))}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-(--text-muted) text-center py-4">
                  {t('automation.noTasks') || 'No recent tasks'}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="builder" className="mt-6">
          <WorkflowBuilderClient />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}

function StatsCard({
  title,
  value,
  icon,
  color,
  trend,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  trend: number;
}) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-500/10 text-blue-600',
    green: 'bg-green-500/10 text-green-600',
    yellow: 'bg-yellow-500/10 text-yellow-600',
    red: 'bg-red-500/10 text-red-600',
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-(--text-muted)">{title}</p>
            <p className="text-2xl font-bold text-(--text-primary) mt-1">{value}</p>
            {trend !== 0 && (
              <div
                className={`flex items-center gap-1 mt-1 text-xs ${
                  trend > 0 ? 'text-green-600' : 'text-red-600'
                }`}
              >
                <TrendingUp className={`w-3 h-3 ${trend < 0 ? 'rotate-180' : ''}`} />
                {Math.abs(trend)}%
              </div>
            )}
          </div>
          <div className={`p-3 rounded-lg ${colorClasses[color]}`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    case 'failed':
      return <AlertTriangle className="w-4 h-4 text-red-500" />;
    default:
      return <Clock className="w-4 h-4 text-yellow-500" />;
  }
}
