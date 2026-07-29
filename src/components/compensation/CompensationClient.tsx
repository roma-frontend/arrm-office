'use client';

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/components/ThemeProvider';
import { motion } from '@/lib/cssMotion';
import {
  DollarSign,
  TrendingUp,
  Users,
  AlertCircle,
  CheckCircle,
  Clock,
  Plus,
  Filter,
  Search,
  BarChart3,
  Award,
  Calendar,
} from 'lucide-react';
import { useQuery } from 'convex/react';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { useAuthStore } from '@/store/useAuthStore';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from '@/lib/dynamic-imports';
import { Id } from '@/convex/_generated/dataModel';
import { api } from '@/convex/_generated/api';
import CompensationRecordWizard from './CompensationRecordWizard';
import CompensationBandWizard from './CompensationBandWizard';
import BonusProgramWizard from './BonusProgramWizard';
import ReviewCycleWizard from './ReviewCycleWizard';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

function formatCurrency(amount: number, currency = 'AMD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function getStatusBadge(status: string, t: (key: string) => string) {
  const variants: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
    active: 'success',
    approved: 'success',
    completed: 'success',
    pending_approval: 'warning',
    draft: 'secondary',
    rejected: 'destructive',
    cancelled: 'destructive',
    expired: 'destructive',
    under_review: 'warning',
    submitted: 'warning',
  };

  return (
    <Badge variant={variants[status] || 'secondary'} className="capitalize">
      {t(`compensation.${status}`) || status}
    </Badge>
  );
}

function getTypeBadge(type: string, t: (key: string) => string) {
  const variants: Record<string, 'success' | 'warning' | 'destructive' | 'secondary' | 'info'> = {
    base: 'success',
    bonus: 'warning',
    raise: 'info',
    adjustment: 'secondary',
    allowance: 'warning',
  };

  return (
    <Badge variant={variants[type] || 'secondary'} className="capitalize">
      {t(`compensation.${type}`) || type}
    </Badge>
  );
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function CompensationClient() {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const tooltipBg = isDark ? '#0f172a' : '#ffffff';
  const tooltipBorder = isDark ? 'rgba(148, 163, 184, 0.3)' : 'rgba(0, 0, 0, 0.1)';
  const tooltipColor = isDark ? '#ffffff' : '#0f172a';
  const tooltipShadow = isDark ? '0 4px 12px rgba(0, 0, 0, 0.5)' : '0 4px 12px rgba(0, 0, 0, 0.1)';
  const textColor = isDark ? '#ffffff' : '#0f172a';

  const selectedOrgId = useSelectedOrganization();
  const { user } = useAuthStore();
  const orgId = (selectedOrgId ?? user?.organizationId ?? undefined) as
    | Id<'organizations'>
    | undefined;

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'records' | 'bands' | 'bonuses' | 'cycles'>('records');

  // Wizard states
  const [showRecordWizard, setShowRecordWizard] = useState(false);
  const [showBandWizard, setShowBandWizard] = useState(false);
  const [showBonusWizard, setShowBonusWizard] = useState(false);
  const [showCycleWizard, setShowCycleWizard] = useState(false);

  const _useQuery = useQuery as unknown as (...args: any[]) => any;

  const compensationRecords = _useQuery(
    api.compensation.listCompensationRecords,
    orgId ? { organizationId: orgId } : 'skip',
  );

  const compensationSummary = _useQuery(
    api.compensation.getCompensationSummary,
    orgId ? { organizationId: orgId } : 'skip',
  );

  const compensationBands = _useQuery(
    api.compensation.listCompensationBands,
    orgId ? { organizationId: orgId } : 'skip',
  );

  const bonusPrograms = _useQuery(
    api.compensation.listBonusPrograms,
    orgId ? { organizationId: orgId } : 'skip',
  );

  const reviewCycles = _useQuery(
    api.compensation.listReviewCycles,
    orgId ? { organizationId: orgId } : 'skip',
  );

  const filteredRecords = useMemo(() => {
    if (!compensationRecords) return [];
    let records = compensationRecords;
    if (searchQuery) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      records = records.filter((r: any) =>
        r.userName.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }
    if (typeFilter !== 'all') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      records = records.filter((r: any) => r.type === typeFilter);
    }
    if (statusFilter !== 'all') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      records = records.filter((r: any) => r.status === statusFilter);
    }
    return records;
  }, [compensationRecords, searchQuery, typeFilter, statusFilter]);

  const chartData = useMemo(() => {
    if (!compensationSummary) return [];
    return [
      { name: t('compensation.base'), value: compensationSummary.byType?.base || 0 },
      { name: t('compensation.bonus'), value: compensationSummary.byType?.bonus || 0 },
      { name: t('compensation.raise'), value: compensationSummary.byType?.raise || 0 },
      { name: t('compensation.adjustment'), value: compensationSummary.byType?.adjustment || 0 },
      { name: t('compensation.allowance'), value: compensationSummary.byType?.allowance || 0 },
    ];
  }, [compensationSummary, t]);

  const statusChartData = useMemo(() => {
    if (!compensationSummary) return [];
    return [
      { name: t('compensation.draft'), value: compensationSummary.byStatus?.draft || 0 },
      {
        name: t('compensation.pendingApproval'),
        value: compensationSummary.byStatus?.pending_approval || 0,
      },
      { name: t('compensation.approved'), value: compensationSummary.byStatus?.approved || 0 },
      { name: t('compensation.active'), value: compensationSummary.byStatus?.active || 0 },
      { name: t('compensation.rejected'), value: compensationSummary.byStatus?.rejected || 0 },
    ].filter((entry) => entry.value > 0);
  }, [compensationSummary, t]);

  const isAdmin =
    user?.role === 'admin' || user?.role === 'supervisor' || user?.role === 'superadmin';
  const canManage = user?.role === 'admin' || user?.role === 'superadmin';

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header */}
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-(--text-primary)">
              {t('compensation.title', 'Compensation')}
            </h2>
            <p className="text-(--text-muted) text-sm mt-1">
              {t(
                'compensation.subtitle',
                'Manage compensation, salary bands, bonus programs, and review cycles',
              )}
            </p>
          </div>
        </div>
      </div>

      {!orgId && (
        <Card>
          <CardContent className="py-12 text-center text-(--text-muted)">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>{t('common.selectOrganization')}</p>
          </CardContent>
        </Card>
      )}

      {!isAdmin && orgId && (
        <Card>
          <CardContent className="py-12 text-center text-(--text-muted)">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>{t('errors.unauthorized')}</p>
          </CardContent>
        </Card>
      )}

      {orgId && isAdmin && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 my-4">
            <motion.div variants={itemVariants}>
              <StatsCard
                title={t('compensation.totalActive')}
                value={compensationSummary?.totalActive || 0}
                icon={<DollarSign className="w-5 h-5" />}
                color="blue"
              />
            </motion.div>
            <motion.div variants={itemVariants}>
              <StatsCard
                title={t('compensation.totalBase')}
                value={formatCurrency(compensationSummary?.totalBase || 0)}
                icon={<TrendingUp className="w-5 h-5" />}
                color="green"
              />
            </motion.div>
            <motion.div variants={itemVariants}>
              <StatsCard
                title={t('compensation.pendingApproval')}
                value={compensationSummary?.byStatus?.pending_approval || 0}
                icon={<Clock className="w-5 h-5" />}
                color="yellow"
              />
            </motion.div>
            <motion.div variants={itemVariants}>
              <StatsCard
                title={t('compensation.approved')}
                value={compensationSummary?.byStatus?.approved || 0}
                icon={<CheckCircle className="w-5 h-5" />}
                color="purple"
              />
            </motion.div>
          </div>

          {/* Tab Navigation */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
            <TabsList className="w-full mb-4 gap-2 bg-transparent p-0 h-auto grid grid-cols-2 md:grid-cols-4">
              <TabsTrigger
                className="w-full px-3 py-2.5 rounded-xl data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center gap-2 text-sm"
                value="records"
              >
                <DollarSign className="w-4 h-4 flex-shrink-0" />
                <span className="hidden sm:inline">{t('compensation.records')}</span>
              </TabsTrigger>
              <TabsTrigger
                className="w-full px-3 py-2.5 rounded-xl data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center gap-2 text-sm"
                value="bands"
              >
                <BarChart3 className="w-4 h-4 flex-shrink-0" />
                <span className="hidden sm:inline">{t('compensation.bands')}</span>
              </TabsTrigger>
              <TabsTrigger
                className="w-full px-3 py-2.5 rounded-xl data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center gap-2 text-sm"
                value="bonuses"
              >
                <Award className="w-4 h-4 flex-shrink-0" />
                <span className="hidden sm:inline">{t('compensation.bonusPrograms')}</span>
              </TabsTrigger>
              <TabsTrigger
                className="w-full px-3 py-2.5 rounded-xl data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center gap-2 text-sm"
                value="cycles"
              >
                <Calendar className="w-4 h-4 flex-shrink-0" />
                <span className="hidden sm:inline">{t('compensation.reviewCycles')}</span>
              </TabsTrigger>
            </TabsList>

            {/* Records Tab */}
            <TabsContent value="records">
              <motion.div variants={itemVariants}>
                <Card>
                  <CardHeader>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <CardTitle className="text-lg">{t('compensation.records')}</CardTitle>
                      <div className="flex flex-wrap gap-2">
                        <div className="relative">
                          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-(--text-muted)" />
                          <Input
                            placeholder={t('compensation.searchPlaceholder')}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 w-64"
                          />
                        </div>
                        <Select value={typeFilter} onValueChange={setTypeFilter}>
                          <SelectTrigger className="w-40">
                            <Filter className="w-4 h-4 mr-2" />
                            <SelectValue placeholder={t('compensation.filterByType')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">{t('compensation.allTypes')}</SelectItem>
                            <SelectItem value="base">{t('compensation.base')}</SelectItem>
                            <SelectItem value="bonus">{t('compensation.bonus')}</SelectItem>
                            <SelectItem value="raise">{t('compensation.raise')}</SelectItem>
                            <SelectItem value="adjustment">
                              {t('compensation.adjustment')}
                            </SelectItem>
                            <SelectItem value="allowance">{t('compensation.allowance')}</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                          <SelectTrigger className="w-40">
                            <SelectValue placeholder={t('compensation.filterByStatus')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">{t('compensation.allStatuses')}</SelectItem>
                            <SelectItem value="draft">{t('compensation.draft')}</SelectItem>
                            <SelectItem value="pending_approval">
                              {t('compensation.pendingApproval')}
                            </SelectItem>
                            <SelectItem value="approved">{t('compensation.approved')}</SelectItem>
                            <SelectItem value="rejected">{t('compensation.rejected')}</SelectItem>
                            <SelectItem value="active">{t('compensation.active')}</SelectItem>
                          </SelectContent>
                        </Select>
                        {canManage && (
                          <Button size="sm" onClick={() => setShowRecordWizard(true)}>
                            <Plus className="w-4 h-4 mr-2" />
                            {t('compensation.newRecord')}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {filteredRecords && filteredRecords.length > 0 ? (
                      <div className="space-y-3">
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        {filteredRecords.slice(0, 10).map((record: any) => (
                          <div
                            key={record._id}
                            className="flex flex-wrap gap-3 items-center justify-between p-3 rounded-lg bg-(--card) border border-(--border)"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-(--primary)/10 flex items-center justify-center">
                                <Users className="w-5 h-5 text-(--primary)" />
                              </div>
                              <div>
                                <p className="font-medium text-(--text-primary)">
                                  {record.userName}
                                </p>
                                <p className="text-sm text-(--text-muted)">
                                  {getTypeBadge(record.type, t)}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-4">
                              <div className="text-right">
                                <p className="font-medium text-(--text-primary)">
                                  {formatCurrency(record.amount, record.currency)}
                                </p>
                                <p className="text-sm text-(--text-muted)">
                                  {t(`compensation.${record.frequency}`)}
                                </p>
                              </div>
                              {getStatusBadge(record.status, t)}
                              <span className="text-sm text-(--text-muted)">
                                {formatDate(record.effectiveFrom)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-(--text-muted)">
                        <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>{t('compensation.noRecords')}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </TabsContent>

            {/* Bands Tab */}
            <TabsContent value="bands">
              <motion.div variants={itemVariants}>
                <Card>
                  <CardHeader>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <CardTitle className="text-lg">{t('compensation.bands')}</CardTitle>
                      {canManage && (
                        <Button size="sm" onClick={() => setShowBandWizard(true)}>
                          <Plus className="w-4 h-4 mr-2" />
                          {t('compensation.newBand')}
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {compensationBands && compensationBands.length > 0 ? (
                      <div className="space-y-3">
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        {compensationBands.map((band: any) => (
                          <div
                            key={band._id}
                            className="flex flex-wrap gap-3 items-center justify-between p-3 rounded-lg bg-(--card) border border-(--border)"
                          >
                            <div>
                              <p className="font-medium text-(--text-primary)">{band.name}</p>
                              <p className="text-sm text-(--text-muted)">
                                {band.level}
                                {band.department ? ` - ${band.department}` : ''}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-4">
                              <div className="text-right">
                                <p className="text-sm text-(--text-muted)">
                                  {formatCurrency(band.minSalary, band.currency)} -{' '}
                                  {formatCurrency(band.maxSalary, band.currency)}
                                </p>
                                {band.medianSalary && (
                                  <p className="text-xs text-(--text-muted)">
                                    {t('compensation.medianSalary')}:{' '}
                                    {formatCurrency(band.medianSalary, band.currency)}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-(--text-muted)">
                        <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>{t('compensation.noBands')}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </TabsContent>

            {/* Bonus Programs Tab */}
            <TabsContent value="bonuses">
              <motion.div variants={itemVariants}>
                <Card>
                  <CardHeader>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <CardTitle className="text-lg">{t('compensation.bonusPrograms')}</CardTitle>
                      {canManage && (
                        <Button size="sm" onClick={() => setShowBonusWizard(true)}>
                          <Plus className="w-4 h-4 mr-2" />
                          {t('compensation.newBonusProgram')}
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {bonusPrograms && bonusPrograms.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        {bonusPrograms.map((program: any) => (
                          <Card key={program._id}>
                            <CardHeader>
                              <div className="flex items-start justify-between">
                                <div>
                                  <CardTitle className="text-base">{program.name}</CardTitle>
                                  <p className="text-sm text-(--text-muted) mt-1">
                                    {program.description}
                                  </p>
                                </div>
                                {getStatusBadge(program.status, t)}
                              </div>
                            </CardHeader>
                            <CardContent>
                              <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-(--text-muted)">
                                    {t('compensation.type')}
                                  </span>
                                  <span className="capitalize">{program.type}</span>
                                </div>
                                {program.bonusAmount && (
                                  <div className="flex justify-between">
                                    <span className="text-(--text-muted)">
                                      {t('compensation.bonusAmount')}
                                    </span>
                                    <span>
                                      {formatCurrency(program.bonusAmount, program.currency)}
                                    </span>
                                  </div>
                                )}
                                {program.bonusPercentage && (
                                  <div className="flex justify-between">
                                    <span className="text-(--text-muted)">
                                      {t('compensation.bonusPercentage')}
                                    </span>
                                    <span>{program.bonusPercentage}%</span>
                                  </div>
                                )}
                                <div className="flex justify-between">
                                  <span className="text-(--text-muted)">
                                    {t('compensation.periodStart')}
                                  </span>
                                  <span>{formatDate(program.periodStart)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-(--text-muted)">
                                    {t('compensation.periodEnd')}
                                  </span>
                                  <span>{formatDate(program.periodEnd)}</span>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-(--text-muted)">
                        <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>{t('compensation.noBonusPrograms')}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </TabsContent>

            {/* Review Cycles Tab */}
            <TabsContent value="cycles">
              <motion.div variants={itemVariants}>
                <Card>
                  <CardHeader>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <CardTitle className="text-lg">{t('compensation.reviewCycles')}</CardTitle>
                      {canManage && (
                        <Button size="sm" onClick={() => setShowCycleWizard(true)}>
                          <Plus className="w-4 h-4 mr-2" />
                          {t('compensation.newReviewCycle')}
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {reviewCycles && reviewCycles.length > 0 ? (
                      <div className="space-y-3">
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        {reviewCycles.map((cycle: any) => (
                          <div
                            key={cycle._id}
                            className="flex flex-wrap gap-3 items-center justify-between p-3 rounded-lg bg-(--card) border border-(--border)"
                          >
                            <div>
                              <p className="font-medium text-(--text-primary)">{cycle.name}</p>
                              <p className="text-sm text-(--text-muted)">
                                {t('compensation.year')}: {cycle.year}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-4">
                              {getStatusBadge(cycle.status, t)}
                              <div className="text-right text-sm text-(--text-muted)">
                                <p>
                                  {formatDate(cycle.cycleStart)} - {formatDate(cycle.cycleEnd)}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-(--text-muted)">
                        <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>{t('compensation.noReviewCycles')}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </TabsContent>
          </Tabs>

          {/* Charts */}
          {compensationSummary && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 my-4">
              <motion.div variants={itemVariants}>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{t('compensation.fundOverview')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={chartData}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke={isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'}
                        />
                        <XAxis dataKey="name" tick={{ fill: textColor, fontSize: 13 }} />
                        <YAxis tick={{ fill: textColor, fontSize: 13 }} />
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: tooltipBg,
                            border: `1px solid ${tooltipBorder}`,
                            borderRadius: '0.5rem',
                            color: tooltipColor,
                            boxShadow: tooltipShadow,
                          }}
                          labelStyle={{ color: tooltipColor, fontWeight: 500 }}
                          formatter={(value, _name) => [value, '']}
                        />
                        <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div variants={itemVariants}>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{t('compensation.dynamics')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={statusChartData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={(entry) =>
                            (entry.value ?? 0) > 0
                              ? `${entry.name ?? ''}: ${((entry.percent ?? 0) * 100).toFixed(0)}%`
                              : ''
                          }
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {statusChartData.map((_entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: tooltipBg,
                            border: `1px solid ${tooltipBorder}`,
                            borderRadius: '0.5rem',
                            color: tooltipColor,
                            boxShadow: tooltipShadow,
                          }}
                          labelStyle={{ color: tooltipColor, fontWeight: 500 }}
                          formatter={(value, _name) => [value, '']}
                        />
                        <Legend
                          wrapperStyle={{ color: textColor, fontSize: '12px' }}
                          formatter={(value: string) => (
                            <span style={{ color: tooltipColor }}>{value}</span>
                          )}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          )}

          {/* Wizards */}
          {showRecordWizard && (
            <CompensationRecordWizard
              onClose={() => setShowRecordWizard(false)}
              onSuccess={() => {
                setShowRecordWizard(false);
              }}
            />
          )}
          {showBandWizard && (
            <CompensationBandWizard
              onClose={() => setShowBandWizard(false)}
              onSuccess={() => {
                setShowBandWizard(false);
              }}
            />
          )}
          {showBonusWizard && (
            <BonusProgramWizard
              onClose={() => setShowBonusWizard(false)}
              onSuccess={() => {
                setShowBonusWizard(false);
              }}
            />
          )}
          {showCycleWizard && (
            <ReviewCycleWizard
              onClose={() => setShowCycleWizard(false)}
              onSuccess={() => {
                setShowCycleWizard(false);
              }}
            />
          )}
        </>
      )}
    </motion.div>
  );
}
