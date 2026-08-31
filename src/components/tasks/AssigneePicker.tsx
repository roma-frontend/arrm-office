'use client';

/**
 * Who else is on this task.
 *
 * Built over the same roster query the wizard uses — `tasks.getUsersForAssignment`
 * already answers "who may this caller hand work to" per role: the whole
 * organization for an admin, their own reporting branch for a supervisor, only
 * themselves for an employee. Deciding that again in the browser would mean two
 * answers to one question, and only the server's is enforced.
 *
 * The person *responsible* for the task is shown but not selectable. That is the
 * same distinction the server keeps: `assignedTo` is one person, and everything
 * that reports on ownership reads it, while this list is the people working
 * alongside them. Removing a co-assignee must never be able to leave a task with
 * nobody answerable for it.
 *
 * `known` exists because the roster is scoped: an employee looking at a task can
 * see the two colleagues already on it without being able to list anybody new, and
 * a chip with no name is worse than no chip at all.
 */

import { useMemo, useState } from 'react';
import { useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { Check, Search, UserPlus, X } from 'lucide-react';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface AssigneeOption {
  _id: string;
  name: string;
  avatarUrl?: string | null;
  position?: string | null;
  department?: string | null;
}

export interface AssigneePickerProps {
  /** Co-assignees only. The responsible person is never in here. */
  value: readonly string[];
  onChange: (ids: string[]) => void;
  /** Shown as a fixed chip and kept out of the list. */
  primary?: AssigneeOption | null;
  /** Superadmins pass the org they are looking at; everyone else omits it. */
  organizationId?: Id<'organizations'>;
  /** People already on the task, so their chips read as names even off-roster. */
  known?: readonly AssigneeOption[];
  /** Mirrors `MAX_ASSIGNEES` on the server; the button stops before the refusal. */
  max?: number;
  disabled?: boolean;
  className?: string;
}

const DEFAULT_MAX = 20;

function initials(name: string): string {
  return (
    name
      .split(' ')
      .map((part) => part[0])
      .filter(Boolean)
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?'
  );
}

/** Name, position and department in one line, for the picker rows. */
function subtitleOf(user: AssigneeOption): string {
  return [user.position, user.department].filter(Boolean).join(' · ');
}

/** Unique departments extracted from candidates. */
function uniqueDepartments(candidates: AssigneeOption[]): string[] {
  const set = new Set<string>();
  for (const c of candidates) {
    if (c.department) set.add(c.department);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Sort candidates by position (lexicographic — role titles are conventional), then name. */
function sortByPositionThenName(arr: AssigneeOption[]): AssigneeOption[] {
  return [...arr].sort((a, b) => {
    const pa = (a.position ?? '').localeCompare(b.position ?? '');
    if (pa !== 0) return pa;
    return a.name.localeCompare(b.name);
  });
}

function AssigneeAvatar({ user, className }: { user: AssigneeOption; className?: string }) {
  return (
    <Avatar className={cn('h-6 w-6', className)}>
      <AvatarImage src={user.avatarUrl ?? undefined} alt={user.name} />
      <AvatarFallback className="text-[10px]">{initials(user.name)}</AvatarFallback>
    </Avatar>
  );
}

export function AssigneePicker({
  value,
  onChange,
  primary,
  organizationId,
  known,
  max = DEFAULT_MAX,
  disabled = false,
  className,
}: AssigneePickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState<string>('all');

  const roster = useQuery(
    api.tasks.getUsersForAssignment,
    disabled ? 'skip' : { organizationId: organizationId ?? undefined },
  );

  /**
   * Everybody the picker can name, roster first.
   *
   * `known` is merged in rather than concatenated so somebody who is both on the
   * task and on the roster appears once, with the roster's richer record winning.
   */
  const candidates = useMemo(() => {
    const byId = new Map<string, AssigneeOption>();
    for (const user of known ?? []) byId.set(user._id, user);
    for (const user of roster ?? []) {
      byId.set(user._id, {
        _id: user._id,
        name: user.name,
        avatarUrl: user.avatarUrl ?? null,
        position: user.position ?? null,
        department: user.department ?? null,
      });
    }
    if (primary) byId.delete(primary._id);
    return sortByPositionThenName([...byId.values()]);
  }, [roster, known, primary]);

  const selectedIds = useMemo(() => new Set(value), [value]);
  const selected = useMemo(
    () =>
      [...selectedIds].map(
        (id) =>
          candidates.find((user) => user._id === id) ?? {
            _id: id,
            // An id with no record behind it: the person left the organization, or
            // the roster does not reach them. Better a placeholder than a blank.
            name: t('taskPanels.someone', 'Someone'),
          },
      ),
    [selectedIds, candidates, t],
  );

  const departments = useMemo(() => uniqueDepartments(candidates), [candidates]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    let list = candidates;
    if (deptFilter !== 'all') {
      list = list.filter((u) => u.department === deptFilter);
    }
    if (needle === '') return list;
    return list.filter((user) =>
      [user.name, user.position, user.department]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle)),
    );
  }, [candidates, search, deptFilter]);

  const full = selectedIds.size >= max;

  const toggle = (id: string) => {
    if (selectedIds.has(id)) {
      onChange(value.filter((existing) => existing !== id));
      return;
    }
    if (full) return;
    onChange([...value, id]);
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {primary && (
        <span
          className="inline-flex items-center gap-1.5 rounded-full border border-(--brand-outline) bg-(--brand-quiet) py-0.5 pr-2 pl-0.5 text-xs font-medium"
          title={t('taskPanels.responsible', 'Responsible')}
        >
          <AssigneeAvatar user={primary} className="h-5 w-5" />
          {primary.name}
        </span>
      )}

      {selected.map((user) => (
        <span
          key={user._id}
          className="inline-flex items-center gap-1.5 rounded-full border border-(--border) bg-(--surface-2) py-0.5 pr-1 pl-0.5 text-xs"
        >
          <AssigneeAvatar user={user} className="h-5 w-5" />
          {user.name}
          {!disabled && (
            <button
              type="button"
              onClick={() => toggle(user._id)}
              aria-label={t('taskPanels.removeAssignee', 'Remove {{name}}', { name: user.name })}
              className="rounded-full p-0.5 text-(--text-3) hover:bg-(--surface-3) hover:text-(--text-1)"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}

      {!disabled && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-(--border) px-2 py-1 text-xs text-(--text-3) hover:border-(--brand-outline) hover:text-(--text-1)"
            >
              <UserPlus className="h-3.5 w-3.5" />
              {t('taskPanels.addAssignee', 'Add')}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-1.5">
            <div className="relative mb-1.5">
              <Search className="absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-(--text-3)" />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('taskPanels.searchPeople', 'Search people…')}
                aria-label={t('taskPanels.searchPeople', 'Search people…')}
                className="w-full rounded-md border border-(--border) bg-(--background) py-1.5 pr-2 pl-7 text-xs outline-none focus:ring-2 focus:ring-(--primary)/30"
              />
            </div>

            {departments.length > 1 && (
              <div className="mb-1.5 flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setDeptFilter('all')}
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    deptFilter === 'all'
                      ? 'border-(--brand-outline) bg-(--brand-quiet) text-(--brand-text)'
                      : 'border-(--border) text-(--text-3) hover:text-(--text-1)'
                  }`}
                >
                  {t('common.all', 'All')}
                </button>
                {departments.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDeptFilter(d === deptFilter ? 'all' : d)}
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                      deptFilter === d
                        ? 'border-(--brand-outline) bg-(--brand-quiet) text-(--brand-text)'
                        : 'border-(--border) text-(--text-3) hover:text-(--text-1)'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}

            {full && (
              <p className="px-2 py-1 text-[11px] text-(--warning-text)">
                {t('taskPanels.assigneeLimit', 'That is as many people as one task can hold')}
              </p>
            )}

            <div className="max-h-64 overflow-y-auto">
              {roster === undefined && candidates.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-(--text-3)">
                  {t('common.loading', 'Loading…')}
                </p>
              ) : visible.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-(--text-3)">
                  {t('tasksTable.noPeople', 'No one to assign')}
                </p>
              ) : (
                visible.map((user) => {
                  const isSelected = selectedIds.has(user._id);
                  return (
                    <button
                      key={user._id}
                      type="button"
                      onClick={() => toggle(user._id)}
                      disabled={full && !isSelected}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-(--surface-2) disabled:opacity-40"
                    >
                      <AssigneeAvatar user={user} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">{user.name}</span>
                        {subtitleOf(user) && (
                          <span className="block truncate text-[11px] text-(--text-3)">
                            {subtitleOf(user)}
                          </span>
                        )}
                      </span>
                      {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-(--brand-text)" />}
                    </button>
                  );
                })
              )}
            </div>
          </PopoverContent>
        </Popover>
      )}

      {disabled && selected.length === 0 && !primary && (
        <span className="text-xs text-(--text-3)">{t('tasksTable.unassigned', 'Unassigned')}</span>
      )}
    </div>
  );
}

export default AssigneePicker;
