'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { useAuthUser } from '@/store/useAuthStore';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const LEAVE_TYPE_META: Record<string, { label: string; icon: string; color: string }> = {
  paid: { label: 'Paid Vacation', icon: '💰', color: '#2563eb' },
  unpaid: { label: 'Unpaid Leave', icon: '📋', color: '#f59e0b' },
  sick: { label: 'Sick Leave', icon: '🤒', color: '#ef4444' },
  family: { label: 'Family Leave', icon: '👨‍👩‍👧‍👦', color: '#10b981' },
  doctor: { label: 'Doctor Visit', icon: '🩺', color: '#06b6d4' },
  day_off: { label: 'Day Off', icon: '🎯', color: '#8b5cf6' },
  maternity: { label: 'Maternity Leave', icon: '👶', color: '#ec4899' },
  paternity: { label: 'Paternity Leave', icon: '👨‍👦', color: '#3b82f6' },
  study: { label: 'Study Leave', icon: '📚', color: '#a855f7' },
};

const APPROVAL_ROLES = ['supervisor', 'hr', 'ceo'] as const;

export default function LeaveSettingsPage() {
  const { t } = useTranslation();
  const user = useAuthUser();
  const organizationId = useSelectedOrganization() as Id<'organizations'> | undefined;
  const [editingType, setEditingType] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  const configs = useQuery(
    api.leaveSettings.getLeaveTypeConfigs,
    organizationId ? { organizationId } : 'skip',
  );
  const upsertConfig = useMutation(api.leaveSettings.upsertLeaveTypeConfig);
  const initializeDefaults = useMutation(api.leaveSettings.initializeDefaultLeaveTypes);

  // Auto-initialize defaults if no configs exist
  React.useEffect(() => {
    if (configs && configs.length === 0 && organizationId) {
      initializeDefaults({ organizationId }).catch(console.error);
    }
  }, [configs, organizationId, initializeDefaults]);

  if (!organizationId || !user) return <ShieldLoader />;

  const handleEdit = (type: string) => {
    const existing = configs?.find((c) => c.type === type);
    setEditingType(type);
    setEditForm({
      isActive: existing?.isActive ?? true,
      defaultDaysPerYear: existing?.defaultDaysPerYear ?? 10,
      requiresDocumentation: existing?.requiresDocumentation ?? false,
      approvalChain: existing?.approvalChain ?? ['supervisor'],
      balanceEditable: existing?.balanceEditable ?? true,
    });
  };

  const handleSave = async () => {
    if (!editingType) return;
    try {
      await upsertConfig({
        organizationId,
        type: editingType as any,
        ...editForm,
      });
      toast.success(t('admin.leaveSettings.saved', 'Leave type configuration saved'));
      setEditingType(null);
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleAddApprovalRole = (role: string) => {
    if (!editForm.approvalChain.includes(role)) {
      setEditForm((prev: any) => ({
        ...prev,
        approvalChain: [...prev.approvalChain, role],
      }));
    }
  };

  const handleRemoveApprovalRole = (role: string) => {
    setEditForm((prev: any) => ({
      ...prev,
      approvalChain: prev.approvalChain.filter((r: string) => r !== role),
    }));
  };

  const leaveTypes = Object.entries(LEAVE_TYPE_META);

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 bg-(--background)/95 backdrop-blur border-b border-(--border)">
        <div>
          <h1 className="text-2xl font-bold">
            {t('admin.leaveSettings.title', 'Leave Type Settings')}
          </h1>
          <p className="text-sm text-(--text-muted) mt-1">
            {t(
              'admin.leaveSettings.subtitle',
              'Configure leave types, approval workflows, and balances',
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {leaveTypes.map(([type, meta]) => {
          const config = configs?.find((c) => c.type === type);
          const isEditing = editingType === type;
          const isActive = config?.isActive ?? true;

          return (
            <Card
              key={type}
              className={`border-l-4 ${isActive ? '' : 'opacity-60'}`}
              style={{ borderLeftColor: meta.color }}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{meta.icon}</span>
                    <div>
                      <CardTitle className="text-lg">
                        {t(`leaveTypes.${type}`, meta.label)}
                      </CardTitle>
                      {config && (
                        <p className="text-xs text-(--text-muted)">
                          {t('admin.leaveSettings.defaultDays', 'Default: {{days}} days/year', {
                            days: config.defaultDaysPerYear,
                          })}
                          {' · '}
                          {t('admin.leaveSettings.approvalChain', 'Approval: {{chain}}', {
                            chain: config.approvalChain.join(' → '),
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={isActive ? 'default' : 'secondary'}>
                      {isActive ? t('common.active', 'Active') : t('common.inactive', 'Inactive')}
                    </Badge>
                    <Button size="sm" variant="outline" onClick={() => handleEdit(type)}>
                      {t('common.edit', 'Edit')}
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {isEditing && (
                <CardContent className="border-t pt-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between">
                      <Label>{t('admin.leaveSettings.active', 'Active')}</Label>
                      <Switch
                        checked={editForm.isActive}
                        onCheckedChange={(v) =>
                          setEditForm((prev: any) => ({ ...prev, isActive: v }))
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>
                        {t('admin.leaveSettings.requiresDoc', 'Requires Documentation')}
                      </Label>
                      <Switch
                        checked={editForm.requiresDocumentation}
                        onCheckedChange={(v) =>
                          setEditForm((prev: any) => ({ ...prev, requiresDocumentation: v }))
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>{t('admin.leaveSettings.balanceEditable', 'Balance Editable')}</Label>
                      <Switch
                        checked={editForm.balanceEditable}
                        onCheckedChange={(v) =>
                          setEditForm((prev: any) => ({ ...prev, balanceEditable: v }))
                        }
                      />
                    </div>
                    <div>
                      <Label>{t('admin.leaveSettings.daysPerYear', 'Days Per Year')}</Label>
                      <Input
                        type="number"
                        value={editForm.defaultDaysPerYear}
                        onChange={(e) =>
                          setEditForm((prev: any) => ({
                            ...prev,
                            defaultDaysPerYear: Number(e.target.value),
                          }))
                        }
                        className="mt-1"
                      />
                    </div>
                  </div>

                  {/* Approval Chain */}
                  <div>
                    <Label>
                      {t('admin.leaveSettings.approvalChain', 'Approval Chain (ordered)')}
                    </Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {editForm.approvalChain?.map((role: string) => (
                        <Badge
                          key={role}
                          variant="secondary"
                          className="cursor-pointer hover:bg-red-100 hover:text-red-600 transition-colors"
                          onClick={() => handleRemoveApprovalRole(role)}
                        >
                          {role} ✕
                        </Badge>
                      ))}
                      <Select onValueChange={handleAddApprovalRole}>
                        <SelectTrigger className="w-32 h-7 text-xs">
                          <SelectValue placeholder="+ Add role" />
                        </SelectTrigger>
                        <SelectContent>
                          {APPROVAL_ROLES.filter((r) => !editForm.approvalChain?.includes(r)).map(
                            (role) => (
                              <SelectItem key={role} value={role}>
                                {role}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => setEditingType(null)}>
                      {t('common.cancel', 'Cancel')}
                    </Button>
                    <Button onClick={handleSave}>{t('common.save', 'Save')}</Button>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
