'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@/lib/convex-typed';
import { api } from '../../../../../convex/_generated/api';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { useAuthUser } from '@/store/useAuthStore';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, Pencil } from 'lucide-react';

interface EmployeeBalance {
  _id: string;
  name: string;
  email: string;
  department?: string;
  position?: string;
  employeeType?: string;
  balances: Record<string, number>;
}

type BalanceKey =
  | 'paidLeaveBalance'
  | 'sickLeaveBalance'
  | 'familyLeaveBalance'
  | 'dayOffBalance'
  | 'studyLeaveBalance'
  | 'maternityLeaveBalance';

const BALANCE_FIELDS: {
  key: BalanceKey;
  labelKey: string;
  label: string;
  icon: string;
  color: string;
}[] = [
  {
    key: 'paidLeaveBalance',
    labelKey: 'leaveTypes.paid',
    label: 'Paid Vacation',
    icon: '💰',
    color: '#2563eb',
  },
  {
    key: 'sickLeaveBalance',
    labelKey: 'leaveTypes.sick',
    label: 'Sick Leave',
    icon: '🤒',
    color: '#ef4444',
  },
  {
    key: 'familyLeaveBalance',
    labelKey: 'leaveTypes.family',
    label: 'Family Leave',
    icon: '👨‍👩‍👧‍👦',
    color: '#10b981',
  },
  {
    key: 'dayOffBalance',
    labelKey: 'leaveTypes.day_off',
    label: 'Day Off',
    icon: '🎯',
    color: '#8b5cf6',
  },
  {
    key: 'studyLeaveBalance',
    labelKey: 'leaveTypes.study',
    label: 'Study Leave',
    icon: '📚',
    color: '#a855f7',
  },
  {
    key: 'maternityLeaveBalance',
    labelKey: 'leaveTypes.maternity',
    label: 'Maternity Leave',
    icon: '👶',
    color: '#ec4899',
  },
];

export default function LeaveBalancesPage() {
  const { t } = useTranslation();
  const user = useAuthUser();
  const organizationId = useSelectedOrganization() as Id<'organizations'> | undefined;

  const [search, setSearch] = useState('');
  const [editingEmployee, setEditingEmployee] = useState<EmployeeBalance | null>(null);
  const [editBalances, setEditBalances] = useState<Record<string, number>>({});
  const [editReason, setEditReason] = useState('');
  const [saving, setSaving] = useState(false);

  const employees = useQuery(
    api.leaveSettings.getEmployeeLeaveBalances,
    organizationId ? { organizationId } : 'skip',
  );
  const updateBalance = useMutation(api.leaveSettings.updateLeaveBalance);

  if (!organizationId || !user) return <ShieldLoader />;

  const filtered =
    employees?.filter(
      (e) =>
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.email.toLowerCase().includes(search.toLowerCase()),
    ) ?? [];

  const handleEditEmployee = (emp: EmployeeBalance) => {
    setEditingEmployee(emp);
    setEditBalances({ ...emp.balances });
    setEditReason('');
  };

  const handleSaveBalances = async () => {
    if (!editingEmployee || !editReason.trim()) {
      toast.error(
        t('admin.leaveBalances.reasonRequired', 'Please provide a reason for the adjustment'),
      );
      return;
    }
    // Validate everything before writing so we never apply a partial update.
    const changes: { key: BalanceKey; value: number }[] = [];
    for (const field of BALANCE_FIELDS) {
      const newValue = editBalances[field.key];
      const oldValue = editingEmployee.balances[field.key] ?? 0;
      if (newValue === undefined || !Number.isFinite(newValue)) {
        toast.error(t('admin.leaveBalances.invalid', 'Balances must be valid numbers'));
        return;
      }
      if (newValue < 0) {
        toast.error(t('admin.leaveBalances.negative', 'Balances cannot be negative'));
        return;
      }
      if (newValue !== oldValue) changes.push({ key: field.key, value: newValue });
    }
    if (changes.length === 0) {
      setEditingEmployee(null);
      return;
    }

    setSaving(true);
    try {
      for (const change of changes) {
        await updateBalance({
          userId: editingEmployee._id as Id<'users'>,
          field: change.key,
          value: change.value,
          reason: editReason,
        });
      }
      toast.success(t('admin.leaveBalances.saved', 'Balances updated successfully'));
      setEditingEmployee(null);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 bg-(--background)/95 backdrop-blur border-b border-(--border)">
        <h1 className="text-2xl font-bold">{t('admin.leaveBalances.title', 'Leave Balances')}</h1>
        <p className="text-sm text-(--text-muted) mt-1">
          {t('admin.leaveBalances.subtitle', 'View and edit employee leave balances')}
        </p>
        <div className="relative mt-3 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('common.search', 'Search employees...')}
            className="pl-9"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {filtered.map((emp) => (
          <Card key={emp._id} className="hover:shadow-sm transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-medium">{emp.name}</p>
                  <p className="text-xs text-(--text-muted)">
                    {emp.department || emp.position
                      ? `${emp.department ?? ''} ${emp.position ?? ''}`.trim()
                      : emp.email}
                    <Badge variant="outline" className="ml-2 text-[10px]">
                      {emp.employeeType}
                    </Badge>
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => handleEditEmployee(emp)}>
                  <Pencil className="w-4 h-4 mr-1" /> {t('common.edit', 'Edit')}
                </Button>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {BALANCE_FIELDS.map((bf) => (
                  <div key={bf.key} className="text-center p-2 rounded-lg bg-(--background-subtle)">
                    <p className="text-lg font-bold" style={{ color: bf.color }}>
                      {emp.balances[bf.key] ?? 0}
                    </p>
                    <p className="text-[10px] text-(--text-muted) truncate">
                      {t(bf.labelKey, bf.label)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-(--text-muted) py-12">
            {t('admin.leaveBalances.noEmployees', 'No employees found')}
          </p>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingEmployee} onOpenChange={() => setEditingEmployee(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {t('admin.leaveBalances.editTitle', 'Edit Balances')} — {editingEmployee?.name}
            </DialogTitle>
          </DialogHeader>
          {editingEmployee && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {BALANCE_FIELDS.map((bf) => (
                  <div key={bf.key}>
                    <Label className="text-xs flex items-center gap-1">
                      <span>{bf.icon}</span> {t(bf.labelKey, bf.label)}
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      value={editBalances[bf.key] ?? 0}
                      onChange={(e) =>
                        setEditBalances((prev) => ({
                          ...prev,
                          [bf.key]: Number(e.target.value),
                        }))
                      }
                      className="mt-1"
                      style={{ borderColor: bf.color }}
                    />
                  </div>
                ))}
              </div>
              <div>
                <Label>{t('admin.leaveBalances.reason', 'Reason for adjustment *')}</Label>
                <Textarea
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder={t(
                    'admin.leaveBalances.reasonPlaceholder',
                    'e.g. Annual balance accrual, correction',
                  )}
                  rows={2}
                  className="mt-1"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  disabled={saving}
                  onClick={() => setEditingEmployee(null)}
                >
                  {t('common.cancel', 'Cancel')}
                </Button>
                <Button onClick={handleSaveBalances} disabled={saving || !editReason.trim()}>
                  {saving ? t('common.saving', 'Saving...') : t('common.save', 'Save Changes')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
