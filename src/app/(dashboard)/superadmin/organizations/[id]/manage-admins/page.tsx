'use client';

import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../../../convex/_generated/api';
import type { Id } from '../../../../../../../convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { useRouter, useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import {
  ArrowLeft,
  Shield,
  Users,
  UserCheck,
  UserX,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  Clock,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { motion } from '@/lib/cssMotion';

interface Member {
  _id: string;
  name: string;
  email: string;
  role: 'admin' | 'supervisor' | 'employee' | 'superadmin';
  isActive: boolean;
  isApproved: boolean;
  department?: string;
  position?: string;
  avatarUrl?: string;
  createdAt: number;
}

export default function ManageAdminsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams();
  const { user } = useAuthStore();
  const orgId = params.id as string;
  const isSuperadmin = user?.role === 'superadmin';

  // Check if admin is trying to access their own organization
  const isOwnOrganization = user?.organizationId === orgId;
  const canAccess = isSuperadmin || (user?.role === 'admin' && isOwnOrganization);

  // Queries and Mutations
  const organization = useQuery(
    api.organizations.getOrganizationById,
    user?.id && orgId
      ? { callerUserId: user.id as Id<'users'>, organizationId: orgId as Id<'organizations'> }
      : 'skip',
  );

  const orgMembers = useQuery(
    api.organizations.getOrgMembers,
    user?.id && orgId
      ? { superadminUserId: user.id as Id<'users'>, organizationId: orgId as Id<'organizations'> }
      : 'skip',
  );

  const assignAdminMutation = useMutation(api.organizations.assignOrgAdmin);
  const removeAdminMutation = useMutation(api.organizations.removeOrgAdmin);

  // State
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'promote' | 'demote' | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }

    if (!canAccess) {
      router.push('/dashboard');
    }
  }, [user, canAccess, router]);

  const handlePromoteAdmin = async () => {
    if (!selectedMemberId) return;

    setIsLoading(true);
    try {
      await assignAdminMutation({
        superadminUserId: user?.id as Id<'users'>,
        userId: selectedMemberId as Id<'users'>,
        organizationId: orgId as Id<'organizations'>,
      });

      toast.success(t('ui.adminAssignedSuccessfully'));
      setShowConfirm(false);
      setSelectedMemberId(null);
      setActionType(null);
    } catch (error) {
      console.error('Error promoting admin:', error);
      toast.error((error instanceof Error ? error.message : '') || t('ui.errorAssigningAdmin'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveAdmin = async () => {
    if (!selectedMemberId) return;

    setIsLoading(true);
    try {
      await removeAdminMutation({
        superadminUserId: user?.id as Id<'users'>,
        userId: selectedMemberId as Id<'users'>,
      });

      toast.success(t('ui.adminRemovedSuccessfully'));
      setShowConfirm(false);
      setSelectedMemberId(null);
      setActionType(null);
    } catch (error) {
      console.error('Error removing admin:', error);
      toast.error((error instanceof Error ? error.message : '') || t('ui.errorRemovingAdmin'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = (memberId: string, action: 'promote' | 'demote') => {
    setSelectedMemberId(memberId);
    setActionType(action);
    setShowConfirm(true);
  };

  const selectedMember = orgMembers?.find((m) => m._id === selectedMemberId);

  // Loading & Auth States
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <ShieldLoader size="lg" />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">{t('ui.accessDenied')}</h1>
          <p className="text-muted-foreground">
            {isSuperadmin ? t('ui.organizationNotFound') : t('manageAdmins.onlyManageOwn')}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            {t('manageAdmins.yourRole')}: {user.role} | {t('manageAdmins.yourOrg')}:{' '}
            {user.organizationId} | {t('manageAdmins.requested')}: {orgId}
          </p>
        </div>
      </div>
    );
  }

  if (organization === undefined || orgMembers === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <ShieldLoader size="lg" />
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">{t('ui.organizationNotFound')}</h1>
          <p className="text-muted-foreground">{t('manageAdmins.notFoundDesc')}</p>
          <button
            onClick={() => router.push('/superadmin/organizations')}
            className="mt-4 px-4 py-2 rounded-lg bg-primary text-white hover:opacity-90 transition"
          >
            {t('ui.backToOrganizations')}
          </button>
        </div>
      </div>
    );
  }

  const admins = orgMembers.filter((m) => m.role === 'admin');
  const employees = orgMembers.filter((m) => m.role !== 'admin');

  return (
    <div className="min-h-screen p-6" style={{ background: 'var(--background)' }}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
          <div className="mb-8">
            <button
              onClick={() => router.push('/superadmin/organizations')}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition mb-4"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('ui.backToOrganizations')}
            </button>

            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                {organization.name}
              </h1>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                {organization.plan.toUpperCase()}
              </span>
            </div>
            <p className="text-muted-foreground">{t('manageAdmins.manageDesc')}</p>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="p-4 rounded-xl border" style={{ background: 'var(--card)' }}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10 dark:bg-blue-500/20">
                <Users className="w-5 h-5 text-blue-500 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('manageAdmins.totalMembers')}</p>
                <p className="text-2xl font-bold">{orgMembers.length}</p>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl border" style={{ background: 'var(--card)' }}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10 dark:bg-purple-500/20">
                <Shield className="w-5 h-5 text-purple-500 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('manageAdmins.admins')}</p>
                <p className="text-2xl font-bold">{admins.length}</p>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl border" style={{ background: 'var(--card)' }}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10 dark:bg-green-500/20">
                <UserCheck className="w-5 h-5 text-green-500 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('manageAdmins.active')}</p>
                <p className="text-2xl font-bold">{orgMembers.filter((m) => m.isActive).length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Admins Section */}
        <div className="mb-8">
          <div className="mb-4">
            <h2
              className="text-2xl sm:text-3xl font-bold flex items-center gap-2 mb-4"
              style={{ color: 'var(--text-primary)' }}
            >
              <Shield className="w-6 h-6 text-purple-500" />
              {t('manageAdmins.currentAdmins')}
            </h2>
          </div>

          {admins.length > 0 ? (
            <div className="space-y-3 mb-6">
              {admins.map((admin) => (
                <div
                  key={admin._id}
                  className="p-4 rounded-xl border flex items-center justify-between hover:shadow-md transition-all"
                  style={{ background: 'var(--card)' }}
                >
                  <div className="flex items-center gap-4 flex-1">
                    {admin.avatarUrl && (
                      <img
                        src={admin.avatarUrl}
                        alt={admin.name}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    )}
                    {!admin.avatarUrl && (
                      <div className="w-12 h-12 rounded-full bg-purple-500/20 border border-purple-500/40 flex items-center justify-center">
                        <Shield className="w-6 h-6 text-purple-500" />
                      </div>
                    )}
                    <div className="flex-1">
                      <h3
                        className="font-semibold flex items-center gap-2"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {admin.name}
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-400">
                          {t('manageAdmins.admin')}
                        </span>
                      </h3>
                      <p className="text-sm text-muted-foreground">{admin.email}</p>
                      {admin.department && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {admin.department}
                          {admin.position && ` • ${admin.position}`}
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => handleAction(admin._id, 'demote')}
                    disabled={isLoading}
                    className="p-2 rounded-lg hover:bg-red-500/10 text-red-500 transition-colors disabled:opacity-50"
                    title={t('superadmin.removeAdminRole')}
                  >
                    <UserX className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div
              className="p-6 rounded-xl border text-center"
              style={{ background: 'var(--card)' }}
            >
              <AlertCircle className="w-12 h-12 mx-auto mb-3 text-yellow-500 opacity-50" />
              <p className="text-muted-foreground">{t('manageAdmins.noAdminsYet')}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('manageAdmins.noAdminsHint')}</p>
            </div>
          )}
        </div>

        {/* Employees Section */}
        <div>
          <h2
            className="text-2xl sm:text-3xl font-bold flex items-center gap-2 mb-4"
            style={{ color: 'var(--text-primary)' }}
          >
            <Users className="w-6 h-6 text-blue-500" />
            {t('manageAdmins.employees')} {employees.length > 0 && `(${employees.length})`}
          </h2>

          {employees.length > 0 ? (
            <div className="space-y-3">
              {employees.map((employee) => (
                <div
                  key={employee._id}
                  className="p-4 rounded-xl border flex items-center justify-between hover:shadow-md transition-all group"
                  style={{ background: 'var(--card)' }}
                >
                  <div className="flex items-center gap-4 flex-1">
                    {employee.avatarUrl && (
                      <img
                        src={employee.avatarUrl}
                        alt={employee.name}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    )}
                    {!employee.avatarUrl && (
                      <div className="w-12 h-12 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center">
                        <Users className="w-6 h-6 text-blue-500" />
                      </div>
                    )}
                    <div className="flex-1">
                      <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {employee.name}
                      </h3>
                      <p className="text-sm text-muted-foreground">{employee.email}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {employee.department && (
                          <p className="text-xs text-muted-foreground">
                            {employee.department}
                            {employee.position && ` • ${employee.position}`}
                          </p>
                        )}
                        {!employee.isApproved && (
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {t('manageAdmins.pendingApproval')}
                          </span>
                        )}
                        {!employee.isActive && (
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-500/10 text-red-600 dark:text-red-400">
                            {t('manageAdmins.inactive')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleAction(employee._id, 'promote')}
                    disabled={isLoading || !employee.isApproved || !employee.isActive}
                    className="p-2 rounded-lg hover:bg-green-500/10 text-green-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={
                      !employee.isApproved
                        ? t('manageAdmins.cannotPromoteUnapproved')
                        : !employee.isActive
                          ? t('manageAdmins.cannotPromoteInactive')
                          : t('manageAdmins.makeAdmin')
                    }
                  >
                    <UserCheck className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div
              className="p-6 rounded-xl border text-center"
              style={{ background: 'var(--card)' }}
            >
              <Users className="w-12 h-12 mx-auto mb-3 text-blue-500 opacity-50" />
              <p className="text-muted-foreground">{t('manageAdmins.noEmployees')}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('manageAdmins.noEmployeesHint')}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
          >
            <DialogHeader className="pb-4">
              {/* Icon Badge */}
              <div
                className="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
                style={{
                  background:
                    actionType === 'promote'
                      ? 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05))'
                      : 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.05))',
                }}
              >
                {actionType === 'promote' ? (
                  <ShieldCheck className="w-7 h-7 text-green-600 dark:text-green-400" />
                ) : (
                  <ShieldAlert className="w-7 h-7 text-red-600 dark:text-red-400" />
                )}
              </div>

              <DialogTitle className="text-center text-lg">
                {actionType === 'promote' ? t('ui.makeAdminTitle') : t('ui.removeAdminTitle')}
              </DialogTitle>
            </DialogHeader>

            <DialogDescription className="text-center text-sm text-muted-foreground pb-4">
              {actionType === 'promote' ? (
                <Trans
                  i18nKey="ui.makeAdminConfirm"
                  values={{
                    name: selectedMember?.name,
                    email: selectedMember?.email,
                    org: organization.name,
                  }}
                  components={[
                    <strong key="0" className="text-foreground" />,
                    <span key="1" className="text-muted-foreground" />,
                    <strong key="2" className="text-foreground" />,
                  ]}
                />
              ) : (
                <Trans
                  i18nKey="ui.removeAdminConfirm"
                  values={{ name: selectedMember?.name, email: selectedMember?.email }}
                  components={[
                    <strong key="0" className="text-foreground" />,
                    <span key="1" className="text-muted-foreground" />,
                  ]}
                />
              )}
            </DialogDescription>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setShowConfirm(false)}
                disabled={isLoading}
                className="flex-1"
              >
                {isLoading ? t('ui.processing') : t('ui.cancel')}
              </Button>
              <Button
                onClick={actionType === 'promote' ? handlePromoteAdmin : handleRemoveAdmin}
                disabled={isLoading}
                className="flex-1"
                style={{
                  background:
                    actionType === 'promote'
                      ? 'linear-gradient(135deg, #16a34a, #15803d)'
                      : 'linear-gradient(135deg, #dc2626, #b91c1c)',
                }}
              >
                {isLoading ? (
                  <>
                    <ShieldLoader size="xs" variant="inline" className="mr-2" />
                    {t('ui.processing')}
                  </>
                ) : actionType === 'promote' ? (
                  t('ui.makeAdmin')
                ) : (
                  t('ui.removeAdmin')
                )}
              </Button>
            </DialogFooter>
          </motion.div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
