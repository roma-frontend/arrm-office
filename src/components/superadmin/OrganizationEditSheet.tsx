'use client';

/**
 * Organization edit in a slide-over, opened from the superadmin organizations
 * list.
 *
 * Same reasoning as the task wizard sheet: the list is the superadmin's
 * workbench, and navigating away to a full edit page unmounts the tabs,
 * filters and scroll position they were reading. The form is identical to the
 * standalone /superadmin/organizations/[id]/edit page — both hosts share
 * OrganizationEditForm — but leaving the sheet costs no re-orientation.
 */

import React from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from 'react-i18next';

import { DetailSheet } from '@/components/ui/detail-sheet';
import { ShieldLoader } from '@/components/ui/ShieldLoader';

const OrganizationEditForm = dynamic(
  () => import('@/components/superadmin/OrganizationEditForm').then((m) => m.OrganizationEditForm),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-64 items-center justify-center">
        <ShieldLoader size="md" />
      </div>
    ),
  },
);

export interface OrganizationEditSheetProps {
  open: boolean;
  onClose: () => void;
  orgId: string;
}

export function OrganizationEditSheet({ open, onClose, orgId }: OrganizationEditSheetProps) {
  const { t } = useTranslation();

  return (
    <DetailSheet
      open={open}
      onClose={onClose}
      size="lg"
      title={t('organization.editPageTitle')}
      deepLink={`/superadmin/organizations/${orgId}/edit`}
    >
      {open && <OrganizationEditForm orgId={orgId} onDone={onClose} />}
    </DetailSheet>
  );
}

export default OrganizationEditSheet;
