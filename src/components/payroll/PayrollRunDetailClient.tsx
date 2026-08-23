'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { motion } from '@/lib/cssMotion';
import {
  ArrowLeft,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Users,
  Clock,
  FileText,
  Calendar,
  User,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Calculator,
  Send,
  Pencil,
  Ban,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/useAuthStore';
import { EditPayrollRecordDialog } from '@/components/payroll/EditPayrollRecordDialog';

type PayrollRunDetail = NonNullable<
  FunctionReturnType<typeof api.payroll.queries.getPayrollRunById>
>;
type PayrollRecordItem = PayrollRunDetail['records'][number];

function formatCurrency(amount: number, currency = 'AMD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function getStatusBadge(status: string, t: (key: string) => string) {
  const variants: Record<
    string,
    { variant: 'success' | 'warning' | 'destructive' | 'secondary'; icon: React.ReactNode }
  > = {
    paid: { variant: 'success', icon: <CheckCircle className="w-3 h-3" /> },
    approved: { variant: 'success', icon: <CheckCircle className="w-3 h-3" /> },
    calculated: { variant: 'warning', icon: <Clock className="w-3 h-3" /> },
    draft: { variant: 'secondary', icon: <FileText className="w-3 h-3" /> },
    cancelled: { variant: 'destructive', icon: <XCircle className="w-3 h-3" /> },
  };

  const config = variants[status] ?? variants.draft!;

  return (
    <Badge variant={config.variant} className="capitalize flex items-center gap-1">
      {config.icon}
      {t(`payroll.${status}`)}
    </Badge>
  );
}

export default function PayrollRunDetailClient({ params }: { params: Promise<{ id: string }> }) {
  const { t } = useTranslation();
  const resolvedParams = React.use(params);
  const rawRunId = resolvedParams.id;
  // Defensive: stale links may carry a period like "2026-08" instead of a
  // Convex doc id. Convex ids are alphanumeric only (no '-'), so reject anything
  // else before querying — otherwise the validator throws ArgumentValidationError.
  const isValidRunId = /^[A-Za-z0-9]+$/.test(rawRunId);
  const runId = rawRunId as Id<'payrollRuns'>;
  const { user } = useAuthStore();

  const isAdmin =
    user?.role === 'admin' || user?.role === 'supervisor' || user?.role === 'superadmin';

  const run = useQuery(
    api.payroll.queries.getPayrollRunById,
    user?.id && isValidRunId ? { id: runId } : 'skip',
  );

  const calculate = useMutation(api.payroll.mutations.calculatePayrollRun);
  const approve = useMutation(api.payroll.mutations.approvePayrollRun);
  const markPaid = useMutation(api.payroll.mutations.markPayrollRunAsPaid);
  const cancel = useMutation(api.payroll.mutations.cancelPayrollRun);

  const [editingRecord, setEditingRecord] = useState<PayrollRecordItem | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const runAction = async (fn: () => Promise<unknown>, successKey: string) => {
    if (!user?.id) {
      toast.error(t('errors.unauthorized'));
      return;
    }
    setActionLoading(true);
    try {
      await fn();
      toast.success(t(successKey) || 'Done');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.error', 'Error'));
    } finally {
      setActionLoading(false);
    }
  };

  if (!run) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-(--text-muted)">{t('payroll.noData')}</div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 my-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/payroll">
              <ArrowLeft className="w-5 h-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-(--text-primary)">
              {t('payroll.run')} #{run._id.slice(-6)}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <Calendar className="w-4 h-4 text-(--text-muted)" />
              <span className="text-(--text-muted)">{run.period}</span>
              {getStatusBadge(run.status, t)}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {isAdmin && run.status === 'draft' && (
            <Button
              size="sm"
              onClick={() =>
                runAction(
                  () =>
                    calculate({
                      payrollRunId: run._id,
                    }),
                  'payroll.calculated',
                )
              }
              disabled={actionLoading}
            >
              <Calculator className="w-4 h-4 mr-2" />
              {t('payroll.calculate') || 'Calculate'}
            </Button>
          )}
          {isAdmin && run.status === 'calculated' && user?.id && (
            <Button
              size="sm"
              onClick={() =>
                runAction(
                  () =>
                    approve({
                      payrollRunId: run._id,
                    }),
                  'payroll.approved',
                )
              }
              disabled={actionLoading}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              {t('payroll.approve') || 'Approve'}
            </Button>
          )}
          {isAdmin && run.status === 'approved' && (
            <Button
              size="sm"
              onClick={() =>
                runAction(
                  () =>
                    markPaid({
                      payrollRunId: run._id,
                    }),
                  'payroll.markedAsPaid',
                )
              }
              disabled={actionLoading}
            >
              <Send className="w-4 h-4 mr-2" />
              {t('payroll.markPaid') || 'Mark as paid'}
            </Button>
          )}
          {isAdmin && run.status !== 'paid' && run.status !== 'cancelled' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                runAction(
                  () =>
                    cancel({
                      payrollRunId: run._id,
                    }),
                  'payroll.cancelled',
                )
              }
              disabled={actionLoading}
            >
              <Ban className="w-4 h-4 mr-2" />
              {t('payroll.cancel')}
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-(--success-text)" />
              <span className="text-sm text-(--text-muted)">{t('payroll.totalGross')}</span>
            </div>
            <p className="text-2xl font-bold text-(--text-primary)">
              {formatCurrency(run.totalGross || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-(--brand-text)" />
              <span className="text-sm text-(--text-muted)">{t('payroll.totalNet')}</span>
            </div>
            <p className="text-2xl font-bold text-(--brand-text)">
              {formatCurrency(run.totalNet || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="w-4 h-4 text-(--danger-text)" />
              <span className="text-sm text-(--text-muted)">{t('payroll.totalDeductions')}</span>
            </div>
            <p className="text-2xl font-bold text-(--danger-text)">
              {formatCurrency(run.totalDeductions || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-(--purple-text)" />
              <span className="text-sm text-(--text-muted)">{t('payroll.employees')}</span>
            </div>
            <p className="text-2xl font-bold text-(--purple-text)">{run.employeeCount || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Records Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('payroll.records')}</CardTitle>
        </CardHeader>
        <CardContent>
          {run.records && run.records.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-(--border)">
                    <th className="text-left py-3 px-4 text-sm font-medium text-(--text-muted)">
                      {t('payroll.employee')}
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-(--text-muted)">
                      {t('payroll.baseSalary')}
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-(--text-muted)">
                      {t('payroll.grossSalary')}
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-(--text-muted)">
                      {t('payroll.netSalary')}
                    </th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-(--text-muted)">
                      {t('payroll.statusLabel', 'Status')}
                    </th>
                    <th className="w-12" />
                  </tr>
                </thead>
                <tbody>
                  {run.records.map((record) => (
                    <tr
                      key={record._id}
                      className="border-b border-(--border) hover:bg-(--card-hover)"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-(--primary)/10 flex items-center justify-center text-(--primary) text-sm font-medium">
                            {record.user?.name?.charAt(0) || '?'}
                          </div>
                          <div>
                            <p className="font-medium text-(--text-primary)">
                              {record.user?.name || t('common.unknownUser', 'Unknown')}
                            </p>
                            <p className="text-xs text-(--text-muted)">{record.user?.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right text-(--text-primary)">
                        {formatCurrency(record.baseSalary)}
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-(--text-primary)">
                        {formatCurrency(record.grossSalary)}
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-(--success-text)">
                        {formatCurrency(record.netSalary)}
                      </td>
                      <td className="py-3 px-4 text-center">{getStatusBadge(record.status, t)}</td>
                      <td className="py-3 px-4 text-right">
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingRecord(record)}
                            disabled={record.status === 'paid'}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-(--text-muted)">
              <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>{t('payroll.noRecords')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Metadata */}
      <Card>
        <CardHeader>
          <CardTitle>{t('payroll.metadata')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-(--text-muted)" />
                <span className="text-sm text-(--text-muted)">{t('payroll.createdAt')}:</span>
                <span className="text-sm font-medium">
                  {new Date(run.createdAt).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-(--text-muted)" />
                <span className="text-sm text-(--text-muted)">{t('payroll.updatedAt')}:</span>
                <span className="text-sm font-medium">
                  {new Date(run.updatedAt).toLocaleString()}
                </span>
              </div>
            </div>
            <div className="space-y-3">
              {run.approvedByUser && (
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-(--text-muted)" />
                  <span className="text-sm text-(--text-muted)">{t('payroll.approvedBy')}:</span>
                  <span className="text-sm font-medium">{run.approvedByUser.name}</span>
                </div>
              )}
              {run.approvedAt && (
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-(--success-text)" />
                  <span className="text-sm text-(--text-muted)">{t('payroll.approvedAt')}:</span>
                  <span className="text-sm font-medium">
                    {new Date(run.approvedAt).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          </div>

          {run.notes && (
            <>
              <Separator className="my-4" />
              <div>
                <h4 className="text-sm font-medium mb-2">{t('payroll.notes')}</h4>
                <p className="text-sm text-(--text-muted)">{run.notes}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <EditPayrollRecordDialog
        open={!!editingRecord}
        onOpenChange={(o) => !o && setEditingRecord(null)}
        record={editingRecord}
      />
    </motion.div>
  );
}
