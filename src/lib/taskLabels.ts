/**
 * How a status or a priority is *named* on screen.
 *
 * Statuses are half-translated by design, and that is the wrinkle this module
 * exists to hide. The five statuses of the built-in set carry a `labelKey` and go
 * through `t()`; a status an organization typed itself — *Ready to pay* — has no
 * key and is shown verbatim in every language, because it is a proper noun in
 * that organization's own vocabulary and translating it would be a guess.
 *
 * Priorities have no such wrinkle: the four are fixed, so they are keys all the
 * way down. They live here anyway so the grid, the filter builder and the group
 * selector agree on their colours without importing each other.
 */

import type { TFunction } from 'i18next';
import type { TaskColor, TaskStatusDef } from '../../convex/lib/taskStatus';

/** The label for a status, translated only if the set says it may be. */
export function statusLabel(t: TFunction, status: TaskStatusDef): string {
  return status.labelKey ? t(status.labelKey, status.label) : status.label;
}

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

/**
 * Keyed by the union so a fifth priority cannot be added without choosing a
 * colour. The colours match the ones the board has always used for these four
 * (`STATUS_CONFIG`/`PRIORITY_CONFIG` in `TasksClient.tsx`), so the grid and the
 * kanban do not disagree about what "high" looks like.
 */
export const PRIORITY_META: Record<
  TaskPriority,
  { labelKey: string; fallback: string; color: TaskColor }
> = {
  low: { labelKey: 'tasks.priority.low', fallback: 'Low', color: 'gray' },
  medium: { labelKey: 'tasks.priority.medium', fallback: 'Medium', color: 'blue' },
  high: { labelKey: 'tasks.priority.high', fallback: 'High', color: 'amber' },
  urgent: { labelKey: 'tasks.priority.urgent', fallback: 'Urgent', color: 'red' },
};

/** Lowest first — the order a picker should offer them in. */
export const TASK_PRIORITIES = Object.keys(PRIORITY_META) as TaskPriority[];

export function isTaskPriority(value: unknown): value is TaskPriority {
  return typeof value === 'string' && Object.hasOwn(PRIORITY_META, value);
}

export function priorityLabel(t: TFunction, priority: string): string {
  const meta = isTaskPriority(priority) ? PRIORITY_META[priority] : undefined;
  return meta ? t(meta.labelKey, meta.fallback) : priority;
}
