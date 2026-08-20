'use client';

/**
 * Task creation in a slide-over, opened from a project or a goal page.
 *
 * The old behaviour navigated to /tasks/new?… — a full page that unmounts the
 * project or goal the user was reading. Opening the wizard in a panel keeps the
 * context page underneath, matching TaskSheet on the board: closing the panel
 * returns to where the user was, untouched.
 *
 * The wizard is lazy-loaded because it pulls in rich step components; the sheet
 * shell renders instantly and the loader covers the fetch.
 */

import React from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from 'react-i18next';

import { DetailSheet } from '@/components/ui/detail-sheet';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import type { Id } from '@/convex/_generated/dataModel';

const CreateTaskWizard = dynamic(
  () => import('@/components/tasks/CreateTaskWizard').then((m) => m.CreateTaskWizard),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-64 items-center justify-center">
        <ShieldLoader size="md" />
      </div>
    ),
  },
);

export interface NewTaskSheetProps {
  open: boolean;
  onClose: () => void;
  /** Native Convex user id — the server hands it to the standalone page the
   *  same way, so callers pass it down rather than reaching for the auth store. */
  currentUserId: string;
  userRole: 'superadmin' | 'admin' | 'supervisor' | 'employee' | 'driver';
  /** Pre-links the task to a project (used by /tasks/new?projectId=…). */
  projectId?: Id<'projects'>;
  /** Pre-links the task to an objective (used by /tasks/new?objectiveId=…). */
  objectiveId?: Id<'objectives'>;
}

export function NewTaskSheet({
  open,
  onClose,
  currentUserId,
  userRole,
  projectId,
  objectiveId,
}: NewTaskSheetProps) {
  const { t } = useTranslation();

  const deepLink = projectId
    ? `/tasks/new?projectId=${projectId}`
    : objectiveId
      ? `/tasks/new?objectiveId=${objectiveId}`
      : '/tasks/new';

  return (
    <DetailSheet
      open={open}
      onClose={onClose}
      size="lg"
      title={t('task.createTask')}
      deepLink={deepLink}
    >
      {open && (
        <CreateTaskWizard
          className="min-h-0 flex-1"
          currentUserId={currentUserId as Id<'users'>}
          userRole={userRole as 'admin' | 'supervisor' | 'employee' | 'superadmin'}
          projectId={projectId}
          objectiveId={objectiveId}
          assigneeId={userRole === 'employee' ? (currentUserId as Id<'users'>) : undefined}
          // Same draft keys as the standalone /tasks/new page: an objective
          // link must not be stomped by the board's draft.
          draftKey={objectiveId ? `create-task:objective:${objectiveId}` : 'create-task'}
          onComplete={onClose}
          onCancel={onClose}
        />
      )}
    </DetailSheet>
  );
}

export default NewTaskSheet;
