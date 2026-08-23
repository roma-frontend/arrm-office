'use client';

/**
 * The children of a task, inside the task.
 *
 * A subtask is a real task — it appears in its assignee's list and counts in
 * reports — so this panel is a *list of tasks*, not of strings. That is the line
 * between it and {@link TaskChecklist}: a checklist item is a note to yourself, a
 * subtask is work somebody is accountable for. Both exist in ClickUp for exactly
 * that reason, and conflating them would force every small step to become an
 * assignable, reportable row.
 *
 * The tick reuses `StatusTick` from the grid, so a board whose done column is
 * called *Shipped* ticks here too — the gesture asks the status set what "closed"
 * means rather than hard-coding `completed`.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { ListTree, Plus } from 'lucide-react';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { StatusTick } from '@/components/tasks/table/cells/BuiltInCells';
import { statusLabel } from '@/lib/taskLabels';
import { localizedTaskTitle } from '@/lib/taskTitle';
import { resolveStatus, type CanonicalTaskStatus } from '../../../../convex/lib/taskStatus';
import { PanelCard, PanelEmpty, PanelRemoveButton, PanelRow, usePanelWrite } from './panelChrome';

export interface SubtaskListProps {
  taskId: Id<'tasks'>;
  /** The parent's project, so the tick uses that board's status set. */
  projectId?: Id<'projects'>;
  /** False on a subtask's own page: nesting stops at one level. */
  canAdd?: boolean;
  /** Hidden when the caller may not write to the parent. */
  readOnly?: boolean;
}

export function SubtaskList({ taskId, projectId, canAdd = true, readOnly }: SubtaskListProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { run, busy } = usePanelWrite();
  const [title, setTitle] = useState('');

  const subtasks = useQuery(api.tasks.listSubtasks, { parentTaskId: taskId });
  const statusSet = useQuery(api.taskStatuses.resolveForProject, projectId ? { projectId } : {});
  const statuses = statusSet?.statuses ?? [];

  const createSubtask = useMutation(api.tasks.createSubtask);
  const setTaskStatus = useMutation(api.tasks.setTaskStatus);
  const deleteTasks = useMutation(api.tasks.bulkDeleteTasks);

  const rows = subtasks ?? [];
  const done = rows.filter(
    (row) => row.status === 'completed' || row.status === 'cancelled',
  ).length;

  const handleAdd = async () => {
    const trimmed = title.trim();
    if (trimmed === '' || busy) return;
    const ok = await run(() => createSubtask({ parentTaskId: taskId, title: trimmed }));
    // Cleared only on success, so a refused title is still there to correct.
    if (ok) setTitle('');
  };

  const handleRemove = async (subtaskId: Id<'tasks'>) => {
    const result = await run(() => deleteTasks({ taskIds: [subtaskId] }));
    if (!result) return;
  };

  return (
    <PanelCard
      icon={ListTree}
      title={t('taskPanels.subtasks', 'Subtasks')}
      count={rows.length}
      action={
        rows.length > 0 ? (
          <span className="text-xs text-muted-foreground">
            {t('taskPanels.doneOf', '{{done}} of {{total}} done', { done, total: rows.length })}
          </span>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <PanelEmpty>{t('taskPanels.noSubtasks', 'No subtasks yet')}</PanelEmpty>
      ) : (
        <div className="-mx-1.5">
          {rows.map((row) => {
            const current = resolveStatus(
              { status: row.status as CanonicalTaskStatus, statusKey: row.statusKey },
              statuses,
            );
            return (
              <PanelRow key={row._id}>
                <StatusTick
                  statuses={statuses}
                  status={row.status as CanonicalTaskStatus}
                  statusKey={row.statusKey}
                  readOnly={readOnly || statuses.length === 0}
                  label={t('tasksTable.toggleDone', 'Mark complete')}
                  onPick={(statusKey) =>
                    void run(() => setTaskStatus({ taskId: row._id, statusKey }))
                  }
                />
                <button
                  type="button"
                  onClick={() => router.push(`/tasks/${row._id}`)}
                  className="min-w-0 flex-1 truncate text-left text-sm hover:underline hover:underline-offset-2"
                >
                  <span
                    className={
                      current.type === 'done' || current.type === 'closed'
                        ? 'text-muted-foreground line-through'
                        : undefined
                    }
                  >
                    {localizedTaskTitle(t, row)}
                  </span>
                </button>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {statusLabel(t, current)}
                </span>
                {row.assignedToUser && (
                  <Avatar className="h-5 w-5 shrink-0" title={row.assignedToUser.name}>
                    <AvatarImage src={row.assignedToUser.avatarUrl} alt={row.assignedToUser.name} />
                    <AvatarFallback className="text-[9px]">
                      {row.assignedToUser.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                )}
                {!readOnly && (
                  <PanelRemoveButton
                    disabled={busy}
                    onClick={() => void handleRemove(row._id)}
                    label={t('taskPanels.removeSubtask', 'Delete subtask')}
                  />
                )}
              </PanelRow>
            );
          })}
        </div>
      )}

      {!readOnly && canAdd && (
        <div className="flex gap-2">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void handleAdd();
              }
            }}
            placeholder={t('taskPanels.subtaskPlaceholder', 'Add a subtask and press Enter')}
            aria-label={t('taskPanels.subtaskPlaceholder', 'Add a subtask and press Enter')}
            className="h-9"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || title.trim() === ''}
            onClick={() => void handleAdd()}
            className="gap-1"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('common.add', 'Add')}
          </Button>
        </div>
      )}
    </PanelCard>
  );
}

export default SubtaskList;
