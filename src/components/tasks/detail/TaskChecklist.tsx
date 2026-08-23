'use client';

/**
 * The steps inside one task.
 *
 * A checklist item is not a task: it has no status set, no reporting, no place in
 * anybody's list of work. That is the point — most of what people write down while
 * doing a job ("check the invoice number", "wait for the signed copy") does not
 * deserve to become an assignable row, and making it one is how a task list turns
 * into noise. {@link SubtaskList} is the other side of that line.
 *
 * Order is the user's, not the database's, so the rows drag. The drag is local
 * until it lands, then `reorderChecklistItems` is sent the whole new order — the
 * server renumbers from the list rather than from an index, so a drag past several
 * rows is one round trip. The local order is kept afterwards only because it now
 * agrees with the server's; if the write is refused it is dropped and the list
 * springs back to what is actually stored.
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { CheckSquare, GripVertical, Plus } from 'lucide-react';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { PanelCard, PanelEmpty, PanelRemoveButton, PanelRow, usePanelWrite } from './panelChrome';

export interface TaskChecklistProps {
  taskId: Id<'tasks'>;
  /** Hidden controls when the caller may only read the task. */
  readOnly?: boolean;
}

export function TaskChecklist({ taskId, readOnly }: TaskChecklistProps) {
  const { t } = useTranslation();
  const { run, busy } = usePanelWrite();

  const [title, setTitle] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [dragging, setDragging] = useState<number | null>(null);
  /** The order this browser last asked for, honoured until it is refused. */
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);

  const stored = useQuery(api.taskRelations.listChecklist, { taskId });
  const addItem = useMutation(api.taskRelations.addChecklistItem);
  const toggleItem = useMutation(api.taskRelations.toggleChecklistItem);
  const updateItem = useMutation(api.taskRelations.updateChecklistItem);
  const removeItem = useMutation(api.taskRelations.removeChecklistItem);
  const reorderItems = useMutation(api.taskRelations.reorderChecklistItems);

  const rows = stored ?? [];

  /**
   * Rows in the order to draw them: the local one where it covers a row, then
   * anything that arrived since — an item a colleague added mid-drag belongs at
   * the end, not missing.
   */
  const items = useMemo(() => {
    if (!localOrder) return rows;
    const byId = new Map(rows.map((row) => [String(row._id), row]));
    const known = new Set(localOrder);
    const ordered = localOrder.map((id) => byId.get(id)).filter((row) => row !== undefined);
    return [...ordered, ...rows.filter((row) => !known.has(String(row._id)))];
  }, [rows, localOrder]);

  const done = items.filter((item) => item.isDone).length;
  const percent = items.length === 0 ? 0 : Math.round((done / items.length) * 100);

  const handleAdd = async () => {
    const trimmed = title.trim();
    if (trimmed === '' || busy) return;
    const ok = await run(() => addItem({ taskId, title: trimmed }));
    if (ok) setTitle('');
  };

  const commitTitle = async (itemId: Id<'taskChecklistItems'>, original: string) => {
    const trimmed = draft.trim();
    setEditingId(null);
    if (trimmed === '' || trimmed === original) return;
    await run(() => updateItem({ itemId, title: trimmed }));
  };

  const handleDrop = async (from: number, to: number) => {
    if (from === to) return;
    const next = items.map((item) => String(item._id));
    const moved = next.splice(from, 1)[0];
    if (moved === undefined) return;
    next.splice(to, 0, moved);
    setLocalOrder(next);
    const ok = await run(() =>
      reorderItems({ taskId, itemIds: next as Id<'taskChecklistItems'>[] }),
    );
    if (!ok) setLocalOrder(null);
  };

  return (
    <PanelCard
      icon={CheckSquare}
      title={t('taskPanels.checklist', 'Checklist')}
      count={items.length}
      action={
        items.length > 0 ? (
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-1.5 w-24 overflow-hidden rounded-full bg-(--surface-3)">
              <span
                className="block h-full rounded-full bg-(--success-solid) transition-all"
                style={{ width: `${percent}%` }}
              />
            </span>
            {t('taskPanels.doneOf', '{{done}} of {{total}} done', { done, total: items.length })}
          </span>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <PanelEmpty>{t('taskPanels.noChecklist', 'Nothing on the checklist yet')}</PanelEmpty>
      ) : (
        <div className="-mx-1.5">
          {items.map((item, index) => (
            <PanelRow
              key={item._id}
              className={dragging === index ? 'opacity-50' : undefined}
              draggable={!readOnly && editingId === null}
              onDragStart={() => setDragging(index)}
              onDragEnd={() => setDragging(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const from = dragging;
                setDragging(null);
                if (from !== null) void handleDrop(from, index);
              }}
            >
              {!readOnly && (
                <GripVertical
                  className="h-3.5 w-3.5 shrink-0 cursor-grab text-(--text-3) opacity-0 group-hover:opacity-100"
                  aria-hidden="true"
                />
              )}
              <input
                type="checkbox"
                checked={item.isDone}
                disabled={readOnly}
                onChange={() => void run(() => toggleItem({ itemId: item._id }))}
                aria-label={t('taskPanels.toggleChecklistItem', 'Mark done')}
                className="h-4 w-4 shrink-0 accent-(--success-solid)"
              />

              {editingId === String(item._id) ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onBlur={() => void commitTitle(item._id, item.title)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void commitTitle(item._id, item.title);
                    }
                    // Escape means "leave it as it was", so the draft is dropped
                    // without a write rather than saved as typed so far.
                    if (event.key === 'Escape') setEditingId(null);
                  }}
                  className="min-w-0 flex-1 rounded-md border border-(--border) bg-(--background) px-1.5 py-0.5 text-sm outline-none focus:ring-2 focus:ring-(--primary)/30"
                />
              ) : (
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => {
                    setEditingId(String(item._id));
                    setDraft(item.title);
                  }}
                  className={cn(
                    'min-w-0 flex-1 truncate text-left text-sm',
                    item.isDone && 'text-muted-foreground line-through',
                    !readOnly && 'hover:underline hover:underline-offset-2',
                  )}
                >
                  {item.title}
                </button>
              )}

              {item.assignee && (
                <Avatar className="h-5 w-5 shrink-0" title={item.assignee.name}>
                  <AvatarImage src={item.assignee.avatarUrl} alt={item.assignee.name} />
                  <AvatarFallback className="text-[9px]">
                    {item.assignee.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
              )}

              {!readOnly && (
                <PanelRemoveButton
                  disabled={busy}
                  onClick={() => void run(() => removeItem({ itemId: item._id }))}
                  label={t('taskPanels.removeChecklistItem', 'Delete item')}
                />
              )}
            </PanelRow>
          ))}
        </div>
      )}

      {!readOnly && (
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
            placeholder={t('taskPanels.checklistPlaceholder', 'Add an item and press Enter')}
            aria-label={t('taskPanels.checklistPlaceholder', 'Add an item and press Enter')}
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

export default TaskChecklist;
