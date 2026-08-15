'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Mail,
  Phone,
  Building2,
  Briefcase,
} from 'lucide-react';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';

const RoleBadge = ({ role }: { role: string }) => {
  const { t } = useTranslation();
  const variants: Record<string, string> = {
    admin: 'bg-(--danger-quiet) text-(--danger-text)',
    superadmin: 'bg-(--purple-quiet) text-(--purple-text)',
    supervisor: 'bg-(--brand-quiet) text-(--brand-text)',
    employee: 'bg-(--success-quiet) text-(--success-text)',
    driver: 'bg-(--warning-quiet) text-(--warning-text)',
  };

  return (
    <Badge className={`${variants[role] || variants.employee} border-0`}>
      {t(`roles.${role}`, role.charAt(0).toUpperCase() + role.slice(1))}
    </Badge>
  );
};

const EmployeeTypeBadge = ({ type }: { type: string }) => {
  const { t } = useTranslation();
  return (
    <Badge variant="outline">
      {t(
        `employeeTypes.${type}`,
        type.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
      )}
    </Badge>
  );
};

export default function ApprovalDetailClient() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const { t, i18n } = useTranslation();
  const userId = params.id as Id<'users'>;

  const dateLocale = i18n.language === 'ru' ? ru : i18n.language === 'hy' ? hy : enUS;

  const pendingUser = useQuery(api.users.queries.getPendingUserById, { userId });
  const currentUser = useQuery(
    api.users.queries.getUserById,
    user?.id ? { userId: user.id as Id<'users'> } : 'skip',
  );

  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  const approveUser = useMutation(api.users.mutations.approveUser);
  const rejectUser = useMutation(api.users.mutations.rejectUser);

  const handleApprove = async () => {
    if (!currentUser) return;
    setIsApproving(true);
    try {
      await approveUser({ userId, adminId: currentUser._id });
      toast.success(t('ui.userApproved', { name: pendingUser?.name ?? '' }));
      router.push('/approvals');
    } catch {
      toast.error(t('ui.failedToApproveUser'));
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!currentUser) return;
    setIsRejecting(true);
    try {
      await rejectUser({ userId, adminId: currentUser._id });
      toast.success(t('ui.userRejected', { name: pendingUser?.name ?? '' }));
      router.push('/approvals');
    } catch {
      toast.error(t('ui.failedToRejectUser'));
    } finally {
      setIsRejecting(false);
    }
  };

  if (user?.role !== 'admin' && user?.role !== 'superadmin') {
    return (
      <div className="flex flex-col items-center justify-center text-center min-h-[60vh] gap-4">
        <div className="w-16 h-16 rounded-2xl bg-(--danger-quiet) flex items-center justify-center">
          <XCircle className="w-8 h-8 text-(--danger-text)" />
        </div>
        <h2 className="text-xl font-bold text-(--text-primary)">{t('ui.accessDenied')}</h2>
        <p className="text-(--text-muted) text-sm">{t('ui.onlyAdminsCanAccess')}</p>
      </div>
    );
  }

  if (!pendingUser) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const registeredAt = new Date(pendingUser.createdAt);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/approvals')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{t('ui.userApprovalDetails')}</h1>
            <p className="text-muted-foreground">
              {t('ui.pendingApproval')} - {pendingUser.name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="default" onClick={handleApprove} disabled={isApproving}>
            <CheckCircle className="mr-2 h-4 w-4" />
            {isApproving ? t('common.saving') : t('ui.approve')}
          </Button>
          <Button variant="destructive" onClick={handleReject} disabled={isRejecting}>
            <XCircle className="mr-2 h-4 w-4" />
            {isRejecting ? t('common.saving') : t('ui.reject')}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={pendingUser.avatarUrl} />
              <AvatarFallback>{pendingUser.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-xl font-semibold">{pendingUser.name}</h2>
              <p className="text-muted-foreground">{pendingUser.email}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('labels.role')}</span>
                <RoleBadge role={pendingUser.role} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('labels.type')}</span>
                <EmployeeTypeBadge type={pendingUser.employeeType} />
              </div>
              {pendingUser.phone && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{t('labels.phone')}</span>
                  <div className="flex items-center gap-1">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{pendingUser.phone}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('labels.registered')}</span>
                <span className="font-medium">
                  {format(registeredAt, 'dd MMM yyyy HH:mm', { locale: dateLocale })}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('ui.status')}</span>
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {t('ui.pending')}
                </Badge>
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="font-medium mb-3">{t('ui.contactInformation')}</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{pendingUser.email}</span>
              </div>
              {pendingUser.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{pendingUser.phone}</span>
                </div>
              )}
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="font-medium mb-3">{t('ui.employmentDetails')}</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                <span>
                  {t(`employeeTypes.${pendingUser.employeeType}`, pendingUser.employeeType)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span>{t(`roles.${pendingUser.role}`, pendingUser.role)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            {t('ui.approvalActions')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t('ui.approvalDescription')}</p>
            <div className="flex items-center gap-4">
              <Button
                variant="default"
                onClick={handleApprove}
                disabled={isApproving}
                className="flex-1"
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                {isApproving ? t('common.saving') : t('ui.approve')}
              </Button>
              <Button
                variant="outline"
                onClick={handleReject}
                disabled={isRejecting}
                className="flex-1"
              >
                <XCircle className="mr-2 h-4 w-4" />
                {isRejecting ? t('common.saving') : t('ui.reject')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
