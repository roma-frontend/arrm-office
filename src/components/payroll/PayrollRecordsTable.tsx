'use client';

import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from '@/lib/cssMotion';
import {
  Search,
  Filter,
  FileText,
  Eye,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { useAuthStore } from '@/store/useAuthStore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import Link from 'next/link';

const ITEMS_PER_PAGE = 10;

function getStatusBadge(status: string, t: (key: string) => string) {
  const variants: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
    paid: 'success',
    approved: 'success',
    calculated: 'warning',
    draft: 'secondary',
    cancelled: 'destructive',
  };

  return (
    <Badge variant={variants[status] || 'secondary'} className="capitalize">
      {t(`payroll.${status}`)}
    </Badge>
  );
}

function formatCurrency(amount: number, currency = 'AMD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function PayrollRecordsTable() {
  const { t } = useTranslation();
  const selectedOrgId = useSelectedOrganization();
  const user = useAuthStore((s) => s.user);
  const orgId = selectedOrgId as Id<'organizations'> | undefined;
  const isAdmin =
    user?.role === 'admin' || user?.role === 'supervisor' || user?.role === 'superadmin';
  const canManage = user?.role === 'admin' || user?.role === 'superadmin';

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  const records = useQuery(
    api.payroll.queries.getPayrollRecords,
    orgId && user?.id && isAdmin ? { organizationId: orgId } : 'skip',
  );

  const filteredRecords = useMemo(() => {
    if (!records) return [];

    let filtered = [...records];

    if (statusFilter !== 'all') {
      filtered = filtered.filter((r) => r.status === statusFilter);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.user?.name?.toLowerCase().includes(searchLower) ||
          r.user?.email?.toLowerCase().includes(searchLower) ||
          r.period.toLowerCase().includes(searchLower),
      );
    }

    return filtered.sort((a, b) => b.createdAt - a.createdAt);
  }, [records, statusFilter, search]);

  const totalPages = Math.ceil(filteredRecords.length / ITEMS_PER_PAGE);
  const paginatedRecords = filteredRecords.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE,
  );

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-(--text-muted)">
          <p>{t('errors.unauthorized')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
            <CardTitle>{t('payroll.records')}</CardTitle>
            {canManage && (
              <Button variant="outline" size="sm" asChild>
                <Link href="/payroll?new=true">
                  <FileText className="w-4 h-4 mr-2" />
                  {t('payroll.newRun')}
                </Link>
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
              <Input
                className="pl-10"
                placeholder={t('payroll.searchPlaceholder')}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="hidden sm:block w-4 h-4 text-(--text-muted)" />
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder={t('payroll.filterByStatus')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('payroll.allStatuses')}</SelectItem>
                  <SelectItem value="draft">{t('payroll.draft')}</SelectItem>
                  <SelectItem value="calculated">{t('payroll.calculated')}</SelectItem>
                  <SelectItem value="approved">{t('payroll.approved')}</SelectItem>
                  <SelectItem value="paid">{t('payroll.paid')}</SelectItem>
                  <SelectItem value="cancelled">{t('payroll.cancelled')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {paginatedRecords.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-(--border)">
                    <th className="text-left py-3 px-4 text-sm font-medium text-(--text-muted)">
                      {t('payroll.employee')}
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-(--text-muted)">
                      {t('payroll.period')}
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-(--text-muted)">
                      {t('payroll.grossSalary')}
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-(--text-muted)">
                      {t('payroll.netSalary')}
                    </th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-(--text-muted)">
                      {t('payroll.status')}
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-(--text-muted)">
                      {t('payroll.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRecords.map((record) => (
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
                      <td className="py-3 px-4 text-(--text-primary)">{record.period}</td>
                      <td className="py-3 px-4 text-right font-medium text-(--text-primary)">
                        {formatCurrency(record.grossSalary)}
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-emerald-500">
                        {formatCurrency(record.netSalary)}
                      </td>
                      <td className="py-3 px-4 text-center">{getStatusBadge(record.status, t)}</td>
                      <td className="py-3 px-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/payroll/${record.payrollRunId || record._id}`}>
                                <Eye className="w-4 h-4 mr-2" />
                                {t('payroll.viewDetails')}
                              </Link>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-(--text-muted)">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>{t('payroll.noRecords')}</p>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-(--border)">
              <p className="text-sm text-(--text-muted)">
                {(page - 1) * ITEMS_PER_PAGE + 1}–
                {Math.min(page * ITEMS_PER_PAGE, filteredRecords.length)} {t('payroll.of')}{' '}
                {filteredRecords.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <Button
                    key={p}
                    variant={p === page ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
