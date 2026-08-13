'use client';

/**
 * Task detail in a slide-over, opened from the board and the timeline.
 *
 * The board is the reason this matters more here than anywhere else: a kanban
 * column is a spatial memory aid, and navigating away from it destroys the
 * arrangement the user was reading. Opening a card in a panel leaves the columns
 * in place, so closing it costs no re-orientation.
 *
 * `onDone` is wired to the same close: after a task is deleted there is nothing
 * to return to, so the panel dismisses instead of navigating to `/tasks` — which
 * is where the user already is.
 */

import React from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from 'react-i18next';

import { DetailSheet } from '@/components/ui/detail-sheet';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import type { Id } from '../../../convex/_generated/dataModel';

const TaskDetailClient = dynamic(() => import('@/components/tasks/TaskDetailClient'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-64 items-center justify-center">
      <ShieldLoader size="md" />
    </div>
  ),
});

export interface TaskSheetProps {
  taskId: Id<'tasks'> | null;
  onClose: () => void;
  /** Title of the card that was clicked, shown before the query resolves. */
  taskTitle?: string;
}

export function TaskSheet({ taskId, onClose, taskTitle }: TaskSheetProps) {
  const { t } = useTranslation();

  return (
    <DetailSheet
      open={taskId !== null}
      onClose={onClose}
      size="xl"
      title={taskTitle || t('nav.tasks', 'Tasks')}
      {...(taskId ? { deepLink: `/tasks/${taskId}` } : {})}
    >
      {taskId && <TaskDetailClient key={taskId} taskId={taskId} onDone={onClose} />}
    </DetailSheet>
  );
}

export default TaskSheet;
