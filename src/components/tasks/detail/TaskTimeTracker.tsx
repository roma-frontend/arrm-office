'use client';

/**
 * Time on this task: the running timer, the log, and the estimate it is measured
 * against.
 *
 * The timer is global to a person, not to a panel — `taskTime.runningTimer` answers
 * "where is your timer" regardless of which task is on screen. That matters here
 * because the honest thing for this panel to say when a timer runs elsewhere is
 * *"running on Invoice Acme"*, with a button that moves it; a panel that only knew
 * about its own task would offer a fresh Start and silently close the other one.
 * The server does the swap in one mutation and reports what it stopped.
 *
 * Manual entry exists because the timer is always started late. It takes minutes
 * the way people say them — `90`, `1h30`, `1:30` — since making somebody convert to
 * minutes is how a time log stops being filled in.
 */

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { Clock, Pause, Play, Plus } from 'lucide-react';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  PanelCard,
  PanelEmpty,
  PanelRemoveButton,
  PanelRow,
  formatMinutes,
  usePanelWrite,
} from './panelChrome';

export interface TaskTimeTrackerProps {
  taskId: Id<'tasks'>;
  readOnly?: boolean;
}

/**
 * Minutes from what somebody typed: `90`, `1h30`, `1h 30m`, `1:30`, `2h`.
 *
 * Returns `null` for anything it cannot read, so the caller can refuse rather than
 * log a confident zero. A bare number is minutes — the unit the field asks for —
 * because guessing hours from `2` would silently log 120 minutes.
 */
export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase();
  if (text === '') return null;

  const colon = /^(\d+):([0-5]?\d)$/.exec(text);
  if (colon) return Number(colon[1]) * 60 + Number(colon[2]);

  const units = /^(?:(\d+(?:[.,]\d+)?)\s*h)?\s*(?:(\d+)\s*m)?$/.exec(text);
  if (units && (units[1] !== undefined || units[2] !== undefined)) {
    const hours = units[1] ? Number(units[1].replace(',', '.')) : 0;
    const minutes = units[2] ? Number(units[2]) : 0;
    return Math.round(hours * 60 + minutes);
  }

  const bare = /^\d+$/.exec(text);
  if (bare) return Number(text);

  return null;
}

export function TaskTimeTracker({ taskId, readOnly }: TaskTimeTrackerProps) {
  const { t } = useTranslation();
  const { run, busy } = usePanelWrite();

  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const log = useQuery(api.taskTime.listEntries, { taskId });
  const running = useQuery(api.taskTime.runningTimer, {});

  const startTimer = useMutation(api.taskTime.startTimer);
  const stopTimer = useMutation(api.taskTime.stopTimer);
  const addManualEntry = useMutation(api.taskTime.addManualEntry);
  const removeEntry = useMutation(api.taskTime.removeEntry);

  const entries = log?.entries ?? [];
  const byUser = log?.byUser ?? [];
  const totalMinutes = log?.totalMinutes ?? 0;
  const estimate = log?.estimateMinutes;

  const runningHere = running?.taskId === taskId;
  const runningElsewhere = running !== null && running !== undefined && !runningHere;
  const overEstimate = estimate !== undefined && estimate > 0 && totalMinutes > estimate;

  const handleAdd = async () => {
    const minutes = parseDuration(amount);
    if (minutes === null || minutes <= 0) return;
    const ok = await run(() =>
      addManualEntry({
        taskId,
        minutes,
        ...(note.trim() === '' ? {} : { note: note.trim() }),
      }),
    );
    if (ok) {
      setAmount('');
      setNote('');
      setAdding(false);
    }
  };

  return (
    <PanelCard
      icon={Clock}
      title={t('taskPanels.timeTracked', 'Time tracked')}
      action={
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {estimate !== undefined && estimate > 0
              ? t('taskPanels.spentOfEstimate', '{{spent}} of {{estimate}}', {
                  spent: formatMinutes(totalMinutes),
                  estimate: formatMinutes(estimate),
                })
              : formatMinutes(totalMinutes)}
          </span>
          {!readOnly &&
            (runningHere ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void run(() => stopTimer({}))}
                className="gap-1"
              >
                <Pause className="h-3.5 w-3.5" />
                {t('taskPanels.stopTimer', 'Stop')}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void run(() => startTimer({ taskId }))}
                className="gap-1"
              >
                <Play className="h-3.5 w-3.5" />
                {t('taskPanels.startTimer', 'Start')}
              </Button>
            ))}
        </div>
      }
    >
      {runningElsewhere && (
        // Said before the Start button is used, not after: pressing Start here
        // stops that one, and finding out afterwards is finding out too late.
        <p className="rounded-lg bg-(--warning-quiet) px-2.5 py-2 text-xs text-(--warning-text)">
          {t(
            'taskPanels.timerElsewhere',
            'Your timer is running on “{{title}}” — starting here stops it',
            {
              title: running.taskTitle,
            },
          )}
        </p>
      )}

      {estimate !== undefined && estimate > 0 && (
        <div className="space-y-1">
          <span className="block h-1.5 overflow-hidden rounded-full bg-(--surface-3)">
            <span
              className={cn(
                'block h-full rounded-full transition-all',
                overEstimate ? 'bg-(--danger-solid)' : 'bg-(--brand)',
              )}
              style={{ width: `${Math.min(100, Math.round((totalMinutes / estimate) * 100))}%` }}
            />
          </span>
          {overEstimate && (
            <p className="text-[11px] text-(--danger-text)">
              {t('taskPanels.overEstimate', '{{over}} over the estimate', {
                over: formatMinutes(totalMinutes - estimate),
              })}
            </p>
          )}
        </div>
      )}

      {byUser.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {byUser.map((person) => (
            <span
              key={person.userId}
              className="rounded-full bg-(--surface-2) px-2 py-0.5 text-[11px] text-(--text-2)"
            >
              {person.userName} · {formatMinutes(person.minutes)}
            </span>
          ))}
        </div>
      )}

      {entries.length === 0 ? (
        <PanelEmpty>{t('taskPanels.noTimeLogged', 'No time logged yet')}</PanelEmpty>
      ) : (
        <div className="-mx-1.5">
          {entries.map((entry) => (
            <PanelRow key={entry._id}>
              <span
                className={cn(
                  'h-2 w-2 shrink-0 rounded-full',
                  entry.isRunning ? 'animate-pulse bg-(--success-solid)' : 'bg-(--text-3)',
                )}
                aria-hidden="true"
              />
              <span className="w-16 shrink-0 text-sm font-medium tabular-nums">
                {entry.isRunning
                  ? t('taskPanels.running', 'running')
                  : formatMinutes(entry.durationMinutes)}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {entry.note || entry.userName}
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {new Date(entry.startedAt).toLocaleDateString()}
              </span>
              {!readOnly && !entry.isRunning && (
                <PanelRemoveButton
                  disabled={busy}
                  onClick={() => void run(() => removeEntry({ entryId: entry._id }))}
                  label={t('taskPanels.removeEntry', 'Delete entry')}
                />
              )}
            </PanelRow>
          ))}
        </div>
      )}

      {!readOnly &&
        (adding ? (
          <div className="flex flex-wrap gap-2">
            <Input
              autoFocus
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleAdd();
                }
                if (event.key === 'Escape') setAdding(false);
              }}
              placeholder={t('taskPanels.durationPlaceholder', '90, 1h 30m')}
              aria-label={t('taskPanels.duration', 'Time spent')}
              className="h-9 w-28"
            />
            <Input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleAdd();
                }
                if (event.key === 'Escape') setAdding(false);
              }}
              placeholder={t('taskPanels.notePlaceholder', 'What was done (optional)')}
              aria-label={t('taskPanels.notePlaceholder', 'What was done (optional)')}
              className="h-9 min-w-40 flex-1"
            />
            <Button
              type="button"
              size="sm"
              disabled={busy || parseDuration(amount) === null}
              onClick={() => void handleAdd()}
            >
              {t('taskPanels.logTime', 'Log')}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setAdding(true)}
            className="gap-1 text-muted-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('taskPanels.addTime', 'Log time manually')}
          </Button>
        ))}
    </PanelCard>
  );
}

export default TaskTimeTracker;
