/**
 * Pending Approval Page
 *
 * Shown to users who are waiting for admin approval to join an organization.
 */

'use client';

import React from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { useOrgBranding } from '@/hooks/useOrgBranding';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, Mail, Building2, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { logger } from '@/lib/logger';

export default function PendingApprovalPage() {
  const { t } = useTranslation();
  const { user, setUser } = useAuthStore();
  const router = useRouter();

  // Get fresh user data from Convex to check if approved
  const freshUserData = useQuery(
    api.users.queries.getCurrentUser,
    user?.email ? { email: user.email } : 'skip',
  );

  const myRequests = useQuery(
    api.organizationJoinRequests.getMyJoinRequests,
    user?.id ? { userId: user.id as Id<'users'> } : 'skip',
  );

  const pendingRequest = myRequests?.find((req: { status: string }) => req.status === 'pending');
  const rejectedRequest = myRequests?.find((req: { status: string }) => req.status === 'rejected');

  // Fetch branding for the org the user requested to join
  const orgBranding = useOrgBranding(
    pendingRequest?.organizationId as Id<'organizations'> | undefined,
  );

  // Check if user was approved while on this page
  React.useEffect(() => {
    if (freshUserData?.organizationId && freshUserData?.isApproved) {
      logger.error('[PendingPage] ✅ User was approved! Redirecting to dashboard...');
      // Update auth store with fresh data
      setUser({
        id: freshUserData._id,
        name: freshUserData.name,
        email: freshUserData.email,
        role: freshUserData.role,
        organizationId: freshUserData.organizationId,
        isApproved: freshUserData.isApproved,
      });

      // Check for callback URL
      const params = new URLSearchParams(window.location.search);
      const nextUrl = params.get('next');
      const redirectUrl = nextUrl || '/dashboard';
      router.push(redirectUrl);
    }
  }, [freshUserData, setUser, router]);

  const handleSignOut = () => {
    signOut({ callbackUrl: '/login' });
  };

  if (freshUserData === undefined)
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-linear-to-br dark:bg-(--surface-3) p-4"
      style={
        orgBranding
          ? {
              background: `linear-gradient(to bottom right, ${orgBranding.primaryColor}22, ${orgBranding.secondaryColor}22)`,
            }
          : { background: 'var(--warning-solid)' }
      }
    >
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white dark:bg-(--surface-3) shadow-lg mb-4"
            style={orgBranding ? { background: orgBranding.primaryColor } : undefined}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {orgBranding?.logoUrl ? (
              <img
                src={orgBranding.logoUrl}
                alt=""
                className="w-12 h-12 object-contain rounded-full"
              />
            ) : (
              <Clock className="w-10 h-10 text-(--warning-text)" />
            )}
          </div>
          <h1 className="text-3xl font-bold mb-2">
            {t('onboarding.pendingApproval', 'Pending Approval')}
          </h1>
          <p className="text-(--text-3) dark:text-(--text-3)">
            {t('onboarding.pendingDesc', 'Your request is being reviewed by administrators')}
          </p>
        </div>

        {/* Rejected Request */}
        {rejectedRequest && (
          <Card className="mb-4 border-(--danger-outline) dark:border-(--danger-outline)">
            <CardHeader>
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-(--danger-text)" />
                <CardTitle className="text-(--danger-text) dark:text-(--danger-text)">
                  {t('onboarding.requestRejected', 'Request Rejected')}
                </CardTitle>
              </div>
              <CardDescription className="text-(--danger-text) dark:text-(--danger-text)">
                {rejectedRequest.rejectionReason || t('onboarding.noReason', 'No reason provided')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleSignOut} className="flex-1">
                  {t('onboarding.tryAnotherEmail', 'Try Another Email')}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pending Request */}
        {pendingRequest && (
          <Card className="mb-4">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-(--brand-text)" />
                <CardTitle>{t('onboarding.requestSent', 'Request Sent')}</CardTitle>
              </div>
              <CardDescription>
                {t('onboarding.waitingForApproval', 'Waiting for administrator approval')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-(--brand-quiet) dark:bg-(--brand) rounded-lg">
                <Mail className="w-5 h-5 text-(--brand-text)" />
                <div>
                  <p className="text-sm font-medium">{user?.email}</p>
                  <p className="text-xs text-(--brand-text)">
                    {t('onboarding.requestSentTo', 'Request sent to administrators')}
                  </p>
                </div>
              </div>

              <div className="p-4 bg-(--warning-quiet) dark:bg-(--warning-solid) rounded-lg">
                <p className="text-sm text-(--warning-text) dark:text-(--warning-text)">
                  💡{' '}
                  {t(
                    'onboarding.approvalTime',
                    'Administrators typically respond within 24-48 hours',
                  )}
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium text-sm">{t('onboarding.nextSteps', 'Next Steps')}:</h4>
                <ul className="text-sm text-(--text-3) dark:text-(--text-3) space-y-1">
                  <li>1. ✅ {t('onboarding.step1', 'Request submitted')}</li>
                  <li>2. ⏳ {t('onboarding.step2', 'Wait for admin approval')}</li>
                  <li>3. 📧 {t('onboarding.step3', "You'll receive an email notification")}</li>
                  <li>4. 🎉 {t('onboarding.step4', 'Access the dashboard')}</li>
                </ul>
              </div>

              <Button variant="outline" onClick={handleSignOut} className="w-full">
                {t('onboarding.checkLater', "I'll Check Later")}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* No Request */}
        {!pendingRequest && !rejectedRequest && (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-(--text-3)">
                {t('onboarding.noRequest', 'No pending requests found')}
              </p>
              <Button onClick={handleSignOut} className="mt-4">
                {t('onboarding.backToLogin', 'Back to Login')}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
