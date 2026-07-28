'use client';

import { useQuery, useMutation } from '@/lib/convex-typed';
import { api } from '@/convex/_generated/api';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import {
  Database,
  HardDrive,
  Clock,
  Building2,
  RotateCcw,
  ShieldAlert,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  User,
  Users,
  Calendar,
  FileBox,
  Building,
  RefreshCw,
} from 'lucide-react';
import { useState, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/useAuthStore';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import type { Id } from '@/convex/_generated/dataModel';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const SUPERADMIN_EMAIL = (process.env.NEXT_PUBLIC_BOOTSTRAP_SUPERADMIN_EMAIL ?? '').toLowerCase();

export default function BackupsManagementPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthStore();
  const globalSelectedOrgId = useSelectedOrganization();

  const backupStats = useQuery(api.backups.getBackupStats);
  const allOrganizations = useQuery(
    api.organizations.getAllOrganizations,
    user?.id ? { superadminUserId: user.id as Id<'users'> } : 'skip',
  );

  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set());
  const [expandedEmployees, setExpandedEmployees] = useState<Map<string, string>>(new Map());
  const [restoreConfirm, setRestoreConfirm] = useState<{
    backupId: Id<'employeeBackups'>;
    userName: string;
    userEmail: string;
    createdAt: number;
  } | null>(null);

  const restoreEmployeeBackup = useMutation(api.backups.restoreEmployeeBackup);
  const createOrgBackups = useMutation(api.backups.createOrgBackups);
  const createEmployeeBackup = useMutation(api.backups.createEmployeeBackup);
  const [runningBackup, setRunningBackup] = useState<string | null>(null);
  const [localSelectedOrg, setLocalSelectedOrg] = useState<{ id: string; name: string } | null>(
    null,
  );

  const refreshData = useCallback(() => {
    window.location.reload();
  }, []);

  const orgs = allOrganizations ?? [];
  const isLoading = !allOrganizations;

  // Если на дашборде выбрана организация — используем её по умолчанию
  const defaultOrgId =
    globalSelectedOrgId && orgs.some((o) => o._id === globalSelectedOrgId)
      ? globalSelectedOrgId
      : null;

  const effectiveOrgId = localSelectedOrg?.id ?? defaultOrgId;

  // Если выбрана конкретная организация — показываем только её, иначе все
  const filteredOrgs = useMemo(() => {
    if (!effectiveOrgId) return orgs;
    return orgs.filter((org) => org._id === effectiveOrgId);
  }, [orgs, effectiveOrgId]);

  const selectedOrgData = useMemo(() => {
    if (!effectiveOrgId) return null;
    return orgs.find((org) => org._id === effectiveOrgId) ?? null;
  }, [orgs, effectiveOrgId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <ShieldLoader size="lg" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <ShieldLoader size="lg" />
      </div>
    );
  }

  const isSuperAdmin = user.role === 'superadmin' || user.email?.toLowerCase() === SUPERADMIN_EMAIL;

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2 text-red-500">
              <ShieldAlert className="w-6 h-6" />
              <CardTitle>{t('superadmin.backups.accessDenied')}</CardTitle>
            </div>
            <CardDescription>{t('ui.onlySuperadminCanAccess')}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{t('superadmin.backups.accessDenied')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const toggleOrg = (orgId: string) => {
    setExpandedOrgs((prev) => {
      const next = new Set(prev);
      if (next.has(orgId)) {
        next.delete(orgId);
      } else {
        next.add(orgId);
      }
      return next;
    });
  };

  const toggleEmployee = (orgId: string, userId: string) => {
    const key = `${orgId}:${userId}`;
    setExpandedEmployees((prev) => {
      const next = new Map(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.set(key, userId);
      }
      return next;
    });
  };

  const handleRestore = (
    backupId: Id<'employeeBackups'>,
    userName: string,
    userEmail: string,
    createdAt: number,
  ) => {
    setRestoreConfirm({ backupId, userName, userEmail, createdAt });
  };

  const handleManualBackup = async (orgId: string, orgName: string) => {
    setRunningBackup(orgId);
    try {
      const result = await createOrgBackups({ organizationId: orgId as Id<'organizations'> });
      if (result.success) {
        toast.success(
          t('superadmin.backups.manualBackupSuccess', { name: orgName, count: result.backedUp }),
        );
        // Auto-expand the organization so user can see the backups
        setExpandedOrgs((prev) => new Set(prev).add(orgId));
      } else {
        toast.error(t('superadmin.backups.manualBackupFailed', { reason: result.reason }));
      }
    } catch (error) {
      toast.error(t('superadmin.backups.manualBackupError'));
    } finally {
      setRunningBackup(null);
    }
  };

  const handleSingleOrgBackup = async () => {
    if (!effectiveOrgId || !selectedOrgData) return;
    await handleManualBackup(selectedOrgData._id, selectedOrgData.name);
  };

  const handleBackupEmployee = async (orgId: string, userId: string) => {
    setRunningBackup(userId);
    try {
      const result = await createEmployeeBackup({
        organizationId: orgId as Id<'organizations'>,
        userId: userId as Id<'users'>,
      });
      if (result.success) {
        toast.success(t('superadmin.backups.employeeBackupSuccess'));
      } else {
        toast.error(t('superadmin.backups.employeeBackupFailed', { reason: result.reason }));
      }
    } catch (error) {
      toast.error(t('superadmin.backups.employeeBackupError'));
    } finally {
      setRunningBackup(null);
    }
  };

  const confirmRestore = async () => {
    if (!restoreConfirm) return;

    try {
      const result = await restoreEmployeeBackup({ backupId: restoreConfirm.backupId });
      if (result.success) {
        toast.success(t('superadmin.backups.restoreSuccess', { name: restoreConfirm.userName }));
      } else {
        toast.error(t('superadmin.backups.restoreError'));
      }
    } catch (error) {
      toast.error(t('superadmin.backups.restoreError'));
    }

    setRestoreConfirm(null);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(
      i18n.language === 'ru' ? 'ru-RU' : i18n.language === 'hy' ? 'hy-AM' : 'en-US',
      {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      },
    );
  };

  const handleRunAllBackups = async () => {
    setRunningBackup('all');
    try {
      let totalBackedUp = 0;
      let totalFailed = 0;

      for (const org of orgs) {
        try {
          const result = await createOrgBackups({ organizationId: org._id as Id<'organizations'> });
          if (result.success) {
            totalBackedUp += result.backedUp || 0;
            totalFailed += result.failed || 0;
          }
        } catch {
          totalFailed += org.totalEmployees || 1;
        }
      }

      if (totalBackedUp > 0) {
        toast.success(t('superadmin.backups.manualBackupSuccess', { count: totalBackedUp }));
      }
      if (totalFailed > 0) {
        toast.warning(t('superadmin.backups.manualBackupPartial', { count: totalFailed }));
      }
    } catch (error) {
      toast.error(t('superadmin.backups.manualBackupError'));
    } finally {
      setRunningBackup(null);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="mx-auto max-w-7xl">
        <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
          <h1
            className="text-3xl md:text-4xl font-bold mb-2"
            style={{ color: 'var(--text-primary)' }}
          >
            {t('superadmin.backups.title')}
          </h1>
          <p className="text-muted-foreground">{t('superadmin.backups.subtitle')}</p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 mb-6">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                disabled={orgs.length === 0}
                className="flex items-center gap-2 disabled:opacity-50"
              >
                <Building className="w-4 h-4" />
                {selectedOrgData?.name ??
                  (globalSelectedOrgId
                    ? (orgs.find((o) => o._id === globalSelectedOrgId)?.name ??
                      t('superadmin.backups.selectOrg'))
                    : t('superadmin.backups.selectOrg'))}
                <ChevronDown className="w-3 h-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
              <DropdownMenuLabel>{t('superadmin.backups.selectOrgLabel')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {orgs.map((org) => (
                <DropdownMenuItem
                  key={org._id}
                  onClick={() => setLocalSelectedOrg({ id: org._id, name: org.name })}
                  className={effectiveOrgId === org._id ? 'bg-(--primary)/10' : ''}
                >
                  <Building2 className="w-4 h-4 mr-2" />
                  {org.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            onClick={handleSingleOrgBackup}
            disabled={!!runningBackup || !effectiveOrgId}
            className="flex items-center gap-2 btn-gradient text-white font-medium shadow-md hover:shadow-lg disabled:opacity-50"
          >
            <Database className="w-4 h-4" />
            {runningBackup === effectiveOrgId
              ? t('superadmin.backups.runningBackup')
              : t('superadmin.backups.backupSelectedOrg')}
          </Button>
          <Button
            onClick={handleRunAllBackups}
            disabled={!!runningBackup || orgs.length === 0}
            className="flex items-center gap-2 btn-gradient text-white font-medium shadow-md hover:shadow-lg disabled:opacity-50"
          >
            <Database className="w-4 h-4" />
            {runningBackup
              ? t('superadmin.backups.runningBackup')
              : t('superadmin.backups.runAllBackups')}
          </Button>
          <Button onClick={refreshData} variant="outline" className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            {t('superadmin.backups.refresh', 'Refresh')}
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-4">
          <div className="p-4 rounded-lg border" style={{ background: 'var(--background-subtle)' }}>
            <div className="flex items-center gap-2 mb-2">
              <Database className="w-4 h-4 text-blue-500" />
              <p className="text-xs text-muted-foreground">
                {t('superadmin.backups.totalBackups')}
              </p>
            </div>
            <p className="text-2xl font-bold">{backupStats?.totalBackups ?? '...'}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('superadmin.backups.totalBackupsCount')}
            </p>
          </div>
          <div className="p-4 rounded-lg border" style={{ background: 'var(--background-subtle)' }}>
            <div className="flex items-center gap-2 mb-2">
              <HardDrive className="w-4 h-4 text-orange-500" />
              <p className="text-xs text-muted-foreground">{t('superadmin.backups.storageUsed')}</p>
            </div>
            <p className="text-2xl font-bold">
              {backupStats ? formatSize(backupStats.totalSize) : '...'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('superadmin.backups.storageInfo')}
            </p>
          </div>
          <div className="p-4 rounded-lg border" style={{ background: 'var(--background-subtle)' }}>
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-4 h-4 text-green-500" />
              <p className="text-xs text-muted-foreground">
                {t('superadmin.backups.orgsBackedUp')}
              </p>
            </div>
            <p className="text-2xl font-bold text-green-500">
              {backupStats?.orgsBackedUp ?? '...'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('superadmin.backups.orgsBackedUpCount')}
            </p>
          </div>
          <div className="p-4 rounded-lg border" style={{ background: 'var(--background-subtle)' }}>
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-purple-500" />
              <p className="text-xs text-muted-foreground">
                {t('superadmin.backups.totalEmployees')}
              </p>
            </div>
            <p className="text-2xl font-bold">
              {filteredOrgs?.reduce((sum: number, o) => sum + (o.totalEmployees || 0), 0) || 0}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('superadmin.backups.totalEmployeesCount')}
            </p>
          </div>
        </div>

        {/* Organizations List */}
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
              {t('superadmin.backups.orgBackupsTitle')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {filteredOrgs.length} {t('superadmin.backups.orgsCount')}
            </p>
          </div>

          {filteredOrgs.length === 0 ? (
            <div
              className="text-center py-12 rounded-lg"
              style={{ background: 'var(--background-subtle)' }}
            >
              <Building2 className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-30" />
              <h3 className="font-semibold text-lg mb-1" style={{ color: 'var(--text-primary)' }}>
                {t('superadmin.backups.noOrgsFound')}
              </h3>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredOrgs.map((org) => (
                <OrgBackups
                  key={org._id}
                  org={org}
                  isExpanded={expandedOrgs.has(org._id)}
                  onToggle={() => toggleOrg(org._id)}
                  expandedEmployees={expandedEmployees}
                  onToggleEmployee={toggleEmployee}
                  onRestore={handleRestore}
                  onManualBackup={handleManualBackup}
                  onBackupEmployee={handleBackupEmployee}
                  runningBackup={runningBackup}
                  formatSize={formatSize}
                  formatDate={formatDate}
                  t={t}
                  superadminUserId={user.id}
                />
              ))}
            </div>
          )}
        </div>

        {/* Restore Confirmation Dialog */}
        {restoreConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <Card className="w-full max-w-md mx-4 bg-(--card) border-(--border)">
              <CardHeader>
                <div className="flex items-center gap-2 text-amber-500">
                  <AlertCircle className="w-5 h-5" />
                  <CardTitle>{t('superadmin.backups.restoreConfirmTitle')}</CardTitle>
                </div>
                <CardDescription>
                  {t('superadmin.backups.restoreConfirmDesc', {
                    userName: restoreConfirm.userName,
                    date: formatDate(restoreConfirm.createdAt),
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg bg-(--background-subtle) p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-(--text-muted)">{t('superadmin.user')}</span>
                    <span className="text-(--text-primary) font-medium">
                      {restoreConfirm.userName}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-(--text-muted)">{t('superadmin.email')}</span>
                    <span className="text-(--text-primary)">{restoreConfirm.userEmail}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-(--text-muted)">
                      {t('superadmin.backups.backupDate')}
                    </span>
                    <span className="text-(--text-primary)">
                      {formatDate(restoreConfirm.createdAt)}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => setRestoreConfirm(null)}
                    className="border-(--border) text-(--text-primary)"
                  >
                    {t('superadmin.backups.cancelBtn')}
                  </Button>
                  <Button
                    onClick={confirmRestore}
                    className="bg-(--primary) text-white hover:bg-(--primary)/90"
                  >
                    <RotateCcw className="w-4 h-4 mr-1" />
                    {t('superadmin.backups.restoreConfirmBtn')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function OrgBackups({
  org,
  isExpanded,
  onToggle,
  expandedEmployees,
  onToggleEmployee,
  onRestore,
  onManualBackup,
  onBackupEmployee,
  runningBackup,
  formatSize,
  formatDate,
  t,
  superadminUserId,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  org: any;
  isExpanded: boolean;
  onToggle: () => void;
  expandedEmployees: Map<string, string>;
  onToggleEmployee: (orgId: string, userId: string) => void;
  onRestore: (
    backupId: Id<'employeeBackups'>,
    userName: string,
    userEmail: string,
    createdAt: number,
  ) => void;
  onManualBackup: (orgId: string, orgName: string) => void;
  onBackupEmployee: (orgId: string, userId: string) => void;
  runningBackup: string | null;
  formatSize: (bytes: number) => string;
  formatDate: (timestamp: number) => string;
  t: (key: string, params?: Record<string, any>) => string;
  superadminUserId: string;
}) {
  const orgBackups = useQuery(
    api.backups.getOrgBackups,
    isExpanded ? { organizationId: org._id as Id<'organizations'> } : 'skip',
  );

  const employees = useQuery(
    api.users.queries.getUsersByOrganizationId,
    isExpanded
      ? {
          organizationId: org._id as Id<'organizations'>,
        }
      : 'skip',
  );

  const backupMap = useMemo(() => {
    const map = new Map<string, any>();
    orgBackups?.forEach((emp) => {
      map.set(String(emp.userId), emp);
    });
    return map;
  }, [orgBackups]);

  const employeeList = useMemo(() => {
    if (!employees) return [];
    return employees.filter((emp) => emp.role !== 'superadmin');
  }, [employees]);

  return (
    <div
      className="p-4 rounded-lg border hover:border-blue-400/50 transition-all hover:shadow-md"
      style={{ background: 'var(--card)' }}
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
        <button onClick={onToggle} className="flex-1 flex items-center gap-3 text-left min-w-0">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-(--text-muted) shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-(--text-muted) shrink-0" />
          )}
          <div className="min-w-0">
            <p className="font-medium text-(--text-primary) truncate">{org.name}</p>
            <p className="text-xs text-(--text-muted) font-mono mt-1">{org.slug}</p>
          </div>
        </button>
        <div className="flex items-center gap-2 text-sm shrink-0 flex-wrap">
          <div className="flex items-center gap-1 text-(--text-muted)">
            <Database className="w-3 h-3" />
            <span>{orgBackups?.reduce((sum, emp) => sum + emp.backupCount, 0) ?? 0}</span>
          </div>
          {orgBackups && orgBackups.length > 0 && (
            <div className="flex items-center gap-1 text-(--text-muted)">
              <Clock className="w-3 h-3" />
              <span className="hidden sm:inline">
                {formatDate(Math.max(...orgBackups.map((e) => e.latestBackup)))}
              </span>
              <span className="sm:hidden">
                {new Date(Math.max(...orgBackups.map((e) => e.latestBackup))).toLocaleDateString()}
              </span>
            </div>
          )}
          <Button
            onClick={(e) => {
              e.stopPropagation();
              onManualBackup(org._id, org.name);
            }}
            disabled={runningBackup === org._id || runningBackup === 'all'}
            variant="ghost"
            size="sm"
            className="text-(--primary) hover:text-(--primary) hover:bg-(--primary)/10 disabled:opacity-50"
          >
            {runningBackup === org._id ? (
              <ShieldLoader size="xs" variant="inline" />
            ) : (
              <Database className="w-4 h-4" />
            )}
            <span className="ml-1 text-xs">{t('superadmin.backups.backupOrg')}</span>
          </Button>
        </div>
      </div>

      {isExpanded && employeeList && (
        <div className="border-t pt-3 mt-3" style={{ borderColor: 'var(--border)' }}>
          {employeeList.length === 0 ? (
            <div className="p-6 text-center text-(--text-muted)">
              <User className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">{t('superadmin.backups.noEmployeesFound')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {employeeList.map((emp) => {
                const empKey = `${org._id}:${emp._id}`;
                const isEmpExpanded = expandedEmployees.has(empKey);
                const backupData = backupMap.get(String(emp._id));
                return (
                  <EmployeeBackups
                    key={emp._id}
                    emp={emp}
                    orgId={org._id}
                    isExpanded={isEmpExpanded}
                    onToggle={() => onToggleEmployee(org._id, emp._id)}
                    onRestore={onRestore}
                    onBackup={() => onBackupEmployee(org._id, emp._id)}
                    backupData={backupData}
                    runningBackup={runningBackup}
                    formatSize={formatSize}
                    formatDate={formatDate}
                    t={t}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EmployeeBackups({
  emp,
  orgId,
  isExpanded,
  onToggle,
  onRestore,
  onBackup,
  backupData,
  runningBackup,
  formatSize,
  formatDate,
  t,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emp: any;
  orgId: string;
  isExpanded: boolean;
  onToggle: () => void;
  onRestore: (
    backupId: Id<'employeeBackups'>,
    userName: string,
    userEmail: string,
    createdAt: number,
  ) => void;
  onBackup: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  backupData?: any;
  runningBackup: string | null;
  formatSize: (bytes: number) => string;
  formatDate: (timestamp: number) => string;
  t: (key: string, params?: Record<string, any>) => string;
}) {
  const userBackups = useQuery(
    api.backups.getUserBackups,
    isExpanded
      ? { organizationId: orgId as Id<'organizations'>, userId: emp._id as Id<'users'> }
      : 'skip',
  );

  const isBackingUp = runningBackup === emp._id;
  const backupCount = backupData?.backupCount ?? 0;
  const latestBackup = backupData?.latestBackup;

  return (
    <div
      className="p-3 rounded-lg border hover:border-blue-400/50 transition-all"
      style={{ background: 'var(--card)' }}
    >
      <div
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        role="button"
        tabIndex={0}
        className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-2 cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0">
          {isExpanded ? (
            <ChevronDown className="w-3 h-3 text-(--text-muted) shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 text-(--text-muted) shrink-0" />
          )}
          <User className="w-4 h-4 text-(--text-muted) shrink-0" />
          <div className="min-w-0">
            <p className="font-medium text-(--text-primary) text-sm truncate">{emp.name}</p>
            <p className="text-xs text-(--text-muted) font-mono truncate">{emp.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm sm:gap-3 pl-6 sm:pl-0">
          <Badge
            variant="outline"
            className="bg-(--primary)/10 text-(--primary) border-(--primary)/20 shrink-0"
          >
            {backupCount} {t('superadmin.backups.employeeBackupsCount', { count: backupCount })}
          </Badge>
          {latestBackup && (
            <div className="flex items-center gap-1 text-(--text-muted) shrink-0">
              <Calendar className="w-3 h-3 hidden sm:block" />
              <span className="hidden sm:inline">{formatDate(latestBackup)}</span>
              <span className="sm:hidden text-xs">
                {new Date(latestBackup).toLocaleDateString()}
              </span>
            </div>
          )}
          <Button
            onClick={(e) => {
              e.stopPropagation();
              onBackup();
            }}
            disabled={isBackingUp || runningBackup === 'all'}
            variant="outline"
            size="sm"
            className="border-(--primary) text-(--primary) hover:bg-(--primary)/10 disabled:opacity-50 shrink-0"
          >
            {isBackingUp ? (
              <ShieldLoader size="xs" variant="inline" />
            ) : (
              <Database className="w-3 h-3" />
            )}
            <span className="ml-1 text-xs font-medium hidden sm:inline">
              {t('superadmin.backups.backup')}
            </span>
          </Button>
        </div>
      </div>

      {isExpanded && userBackups && (
        <div className="border-t pt-3 mt-3" style={{ borderColor: 'var(--border)' }}>
          {userBackups.length === 0 ? (
            <div className="p-4 text-center text-(--text-muted) text-sm">
              {t('superadmin.backups.noBackupsForUser')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                    <th className="text-left py-2 px-2 text-muted-foreground font-semibold text-xs">
                      {t('superadmin.backups.backupDate')}
                    </th>
                    <th className="text-left py-2 px-2 text-muted-foreground font-semibold text-xs">
                      {t('superadmin.backups.backupExpires')}
                    </th>
                    <th className="text-left py-2 px-2 text-muted-foreground font-semibold text-xs">
                      {t('superadmin.backups.backupSize')}
                    </th>
                    <th className="text-left py-2 px-2 text-muted-foreground font-semibold text-xs">
                      {t('superadmin.backups.status')}
                    </th>
                    <th className="text-left py-2 px-2 text-muted-foreground font-semibold text-xs">
                      {t('superadmin.backups.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {userBackups.map((backup) => {
                    const now = Date.now();
                    const isExpired = backup.expiresAt < now;
                    return (
                      <tr
                        key={backup.id}
                        className="border-b hover:bg-(--background-subtle) transition-colors"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        <td className="py-2 px-2 text-sm text-(--text-primary)">
                          {formatDate(backup.createdAt)}
                        </td>
                        <td className="py-2 px-2 text-sm text-(--text-muted)">
                          {formatDate(backup.expiresAt)}
                        </td>
                        <td className="py-2 px-2 text-sm text-(--text-primary)">
                          {formatSize(backup.snapshotSize)}
                        </td>
                        <td className="py-2 px-2">
                          <Badge
                            variant="outline"
                            className={
                              isExpired
                                ? 'bg-red-500/10 text-red-500 border-red-500/20'
                                : 'bg-green-500/10 text-green-500 border-green-500/20'
                            }
                          >
                            {isExpired
                              ? t('superadmin.backups.expired')
                              : t('superadmin.backups.active')}
                          </Badge>
                        </td>
                        <td className="py-2 px-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isExpired}
                            onClick={() =>
                              onRestore(
                                backup.id,
                                backup.userName,
                                backup.userEmail,
                                backup.createdAt,
                              )
                            }
                            className="text-(--primary) hover:text-(--primary) hover:bg-(--primary)/10 disabled:opacity-50"
                          >
                            <RotateCcw className="w-3 h-3 mr-1" />
                            {t('superadmin.backups.restoreEmployee')}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
