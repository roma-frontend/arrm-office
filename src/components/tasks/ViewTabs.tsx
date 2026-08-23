'use client';

/**
 * The saved-view tabs: *Board · List · Payable Outstanding · Calendar · Table · ＋ View*.
 *
 * A saved view is a whole board state under a name — mode, grouping, sort,
 * filters, the lot — stored in `taskViews` and shared with the team or kept
 * private. It is the difference between "let me filter this" and "this is the
 * Payable Outstanding board", which is the thing a team comes back to every week.
 *
 * ## The dirty marker
 *
 * Selecting a tab loads its state; changing anything afterwards leaves the tab
 * selected but the board no longer matching it. Rather than silently saving (which
 * would rewrite a shared view under a colleague's feet) or silently deselecting
 * (which loses the name you were working under), the tab shows a dot and offers
 * *Save changes* — so an edit to a team view is always deliberate.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Lock, MoreHorizontal, Plus, Trash2, Users } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/** A saved view as the tabs need it — a structural subset of the Convex document. */
export interface SavedViewTab {
  _id: string;
  name: string;
  type: string;
  visibility: 'private' | 'team';
  isDefault?: boolean;
  /** From `listViews`: false for a team view the viewer may see but not change. */
  canEdit?: boolean;
}

interface ViewTabsProps {
  views: readonly SavedViewTab[];
  /** The selected view's id, or `''` for the unsaved board. */
  activeId: string;
  /** True when the board no longer matches the selected view. */
  dirty: boolean;
  canShare: boolean;
  onSelect: (viewId: string) => void;
  onCreate: (name: string, visibility: 'private' | 'team') => Promise<unknown> | void;
  onUpdate: (viewId: string) => Promise<unknown> | void;
  onRename: (viewId: string, name: string) => Promise<unknown> | void;
  onDelete: (viewId: string) => Promise<unknown> | void;
  onSetDefault: (viewId: string) => Promise<unknown> | void;
}

const TAB_BASE =
  'flex items-center gap-1.5 border-b-2 px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors';

const MENU_ROW =
  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-(--background-subtle)';

/** The per-tab menu: rename, share, default, delete. */
function ViewMenu({
  view,
  onRename,
  onDelete,
  onSetDefault,
}: {
  view: SavedViewTab;
  onRename: (name: string) => void;
  onDelete: () => void;
  onSetDefault: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(view.name);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setName(view.name);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          title={t('tasksTable.viewOptions', 'View options')}
          aria-label={t('tasksTable.viewOptions', 'View options')}
          className="rounded p-0.5 text-(--text-muted) opacity-0 group-hover/tab:opacity-100 focus-visible:opacity-100 hover:text-(--text-primary)"
        >
          <MoreHorizontal aria-hidden className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1.5">
        <input
          value={name}
          aria-label={t('tasksTable.viewName', 'View name')}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            const trimmed = name.trim();
            if (trimmed && trimmed !== view.name) onRename(trimmed);
            setOpen(false);
          }}
          className="mb-1 w-full rounded-md border border-(--border) bg-(--background) px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-(--brand-outline)"
        />
        {!view.isDefault && (
          <button
            type="button"
            onClick={() => {
              onSetDefault();
              setOpen(false);
            }}
            className={MENU_ROW}
          >
            <Check aria-hidden className="h-3.5 w-3.5 text-(--text-muted)" />
            {t('tasksTable.makeDefault', 'Make default')}
          </button>
        )}
        <p className="flex items-center gap-2 px-2 py-1.5 text-xs text-(--text-muted)">
          {view.visibility === 'team' ? (
            <Users aria-hidden className="h-3.5 w-3.5" />
          ) : (
            <Lock aria-hidden className="h-3.5 w-3.5" />
          )}
          {view.visibility === 'team'
            ? t('tasksTable.sharedWithTeam', 'Shared with the team')
            : t('tasksTable.privateView', 'Only you can see this')}
        </p>
        <button
          type="button"
          onClick={() => {
            onDelete();
            setOpen(false);
          }}
          className={cn(MENU_ROW, 'text-(--danger-text) hover:bg-(--danger-quiet)')}
        >
          <Trash2 aria-hidden className="h-3.5 w-3.5" />
          {t('common.delete', 'Delete')}
        </button>
      </PopoverContent>
    </Popover>
  );
}

/** The "＋ View" popover: name it, and decide who sees it. */
function CreateView({
  canShare,
  onCreate,
}: {
  canShare: boolean;
  onCreate: (name: string, visibility: 'private' | 'team') => Promise<unknown> | void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await onCreate(trimmed, shared && canShare ? 'team' : 'private');
      setName('');
      setShared(false);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex shrink-0 items-center gap-1 border-b-2 border-transparent px-2 py-1.5 text-sm text-(--text-muted) hover:text-(--text-primary)"
        >
          <Plus aria-hidden className="h-3.5 w-3.5" />
          {t('tasksTable.addView', 'View')}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <p className="pb-1.5 text-xs text-(--text-muted)">
          {t('tasksTable.saveViewHint', 'Saves the current filters, grouping and columns.')}
        </p>
        <input
          autoFocus
          value={name}
          placeholder={t('tasksTable.viewNamePlaceholder', 'Payable Outstanding')}
          aria-label={t('tasksTable.viewName', 'View name')}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void submit();
            }
          }}
          className="w-full rounded-md border border-(--border) bg-(--background) px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-(--brand-outline)"
        />
        {canShare && (
          <label className="mt-2 flex items-center gap-2 text-sm text-(--text-secondary)">
            <input
              type="checkbox"
              checked={shared}
              onChange={(event) => setShared(event.target.checked)}
              className="h-3.5 w-3.5 accent-(--brand)"
            />
            {t('tasksTable.shareWithTeam', 'Share with the team')}
          </label>
        )}
        <button
          type="button"
          disabled={!name.trim() || busy}
          onClick={() => void submit()}
          className="mt-2 w-full rounded-md bg-(--brand) px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {t('tasksTable.saveView', 'Save view')}
        </button>
      </PopoverContent>
    </Popover>
  );
}

export function ViewTabs({
  views,
  activeId,
  dirty,
  canShare,
  onSelect,
  onCreate,
  onUpdate,
  onRename,
  onDelete,
  onSetDefault,
}: ViewTabsProps) {
  const { t } = useTranslation();
  const active = views.find((view) => view._id === activeId);

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto border-b border-(--border)">
      <button
        type="button"
        onClick={() => onSelect('')}
        className={cn(
          TAB_BASE,
          activeId === ''
            ? 'border-(--brand) font-medium text-(--text-primary)'
            : 'border-transparent text-(--text-muted) hover:text-(--text-primary)',
        )}
      >
        {t('tasksTable.allTasks', 'All tasks')}
      </button>

      {views.map((view) => (
        <div key={view._id} className="group/tab flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => onSelect(view._id)}
            className={cn(
              TAB_BASE,
              view._id === activeId
                ? 'border-(--brand) font-medium text-(--text-primary)'
                : 'border-transparent text-(--text-muted) hover:text-(--text-primary)',
            )}
          >
            {view.visibility === 'private' && (
              <Lock aria-hidden className="h-3 w-3 shrink-0 opacity-60" />
            )}
            {view.name}
            {view._id === activeId && dirty && (
              <span
                aria-hidden
                title={t('tasksTable.unsavedChanges', 'Unsaved changes')}
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-(--brand)"
              />
            )}
          </button>
          {view.canEdit !== false && (
            <ViewMenu
              view={view}
              onRename={(name) => void onRename(view._id, name)}
              onDelete={() => void onDelete(view._id)}
              onSetDefault={() => void onSetDefault(view._id)}
            />
          )}
        </div>
      ))}

      {/* Only offered on the tab you are actually looking at, and only when it
          differs from what is stored — a Save button that saves nothing teaches
          people to distrust it. */}
      {active && dirty && active.canEdit !== false && (
        <button
          type="button"
          onClick={() => void onUpdate(active._id)}
          className="ml-1 shrink-0 rounded-md bg-(--brand-quiet) px-2 py-1 text-xs font-medium text-(--brand-text) hover:bg-(--brand-outline)"
        >
          {t('tasksTable.saveChanges', 'Save changes')}
        </button>
      )}

      <div className="ml-auto shrink-0">
        <CreateView canShare={canShare} onCreate={onCreate} />
      </div>
    </div>
  );
}
