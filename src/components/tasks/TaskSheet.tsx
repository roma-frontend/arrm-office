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
 *
 * Supports an internal edit mode: clicking Edit inside the detail view switches
 * the sheet to the edit form without navigating away.
 */

import { useState, useCallback, useEffect } from 'react';
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

const TaskEditClient = dynamic(() => import('@/components/tasks/TaskEditClient'), {
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
  /** Open the edit form in a sheet instead of navigating to the edit page. */
  onEdit?: (taskId: Id<'tasks'>) => void;
  /** Start in edit mode immediately instead of view mode. */
  initialEditing?: boolean;
}

export function TaskSheet({ taskId, onClose, taskTitle, initialEditing }: TaskSheetProps) {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<Id<'tasks'> | null>(
    initialEditing && taskId ? taskId : null,
  );

  // Reset edit mode when the task changes or the sheet closes.
  useEffect(() => {
    setEditingId(initialEditing && taskId ? taskId : null);
  }, [taskId, initialEditing]);

  const handleEdit = useCallback((id: Id<'tasks'>) => {
    setEditingId(id);
  }, []);

  const handleEditDone = useCallback(() => {
    setEditingId(null);
  }, []);

  const editing = editingId !== null;

  return (
    <DetailSheet
      open={taskId !== null}
      onClose={onClose}
      size="xl"
      title={
        editing ? t('tasksClient.editTask', 'Edit task') : taskTitle || t('nav.tasks', 'Tasks')
      }
      {...(taskId ? { deepLink: `/tasks/${taskId}` } : {})}
    >
      {editing ? (
        <TaskEditClient key={`edit-${editingId}`} taskId={editingId} onClose={handleEditDone} />
      ) : (
        taskId && (
          <TaskDetailClient key={taskId} taskId={taskId} onDone={onClose} onEdit={handleEdit} />
        )
      )}
    </DetailSheet>
  );
}

export default TaskSheet;
