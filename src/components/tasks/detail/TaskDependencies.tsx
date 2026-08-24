'use client';

/**
 * What is holding this task up, and what it is holding up.
 *
 * Two lists rather than one, because they answer different questions and lead to
 * different actions: *waiting on* is why you cannot start, *blocking* is who is
 * waiting on you. The server stores one row per edge and folds both storage
 * directions into these two lists, so a dependency never shows up twice.
 *
 * The banner at the top is the whole reason the feature earns its place: a task
 * with an open blocker should say so before anybody picks it up. It counts only
 * blockers that are still open — a chain whose links are all finished is history,
 * not an obstacle.
 *
 * Link targets come from `tasks.getVisibleTasks`, the same query the board runs.
 * Re-deciding here which tasks a person may link to would be a second answer to a
 * question the board has already answered, and only one of them would be enforced.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Link2, Search } from 'lucide-react';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { taskColorClasses } from '@/lib/taskColors';
import { statusLabel } from '@/lib/taskLabels';
import { localizedTaskTitle } from '@/lib/taskTitle';
import {
  DEFAULT_STATUS_SET,
  resolveStatus,
  type CanonicalTaskStatus,
} from '../../../../convex/lib/taskStatus';
import { cn } from '@/lib/utils';
import { PanelCard, PanelEmpty, PanelRemoveButton, PanelRow, usePanelWrite } from './panelChrome';

/** Which way a new link points, from this task's point of view. */
type LinkDirection = 'waiting_on' | 'blocks';

export interface TaskDependenciesProps {
  taskId: Id<'tasks'>;
  projectId?: Id<'projects'>;
  readOnly?: boolean;
}

export function TaskDependencies({ taskId, projectId, readOnly }: TaskDependenciesProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { run, busy } = usePanelWrite();

  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<LinkDirection>('waiting_on');
  const [search, setSearch] = useState('');

  const graph = useQuery(api.taskRelations.listDependencies, { taskId });
  const statusSet = useQuery(api.taskStatuses.resolveForProject, projectId ? { projectId } : {});
  // Only fetched while the picker is open: the board's task list is the heaviest
  // query on the page and a closed popover has no use for it.
  const candidates = useQuery(api.tasks.getVisibleTasks, open ? {} : 'skip');

  const addDependency = useMutation(api.taskRelations.addDependency);
  const removeDependency = useMutation(api.taskRelations.removeDependency);

  const statuses = statusSet?.statuses ?? DEFAULT_STATUS_SET;
  const waitingOn = graph?.waitingOn ?? [];
  const blocking = graph?.blocking ?? [];
  const blockedByOpen = graph?.blockedByOpen ?? 0;
  const total = waitingOn.length + blocking.length;

  /** Already linked either way, plus the task itself: nothing to offer twice. */
  const linkedIds = useMemo(
    () =>
      new Set<string>([
        String(taskId),
        ...(graph?.waitingOn ?? []).map((entry) => String(entry.task._id)),
        ...(graph?.blocking ?? []).map((entry) => String(entry.task._id)),
      ]),
    [taskId, graph],
  );

  const options = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (candidates ?? [])
      .filter((candidate) => !linkedIds.has(String(candidate._id)))
      .filter((candidate) => needle === '' || candidate.title.toLowerCase().includes(needle))
      .slice(0, 40);
  }, [candidates, linkedIds, search]);

  const handleAdd = async (dependsOnTaskId: Id<'tasks'>) => {
    const ok = await run(() => addDependency({ taskId, dependsOnTaskId, type: direction }));
    if (ok) {
      setOpen(false);
      setSearch('');
    }
  };

  const renderList = (
    entries: typeof waitingOn,
    heading: string,
    emptyHint: string,
    removeLabel: string,
  ) => (
    <div className="space-y-1">
      <p className="px-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {heading}
      </p>
      {entries.length === 0 ? (
        <p className="px-1.5 text-xs text-muted-foreground">{emptyHint}</p>
      ) : (
        <div className="-mx-1.5">
          {entries.map((entry) => {
            const status = resolveStatus(
              { status: entry.task.status as CanonicalTaskStatus, statusKey: entry.task.statusKey },
              statuses,
            );
            const colors = taskColorClasses(status.color);
            return (
              <PanelRow key={entry.dependencyId}>
                <span
                  className={cn('h-2 w-2 shrink-0 rounded-full', colors.dot)}
                  aria-hidden="true"
                />
                <button
                  type="button"
                  onClick={() => router.push(`/tasks/${entry.task._id}`)}
                  className="min-w-0 flex-1 truncate text-left text-sm hover:underline hover:underline-offset-2"
                >
                  {localizedTaskTitle(t, entry.task)}
                </button>
                <span className={cn('shrink-0 text-[11px]', colors.text)}>
                  {statusLabel(t, status)}
                </span>
                {!readOnly && (
                  <PanelRemoveButton
                    disabled={busy}
                    onClick={() =>
                      void run(() => removeDependency({ dependencyId: entry.dependencyId }))
                    }
                    label={removeLabel}
                  />
                )}
              </PanelRow>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <PanelCard
      icon={Link2}
      title={t('taskPanels.dependencies', 'Dependencies')}
      count={total}
      action={
        !readOnly ? (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="rounded-md border border-dashed border-(--border) px-2 py-1 text-xs text-(--text-3) hover:border-(--brand-outline) hover:text-(--text-1)"
              >
                {t('taskPanels.addDependency', 'Link task')}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-1.5">
              <div
                role="group"
                aria-label={t('taskPanels.linkDirection', 'Direction')}
                className="mb-1.5 grid grid-cols-2 gap-1"
              >
                {(['waiting_on', 'blocks'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setDirection(option)}
                    aria-pressed={direction === option}
                    className={cn(
                      'rounded-md px-2 py-1.5 text-xs',
                      direction === option
                        ? 'bg-(--brand-quiet) font-medium text-(--brand-text)'
                        : 'text-(--text-3) hover:bg-(--surface-2)',
                    )}
                  >
                    {option === 'waiting_on'
                      ? t('taskPanels.waitingOn', 'Waiting on')
                      : t('taskPanels.blocking', 'Blocking')}
                  </button>
                ))}
              </div>

              <div className="relative mb-1.5">
                <Search className="absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-(--text-3)" />
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t('taskPanels.searchTasks', 'Search tasks…')}
                  aria-label={t('taskPanels.searchTasks', 'Search tasks…')}
                  className="w-full rounded-md border border-(--border) bg-(--background) py-1.5 pr-2 pl-7 text-xs outline-none focus:ring-2 focus:ring-(--primary)/30"
                />
              </div>

              <div className="max-h-64 overflow-y-auto">
                {candidates === undefined ? (
                  <p className="px-2 py-3 text-center text-xs text-(--text-3)">
                    {t('common.loading', 'Loading…')}
                  </p>
                ) : options.length === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-(--text-3)">
                    {t('taskPanels.noTasksToLink', 'No other tasks to link')}
                  </p>
                ) : (
                  options.map((candidate) => (
                    <button
                      key={candidate._id}
                      type="button"
                      disabled={busy}
                      onClick={() => void handleAdd(candidate._id)}
                      className="block w-full truncate rounded-md px-2 py-1.5 text-left text-xs hover:bg-(--surface-2) disabled:opacity-40"
                    >
                      {localizedTaskTitle(t, candidate)}
                    </button>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
        ) : undefined
      }
    >
      {blockedByOpen > 0 && (
        <p className="flex items-center gap-2 rounded-lg bg-(--warning-quiet) px-2.5 py-2 text-xs text-(--warning-text)">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {t('taskPanels.blockedBy', {
            count: blockedByOpen,
            defaultValue: 'Blocked by {{count}} unfinished task(s)',
          })}
        </p>
      )}

      {total === 0 ? (
        <PanelEmpty>{t('taskPanels.noDependencies', 'This task stands alone')}</PanelEmpty>
      ) : (
        <div className="space-y-3">
          {renderList(
            waitingOn,
            t('taskPanels.waitingOn', 'Waiting on'),
            t('taskPanels.noWaitingOn', 'Nothing is holding this up'),
            t('taskPanels.removeDependency', 'Unlink task'),
          )}
          {renderList(
            blocking,
            t('taskPanels.blocking', 'Blocking'),
            t('taskPanels.noBlocking', 'Not holding anything up'),
            t('taskPanels.removeDependency', 'Unlink task'),
          )}
        </div>
      )}
    </PanelCard>
  );
}

export default TaskDependencies;
