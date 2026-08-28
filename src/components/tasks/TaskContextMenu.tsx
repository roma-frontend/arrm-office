'use client';

/**
 * TaskContextMenu — right-click context menu for task cards/rows.
 *
 * Uses Radix ContextMenu with the portal forced to document.body
 * so it always appears above overflow containers.
 *
 * Also attaches a native capture-phase contextmenu listener on the
 * trigger to ensure Radix captures the event before dnd-kit's native
 * listeners can intercept it.
 */

import { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Eye, Pencil, Type, ArrowRight, Flag, Copy, Trash2, Pause, Play } from 'lucide-react';

export interface ContextTask {
  _id: string;
  title: string;
  status?: string;
  priority?: string;
  _type?: string;
}

export interface TaskContextMenuProps {
  task: ContextTask;
  canManage: boolean;
  children: React.ReactNode;
  onOpen: (task: ContextTask) => void;
  onEdit: (task: ContextTask) => void;
  onRename?: (task: ContextTask) => void;
  onSetStatus: (taskId: string, statusKey: string) => void;
  onSetPriority: (taskId: string, priority: string) => void;
  onDuplicate?: (task: ContextTask) => void;
  onDelete: (task: ContextTask) => void;
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
 * A trigger wrapper that ensures the native contextmenu event is captured
 * in the capture phase BEFORE dnd-kit (or any other library) can intercept it.
 */
function CtxTrigger({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Capture-phase listener: fires before any bubble-phase listeners
    // from dnd-kit or other native addEventListener calls.
    const handler = (e: MouseEvent) => {
      e.stopPropagation();
    };
    el.addEventListener('contextmenu', handler, { capture: true, once: false });
    return () => el.removeEventListener('contextmenu', handler, { capture: true });
  }, []);

  return (
    <ContextMenuTrigger asChild>
      <div ref={ref}>{children}</div>
    </ContextMenuTrigger>
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

  return (
    <ContextMenu>
      <CtxTrigger>{children}</CtxTrigger>
      <ContextMenuContent
        className="w-56 z-[9999]"
        /* Force portal to document.body so it escapes any overflow containers */
        container={typeof document !== 'undefined' ? document.body : undefined}
      >
        <ContextMenuItem onClick={() => onOpen(task)} className="gap-2">
          <Eye className="h-4 w-4" />
          {t('tasksClient.open', 'Open')}
        </ContextMenuItem>

        {canManage && (
          <ContextMenuItem onClick={() => onEdit(task)} className="gap-2">
            <Pencil className="h-4 w-4" />
            {t('tasksClient.edit', 'Edit')}
          </ContextMenuItem>
        )}

        {canManage && onRename && !isRecurring && (
          <ContextMenuItem onClick={() => onRename(task)} className="gap-2">
            <Type className="h-4 w-4" />
            {t('tasksClient.rename', 'Rename')}
          </ContextMenuItem>
        )}

        <ContextMenuSeparator />

        {canManage && (
          <ContextMenuSub>
            <ContextMenuSubTrigger className="gap-2">
              <ArrowRight className="h-4 w-4" />
              {t('common.status', 'Status')}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-44 z-[9999]">
              {STATUSES.map((s) => (
                <ContextMenuItem
                  key={s.key}
                  onClick={() => onSetStatus(task._id, s.key)}
                  disabled={task.status === s.key}
                  className="gap-2"
                >
                  <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${s.color}`} />
                  {statusLabel(s.key)}
                  {task.status === s.key && <span className="ml-auto text-xs opacity-50">✓</span>}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}

        {canManage && (
          <ContextMenuSub>
            <ContextMenuSubTrigger className="gap-2">
              <Flag className="h-4 w-4" />
              {t('tasksClient.priority', 'Priority')}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-44 z-[9999]">
              {PRIORITIES.map((p) => (
                <ContextMenuItem
                  key={p.key}
                  onClick={() => onSetPriority(task._id, p.key)}
                  disabled={task.priority === p.key}
                  className="gap-2"
                >
                  <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${p.color}`} />
                  {priorityLabel(p.key)}
                  {task.priority === p.key && <span className="ml-auto text-xs opacity-50">✓</span>}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}

        <ContextMenuSeparator />

        {canManage && isRecurring && onToggleActive && (
          <ContextMenuItem onClick={() => onToggleActive(task)} className="gap-2">
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
          </ContextMenuItem>
        )}

        {canManage && !isRecurring && onDuplicate && (
          <ContextMenuItem onClick={() => onDuplicate(task)} className="gap-2">
            <Copy className="h-4 w-4" />
            {t('tasksClient.duplicate', 'Duplicate')}
          </ContextMenuItem>
        )}

        {canManage && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={() => onDelete(task)}
              className="gap-2 text-(--danger-text) focus:text-(--danger-text)"
            >
              <Trash2 className="h-4 w-4" />
              {t('tasksClient.delete', 'Delete')}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
