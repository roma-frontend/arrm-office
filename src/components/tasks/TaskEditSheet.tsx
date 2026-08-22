'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from 'react-i18next';

import { DetailSheet } from '@/components/ui/detail-sheet';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import type { Id } from '../../../convex/_generated/dataModel';

const TaskEditClient = dynamic(() => import('@/components/tasks/TaskEditClient'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-64 items-center justify-center">
      <ShieldLoader size="md" />
    </div>
  ),
});

export interface TaskEditSheetProps {
  taskId: Id<'tasks'> | null;
  onClose: () => void;
  /** Task title, shown as the subtitle. */
  taskTitle?: string;
}

export function TaskEditSheet({ taskId, onClose, taskTitle }: TaskEditSheetProps) {
  const { t } = useTranslation();

  return (
    <DetailSheet
      open={taskId !== null}
      onClose={onClose}
      size="xl"
      title={t('tasksClient.editTask', 'Edit Task')}
      {...(taskTitle ? { subtitle: taskTitle } : {})}
    >
      {taskId && <TaskEditClient taskId={taskId} onClose={onClose} />}
    </DetailSheet>
  );
}

export default TaskEditSheet;
