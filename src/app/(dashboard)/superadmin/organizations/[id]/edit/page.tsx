'use client';

import { useQuery } from 'convex/react';
import { api } from '../../../../../../../convex/_generated/api';
import type { Id } from '../../../../../../../convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { useRouter, useParams } from 'next/navigation';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, ArrowLeft } from 'lucide-react';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { OrganizationEditForm } from '@/components/superadmin/OrganizationEditForm';

export default function EditOrganizationPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams();
  const { user } = useAuthStore();
  const orgId = params.id as string;
  const isSuperadmin = user?.role === 'superadmin';

  // Check if admin is trying to access their own organization
  const isOwnOrganization = user?.organizationId === orgId;
  const canAccess = isSuperadmin || (user?.role === 'admin' && isOwnOrganization);

  const organization = useQuery(
    api.organizations.getOrganizationById,
    user?.id && orgId && canAccess
      ? { callerUserId: user.id as Id<'users'>, organizationId: orgId as Id<'organizations'> }
      : 'skip',
  );

  const goBack = () => router.push('/superadmin/organizations');

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }

    if (!isSuperadmin && !canAccess) {
      router.push('/dashboard');
    }
  }, [user, isSuperadmin, canAccess, router]);

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <ShieldLoader size="lg" />
      </div>
    );
  }

  if (!isSuperadmin && !canAccess) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">{t('ui.accessDenied')}</h1>
          <p className="text-muted-foreground">You can only manage your own organization</p>
          <p className="text-xs text-muted-foreground mt-2">
            {t('common.superadmin')}: {user.role} | {t('common.organization')}:{' '}
            {user.organizationId} | {t('common.requestedBy')}: {orgId}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6" style={{ background: 'var(--background)' }}>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
          <div className="mb-8">
            <button
              onClick={goBack}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary mb-4 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('ui.backToOrganizations')}
            </button>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl btn-gradient text-white">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  {t('organization.editPageTitle')}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {t('organization.slugLabel')}:{' '}
                  <span className="font-mono">{organization?.slug ?? '…'}</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        <OrganizationEditForm orgId={orgId} onDone={goBack} />
      </div>
    </div>
  );
}
