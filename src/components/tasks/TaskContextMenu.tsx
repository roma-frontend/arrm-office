'use client';

/**
 * TaskContextMenu — a dropdown menu for every task card/row across all views.
 *
 * Appears when the user clicks the three-dot (⋮) button that shows on hover.
 * Also supports right-click via the native context menu fallback.
 *
 * The menu offers: open, edit, rename, status change, priority change,
 * duplicate, and delete. Recurring tasks get a subset (no duplicate, no
 * inline rename) because they are series definitions, not individual rows.
 */

import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Eye,
  Pencil,
  Type,
  ArrowRight,
  Flag,
  Copy,
  Trash2,
  Pause,
  Play,
  MoreVertical,
} from 'lucide-react';
import type { ReactNode } from 'react';

export interface ContextTask {
  _id: string;
  title: string;
  status?: string;
  priority?: string;
  _type?: string;
}

export interface TaskContextMenuProps {
  /** The task this menu applies to. */
  task: ContextTask;
  /** Children wrapped by the trigger — usually the task card/row itself. */
  children: ReactNode;
  /** Is the current user allowed to manage (edit/delete) tasks? */
  canManage: boolean;
  /** Open task in the detail panel. */
  onOpen: (task: ContextTask) => void;
  /** Open the task in the edit form. */
  onEdit: (task: ContextTask) => void;
  /** Start inline rename — fires with the task and a callback to commit. */
  onRename?: (task: ContextTask) => void;
  /** Change status — fires with the task id and the new status key. */
  onSetStatus: (taskId: string, statusKey: string) => void;
  /** Change priority — fires with the task id and the new priority. */
  onSetPriority: (taskId: string, priority: string) => void;
  /** Duplicate the task (not available for recurring). */
  onDuplicate?: (task: ContextTask) => void;
  /** Delete the task. */
  onDelete: (task: ContextTask) => void;
  /** Toggle active/paused for recurring tasks. */
  onToggleActive?: (task: ContextTask) => void;
}

const STATUSES = [
  { key: 'pending', color: 'bg-gray-400' },
  { key: 'in_progress', color: 'bg-blue-500' },
  { key: 'review', color: 'bg-amber-500' },
  { key: 'completed', color: 'bg-green-500' },
  { key: 'cancelled', color: 'bg-red-400' },
] as const;

const PRIORITIES = [
  { key: 'low', color: 'bg-gray-400' },
  { key: 'medium', color: 'bg-blue-500' },
  { key: 'high', color: 'bg-orange-500' },
  { key: 'urgent', color: 'bg-red-500' },
] as const;

/**
 * A small three-dot button that appears on hover.
 * Clicking it opens the dropdown menu.
 */
function TaskMenuButton({ children, onOpenChange }: { children: ReactNode; onOpenChange?: (open: boolean) => void }) {
  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClickCapture={(e) => e.stopPropagation()}
          onPointerDownCapture={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="p-1 rounded-md opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-(--background-subtle) text-(--text-muted) hover:text-(--text-primary)"
          aria-label="Task actions"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      {children}
    </DropdownMenu>
  );
}

export function TaskContextMenu({
  task,
  children,
  canManage,
  onOpen,
  onEdit,
  onRename,
  onSetStatus,
  onSetPriority,
  onDuplicate,
  onDelete,
  onToggleActive,
}: TaskContextMenuProps) {
  const { t } = useTranslation();
  const isRecurring = task._type === 'recurring';

  const statusLabel = (key: string) =>
    t(
      `taskStatus.${key === 'in_progress' ? 'inProgress' : key === 'review' ? 'inReview' : key}`,
      key,
    );
  const priorityLabel = (key: string) => t(`taskPriority.${key}`, key);

  const menuContent = (
    <DropdownMenuContent className="w-56" align="end" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      {/* ── Open / Edit ── */}
      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onOpen(task); }} className="gap-2">
        <Eye className="h-4 w-4" />
        {t('tasksClient.open', 'Open')}
      </DropdownMenuItem>

      {canManage && (
        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(task); }} className="gap-2">
          <Pencil className="h-4 w-4" />
          {t('tasksClient.edit', 'Edit')}
        </DropdownMenuItem>
      )}

      {canManage && onRename && !isRecurring && (
        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRename(task); }} className="gap-2">
          <Type className="h-4 w-4" />
          {t('tasksClient.rename', 'Rename')}
        </DropdownMenuItem>
      )}

      <DropdownMenuSeparator />

      {/* ── Status submenu ── */}
      {canManage && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2">
            <ArrowRight className="h-4 w-4" />
            {t('common.status', 'Status')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44">
            {STATUSES.map((s) => (
              <DropdownMenuItem
                key={s.key}
                onClick={() => onSetStatus(task._id, s.key)}
                disabled={task.status === s.key}
                className="gap-2"
              >
                <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${s.color}`} />
                {statusLabel(s.key)}
                {task.status === s.key && <span className="ml-auto text-xs opacity-50">✓</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}

      {/* ── Priority submenu ── */}
      {canManage && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2">
            <Flag className="h-4 w-4" />
            {t('tasksClient.priority', 'Priority')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44">
            {PRIORITIES.map((p) => (
              <DropdownMenuItem
                key={p.key}
                onClick={() => onSetPriority(task._id, p.key)}
                disabled={task.priority === p.key}
                className="gap-2"
              >
                <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${p.color}`} />
                {priorityLabel(p.key)}
                {task.priority === p.key && <span className="ml-auto text-xs opacity-50">✓</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}

      <DropdownMenuSeparator />

      {/* ── Recurring: toggle active/paused ── */}
      {canManage && isRecurring && onToggleActive && (
        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onToggleActive(task); }} className="gap-2">
          {task.status === 'cancelled' ? (
            <>
              <Play className="h-4 w-4" />
              {t('recurringTasks.resume', 'Resume')}
            </>
          ) : (
            <>
              <Pause className="h-4 w-4" />
              {t('recurringTasks.pause', 'Pause')}
            </>
          )}
        </DropdownMenuItem>
      )}

      {/* ── Duplicate (regular tasks only) ── */}
      {canManage && !isRecurring && onDuplicate && (
        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDuplicate(task); }} className="gap-2">
          <Copy className="h-4 w-4" />
          {t('tasksClient.duplicate', 'Duplicate')}
        </DropdownMenuItem>
      )}

      {/* ── Delete ── */}
      {canManage && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => onDelete(task)}
            className="gap-2 text-(--danger-text) focus:text-(--danger-text)"
          >
            <Trash2 className="h-4 w-4" />
            {t('tasksClient.delete', 'Delete')}
          </DropdownMenuItem>
        </>
      )}
    </DropdownMenuContent>
  );

  return (
    <div className="group relative">
      {children}
      {/* Three-dot button — appears on hover, positioned at the top-right of the row */}
      {canManage && (
        <div className="absolute top-1/2 -translate-y-1/2 right-2 z-10">
          <TaskMenuButton>{menuContent}</TaskMenuButton>
        </div>
      )}
    </div>
  );
}
