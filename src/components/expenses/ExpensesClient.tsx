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
  Receipt,
  FileText,
  Calendar,
  X,
} from 'lucide-react';
import { useQuery, useMutation } from 'convex/react';
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
import ExpenseWizard from './ExpenseWizard';
import CategoryWizard from './CategoryWizard';
import ReportWizard from './ReportWizard';
import PolicyWizard from './PolicyWizard';

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

const CATEGORY_ICONS: Record<string, string> = {
  travel: '✈️',
  meals: '🍽️',
  accommodation: '🏨',
  transport: '🚗',
  office_supplies: '📦',
  software: '💻',
  training: '📚',
  health: '🏥',
  communication: '📱',
  other: '📋',
};

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
    approved: 'success',
    reimbursed: 'success',
    draft: 'secondary',
    submitted: 'warning',
    under_review: 'warning',
    rejected: 'destructive',
    cancelled: 'destructive',
  };

  return (
    <Badge variant={variants[status] || 'secondary'} className="capitalize">
      {t(`expenses.${status}`) || status}
    </Badge>
  );
}

function getCategoryLabel(category: string, t: (key: string) => string) {
  const icon = CATEGORY_ICONS[category] || '📋';
  return `${icon} ${t(`expenses.categoryNames.${category}`) || category}`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function ExpensesClient() {
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
  const isSuperadmin = user?.role === 'superadmin';
  const orgId = (selectedOrgId ?? user?.organizationId ?? undefined) as
    | Id<'organizations'>
    | undefined;

  const queryOrgId = isSuperadmin ? undefined : orgId;

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'expenses' | 'reports' | 'categories' | 'policies'>(
    'expenses',
  );
  const [wizardOpen, setWizardOpen] = useState(false);
  const [categoryWizardOpen, setCategoryWizardOpen] = useState(false);
  const [reportWizardOpen, setReportWizardOpen] = useState(false);
  const [policyWizardOpen, setPolicyWizardOpen] = useState(false);

  const _useQuery = useQuery as unknown as (...args: any[]) => any;
  const _useMutation = useMutation as unknown as (...args: any[]) => any;

  const expenses = _useQuery(
    api.expenses.listExpenses,
    queryOrgId !== undefined || isSuperadmin ? { organizationId: queryOrgId } : 'skip',
  );

  const expenseSummary = _useQuery(
    api.expenses.getExpenseSummary,
    queryOrgId !== undefined || isSuperadmin ? { organizationId: queryOrgId } : 'skip',
  );

  const expenseCategories = _useQuery(
    api.expenses.listExpenseCategories,
    queryOrgId !== undefined || isSuperadmin ? { organizationId: queryOrgId } : 'skip',
  );

  const expensePolicy = _useQuery(
    api.expenses.getExpensePolicy,
    queryOrgId !== undefined || isSuperadmin ? { organizationId: queryOrgId } : 'skip',
  );

  const expenseReports = _useQuery(
    api.expenses.listExpenseReports,
    queryOrgId !== undefined || isSuperadmin ? { organizationId: queryOrgId } : 'skip',
  );

  const submitExpense = _useMutation(api.expenses.submitExpense);
  const approveExpense = _useMutation(api.expenses.approveExpense);
  const rejectExpense = _useMutation(api.expenses.rejectExpense);
  const deleteExpense = _useMutation(api.expenses.deleteExpense);

  const filteredExpenses = useMemo(() => {
    if (!expenses) return [];
    let result = expenses;
    if (searchQuery) {
      result = result.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (e: any) =>
          e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          e.userName.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }
    if (categoryFilter !== 'all') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = result.filter((e: any) => e.category === categoryFilter);
    }
    if (statusFilter !== 'all') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = result.filter((e: any) => e.status === statusFilter);
    }
    return result;
  }, [expenses, searchQuery, categoryFilter, statusFilter]);

  const categoryChartData = useMemo(() => {
    if (!expenseSummary?.byCategory) return [];
    return Object.entries(expenseSummary.byCategory).map(([key, value]) => ({
      name: t(`expenses.categoryNames.${key}`) || key,
      value: value as number,
    }));
  }, [expenseSummary, t]);

  const statusChartData = useMemo(() => {
    if (!expenseSummary?.byStatus) return [];
    return Object.entries(expenseSummary.byStatus)
      .filter(([_, value]) => (value as number) > 0)
      .map(([key, value]) => ({
        name: t(`expenses.${key}`) || key,
        value: value as number,
      }));
  }, [expenseSummary, t]);

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
              {t('expenses.title', 'Expense Management')}
            </h2>
            <p className="text-(--text-muted) text-sm mt-1">
              {t('expenses.subtitle', 'Track and manage company expenses')}
            </p>
          </div>
        </div>
      </div>

      {!queryOrgId && !isSuperadmin && (
        <Card>
          <CardContent className="py-12 text-center text-(--text-muted)">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>{t('common.selectOrganization')}</p>
          </CardContent>
        </Card>
      )}

      {(queryOrgId || isSuperadmin) && isAdmin && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 my-4">
            <motion.div variants={itemVariants}>
              <StatsCard
                title={t('expenses.totalExpenses')}
                value={expenseSummary?.totalExpenses || 0}
                icon={<Receipt className="w-5 h-5" />}
                color="blue"
              />
            </motion.div>
            <motion.div variants={itemVariants}>
              <StatsCard
                title={t('expenses.totalAmount')}
                value={formatCurrency(expenseSummary?.totalAmount || 0)}
                icon={<DollarSign className="w-5 h-5" />}
                color="green"
              />
            </motion.div>
            <motion.div variants={itemVariants}>
              <StatsCard
                title={t('expenses.pendingApproval')}
                value={expenseSummary?.pendingApproval || 0}
                icon={<Clock className="w-5 h-5" />}
                color="yellow"
              />
            </motion.div>
            <motion.div variants={itemVariants}>
              <StatsCard
                title={t('expenses.approved')}
                value={expenseSummary?.byStatus?.approved || 0}
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
                value="expenses"
              >
                <Receipt className="w-4 h-4 flex-shrink-0" />
                <span className="hidden sm:inline">{t('expenses.expenses')}</span>
              </TabsTrigger>
              <TabsTrigger
                className="w-full px-3 py-2.5 rounded-xl data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center gap-2 text-sm"
                value="reports"
              >
                <FileText className="w-4 h-4 flex-shrink-0" />
                <span className="hidden sm:inline">{t('expenses.reports')}</span>
              </TabsTrigger>
              <TabsTrigger
                className="w-full px-3 py-2.5 rounded-xl data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center gap-2 text-sm"
                value="categories"
              >
                <BarChart3 className="w-4 h-4 flex-shrink-0" />
                <span className="hidden sm:inline">{t('expenses.categories')}</span>
              </TabsTrigger>
              <TabsTrigger
                className="w-full px-3 py-2.5 rounded-xl data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center gap-2 text-sm"
                value="policies"
              >
                <Calendar className="w-4 h-4 flex-shrink-0" />
                <span className="hidden sm:inline">{t('expenses.policies')}</span>
              </TabsTrigger>
            </TabsList>

            {/* Expenses Tab */}
            <TabsContent value="expenses">
              <motion.div variants={itemVariants}>
                <Card>
                  <CardHeader>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <CardTitle className="text-lg">{t('expenses.expenses')}</CardTitle>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => setWizardOpen(true)}>
                          <Plus className="w-4 h-4 mr-2" />
                          {t('expenses.newExpense')}
                        </Button>
                        <div className="relative">
                          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-(--text-muted)" />
                          <Input
                            placeholder={t('expenses.searchPlaceholder')}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 w-64"
                          />
                        </div>
                        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                          <SelectTrigger className="w-40">
                            <Filter className="w-4 h-4 mr-2" />
                            <SelectValue placeholder={t('expenses.filterByCategory')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">{t('expenses.allCategories')}</SelectItem>
                            {Object.keys(CATEGORY_ICONS).map((cat) => (
                              <SelectItem key={cat} value={cat}>
                                {getCategoryLabel(cat, t)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                          <SelectTrigger className="w-40">
                            <SelectValue placeholder={t('expenses.filterByStatus')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">{t('expenses.allStatuses')}</SelectItem>
                            <SelectItem value="draft">{t('expenses.draft')}</SelectItem>
                            <SelectItem value="submitted">{t('expenses.submitted')}</SelectItem>
                            <SelectItem value="under_review">
                              {t('expenses.under_review')}
                            </SelectItem>
                            <SelectItem value="approved">{t('expenses.approved')}</SelectItem>
                            <SelectItem value="rejected">{t('expenses.rejected')}</SelectItem>
                            <SelectItem value="reimbursed">{t('expenses.reimbursed')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {filteredExpenses && filteredExpenses.length > 0 ? (
                      <div className="space-y-3">
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        {filteredExpenses.slice(0, 10).map((expense: any) => (
                          <div
                            key={expense._id}
                            className="flex flex-wrap gap-3 items-center justify-between p-3 rounded-lg bg-(--card) border border-(--border)"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-(--primary)/10 flex items-center justify-center">
                                <Receipt className="w-5 h-5 text-(--primary)" />
                              </div>
                              <div>
                                <p className="font-medium text-(--text-primary)">{expense.title}</p>
                                <p className="text-sm text-(--text-muted)">
                                  {getCategoryLabel(expense.category, t)}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-4">
                              <div className="text-right">
                                <p className="font-medium text-(--text-primary)">
                                  {formatCurrency(expense.amount, expense.currency)}
                                </p>
                                <p className="text-sm text-(--text-muted)">
                                  {formatDate(expense.expenseDate)}
                                </p>
                              </div>
                              {getStatusBadge(expense.status, t)}
                              {canManage &&
                                expense.createdBy !== user.id &&
                                (expense.status === 'submitted' ||
                                  expense.status === 'under_review') && (
                                  <div className="flex gap-1">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() =>
                                        approveExpense({
                                          expenseId: expense._id,
                                          reviewedBy: user.id as Id<'users'>,
                                          reviewNotes: '',
                                        })
                                      }
                                    >
                                      <CheckCircle className="w-3 h-3" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() =>
                                        rejectExpense({
                                          expenseId: expense._id,
                                          reviewedBy: user.id as Id<'users'>,
                                          reviewNotes: 'Rejected',
                                        })
                                      }
                                    >
                                      <X className="w-3 h-3" />
                                    </Button>
                                  </div>
                                )}
                              {expense.status === 'draft' && canManage && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => deleteExpense({ expenseId: expense._id })}
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-(--text-muted)">
                        <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>{t('expenses.noExpenses')}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </TabsContent>

            {/* Reports Tab */}
            <TabsContent value="reports">
              <motion.div variants={itemVariants}>
                <Card>
                  <CardHeader>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <CardTitle className="text-lg">{t('expenses.reports')}</CardTitle>
                      {canManage && (
                        <Button size="sm" onClick={() => setReportWizardOpen(true)}>
                          <Plus className="w-4 h-4 mr-2" />
                          {t('expenses.newReport')}
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {expenseReports && expenseReports.length > 0 ? (
                      <div className="space-y-3">
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        {expenseReports.map((report: any) => (
                          <div
                            key={report._id}
                            className="flex flex-wrap gap-3 items-center justify-between p-3 rounded-lg bg-(--card) border border-(--border)"
                          >
                            <div>
                              <p className="font-medium text-(--text-primary)">{report.name}</p>
                              <p className="text-sm text-(--text-muted)">
                                {report.userName} - {report.expenseCount}{' '}
                                {t('expenses.expenses').toLowerCase()}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-4">
                              <div className="text-right">
                                <p className="font-medium text-(--text-primary)">
                                  {formatCurrency(report.totalAmount, report.currency)}
                                </p>
                                <p className="text-sm text-(--text-muted)">
                                  {formatDate(report.periodStart)} - {formatDate(report.periodEnd)}
                                </p>
                              </div>
                              {getStatusBadge(report.status, t)}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-(--text-muted)">
                        <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>{t('expenses.noReports')}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </TabsContent>

            {/* Categories Tab */}
            <TabsContent value="categories">
              <motion.div variants={itemVariants}>
                <Card>
                  <CardHeader>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <CardTitle className="text-lg">{t('expenses.categories')}</CardTitle>
                      {canManage && (
                        <Button size="sm" onClick={() => setCategoryWizardOpen(true)}>
                          <Plus className="w-4 h-4 mr-2" />
                          {t('expenses.newCategory')}
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {expenseCategories && expenseCategories.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        {expenseCategories.map((category: any) => (
                          <Card key={category._id}>
                            <CardHeader>
                              <div className="flex items-start justify-between">
                                <div>
                                  <CardTitle className="text-base">
                                    {getCategoryLabel(category.key, t)}
                                  </CardTitle>
                                  <p className="text-sm text-(--text-muted) mt-1">
                                    {category.description}
                                  </p>
                                </div>
                                <Badge variant={category.isActive ? 'success' : 'secondary'}>
                                  {category.isActive ? t('common.active') : t('common.inactive')}
                                </Badge>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <div className="space-y-2 text-sm">
                                {category.dailyLimit && (
                                  <div className="flex justify-between">
                                    <span className="text-(--text-muted)">
                                      {t('expenses.dailyLimit')}
                                    </span>
                                    <span>{formatCurrency(category.dailyLimit, 'AMD')}</span>
                                  </div>
                                )}
                                {category.monthlyLimit && (
                                  <div className="flex justify-between">
                                    <span className="text-(--text-muted)">
                                      {t('expenses.monthlyLimit')}
                                    </span>
                                    <span>{formatCurrency(category.monthlyLimit, 'AMD')}</span>
                                  </div>
                                )}
                                <div className="flex justify-between">
                                  <span className="text-(--text-muted)">
                                    {t('expenses.requiresReceipt')}
                                  </span>
                                  <span>
                                    {category.requiresReceipt ? t('common.yes') : t('common.no')}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-(--text-muted)">
                                    {t('expenses.requiresApproval')}
                                  </span>
                                  <span>
                                    {category.requiresApproval ? t('common.yes') : t('common.no')}
                                  </span>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-(--text-muted)">
                        <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>{t('expenses.noCategories')}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </TabsContent>

            {/* Policies Tab */}
            <TabsContent value="policies">
              <motion.div variants={itemVariants}>
                <Card>
                  <CardHeader>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <CardTitle className="text-lg">{t('expenses.policies')}</CardTitle>
                      {canManage && (
                        <Button size="sm" onClick={() => setPolicyWizardOpen(true)}>
                          <Plus className="w-4 h-4 mr-2" />
                          {t('expenses.newPolicy')}
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {expensePolicy ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="font-medium text-(--text-primary)">
                            {expensePolicy.name}
                          </h3>
                          <Badge variant={expensePolicy.isActive ? 'success' : 'secondary'}>
                            {expensePolicy.isActive ? t('common.active') : t('common.inactive')}
                          </Badge>
                        </div>
                        {expensePolicy.description && (
                          <p className="text-sm text-(--text-muted)">{expensePolicy.description}</p>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <h4 className="font-medium text-(--text-primary)">
                              {t('expenses.approvalLimits')}
                            </h4>
                            {expensePolicy.autoApprovalLimit && (
                              <div className="flex justify-between text-sm">
                                <span className="text-(--text-muted)">
                                  {t('expenses.autoApprovalLimit')}
                                </span>
                                <span>
                                  {formatCurrency(expensePolicy.autoApprovalLimit, 'AMD')}
                                </span>
                              </div>
                            )}
                            {expensePolicy.managerApprovalLimit && (
                              <div className="flex justify-between text-sm">
                                <span className="text-(--text-muted)">
                                  {t('expenses.managerApprovalLimit')}
                                </span>
                                <span>
                                  {formatCurrency(expensePolicy.managerApprovalLimit, 'AMD')}
                                </span>
                              </div>
                            )}
                            {expensePolicy.directorApprovalLimit && (
                              <div className="flex justify-between text-sm">
                                <span className="text-(--text-muted)">
                                  {t('expenses.directorApprovalLimit')}
                                </span>
                                <span>
                                  {formatCurrency(expensePolicy.directorApprovalLimit, 'AMD')}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="space-y-2">
                            <h4 className="font-medium text-(--text-primary)">
                              {t('expenses.receiptPolicy')}
                            </h4>
                            {expensePolicy.receiptRequiredAbove && (
                              <div className="flex justify-between text-sm">
                                <span className="text-(--text-muted)">
                                  {t('expenses.receiptRequiredAbove')}
                                </span>
                                <span>
                                  {formatCurrency(expensePolicy.receiptRequiredAbove, 'AMD')}
                                </span>
                              </div>
                            )}
                            {expensePolicy.submissionDeadlineDays && (
                              <div className="flex justify-between text-sm">
                                <span className="text-(--text-muted)">
                                  {t('expenses.submissionDeadline')}
                                </span>
                                <span>
                                  {expensePolicy.submissionDeadlineDays} {t('common.days')}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-(--text-muted)">
                        <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>{t('expenses.noPolicies')}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </TabsContent>
          </Tabs>

          {/* Charts */}
          {expenseSummary && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 my-4">
              <motion.div variants={itemVariants}>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{t('expenses.byCategory')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={categoryChartData}>
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
                    <CardTitle className="text-lg">{t('expenses.byStatus')}</CardTitle>
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
        </>
      )}
      {wizardOpen && orgId && user && (
        <ExpenseWizard
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          organizationId={orgId}
          userId={user.id as Id<'users'>}
          onSuccess={() => {}}
        />
      )}
      {categoryWizardOpen && orgId && user && (
        <CategoryWizard
          open={categoryWizardOpen}
          onOpenChange={setCategoryWizardOpen}
          organizationId={orgId}
          userId={user.id as Id<'users'>}
          onSuccess={() => {}}
        />
      )}
      {reportWizardOpen && orgId && user && (
        <ReportWizard
          open={reportWizardOpen}
          onOpenChange={setReportWizardOpen}
          organizationId={orgId}
          userId={user.id as Id<'users'>}
          onSuccess={() => {}}
        />
      )}
      {policyWizardOpen && orgId && user && (
        <PolicyWizard
          open={policyWizardOpen}
          onOpenChange={setPolicyWizardOpen}
          organizationId={orgId}
          userId={user.id as Id<'users'>}
          onSuccess={() => {}}
        />
      )}
    </motion.div>
  );
}
