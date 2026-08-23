/**
 * Which columns the table shows, how wide, and in what order.
 *
 * Split out of `TaskTable.tsx` because two components have to agree on the answer:
 * the grid draws the columns, and the Columns menu offers the ones it is *not*
 * drawing. A second catalogue in the menu is how a board ends up with a checkbox
 * that toggles a column nobody can see.
 *
 * Pure and free of React, so the arrangement rules — an unknown key in the stored
 * order, a custom field deleted since the order was written, a width from an older
 * build — can be tested without rendering a grid.
 */

import type { TFunction } from 'i18next';
import {
  clampColumnWidth,
  defaultFieldWidth,
  fieldAlign,
  type TaskGridField,
} from '@/lib/taskFieldTypes';
import { customColumnId, customColumnKey, isCustomColumnKey, type TaskSortField } from '@/lib/taskViewState';
import type { TaskTableLayout } from '@/hooks/useTaskViewPreferences';

/** The task's own columns, as opposed to whatever the organization added. */
export type BuiltInColumnKey = 'status' | 'priority' | 'deadline' | 'assignee' | 'project';

/**
 * The title column, which is not in the catalogue at all.
 *
 * It cannot be hidden (a row with no name is not a row), it cannot be reordered
 * out of first place (it is the sticky column you scroll the others past), and it
 * is the only track that flexes. Treating it as one of the others would mean every
 * consumer re-checking those three exceptions.
 */
export const NAME_COLUMN_KEY = 'name';
/** Width the flexible name track never shrinks below. */
export const NAME_COLUMN_MIN_WIDTH = 260;
/** The trailing "＋" header cell that opens the field creator. */
export const ADD_COLUMN_WIDTH = 44;

interface BuiltInColumnDef {
  key: BuiltInColumnKey;
  labelKey: string;
  fallback: string;
  width: number;
  align: 'start' | 'end' | 'center';
  /** Absent when the column has nothing sensible to sort by. */
  sort?: TaskSortField;
}

/**
 * The built-ins, in the order a board shows them before anyone rearranges it.
 *
 * The label keys are the ones the list view already uses, so the two views never
 * disagree about what the column is called — `tasksClient.assignee` in particular
 * reads "Collaborators", which is the vocabulary this app chose.
 */
const BUILT_IN_COLUMNS: readonly BuiltInColumnDef[] = [
  {
    key: 'status',
    labelKey: 'common.status',
    fallback: 'Status',
    width: 150,
    align: 'start',
    sort: 'status',
  },
  {
    key: 'assignee',
    labelKey: 'tasksClient.assignee',
    fallback: 'Collaborators',
    width: 170,
    align: 'start',
    sort: 'assignee',
  },
  {
    key: 'deadline',
    labelKey: 'tasksClient.deadline',
    fallback: 'Due date',
    width: 140,
    align: 'start',
    sort: 'deadline',
  },
  {
    key: 'priority',
    labelKey: 'tasksClient.priority',
    fallback: 'Priority',
    width: 130,
    align: 'start',
    sort: 'priority',
  },
  // No sort: the visible text is a project *name* the grid resolves per row, and
  // sorting by the id behind it would order rows by nothing the reader can see.
  {
    key: 'project',
    labelKey: 'tasksClient.project',
    fallback: 'Projects',
    width: 160,
    align: 'start',
  },
];

/** A column ready to render: label resolved, width settled, cell type decided. */
export interface TaskColumn {
  key: string;
  label: string;
  width: number;
  align: 'start' | 'end' | 'center';
  sort?: TaskSortField;
  /** Set for a `cf:` column; the cell dispatches on `field.type`. */
  field?: TaskGridField;
}

/**
 * Every column the board *could* show, in its natural order: the built-ins as
 * authored above, then the organization's fields in the order they were arranged.
 *
 * Widths come from the layout when the user has resized the column, from the
 * field's stored width next (an admin can set a sensible default for everyone),
 * and from the type's default last.
 */
export function taskColumnCatalog(
  fields: readonly TaskGridField[],
  t: TFunction,
  layout: TaskTableLayout,
): TaskColumn[] {
  const widthOf = (key: string, fallback: number) =>
    clampColumnWidth(layout.widths[key] ?? fallback);

  const builtIns: TaskColumn[] = BUILT_IN_COLUMNS.map((column) => ({
    key: column.key,
    label: t(column.labelKey, column.fallback),
    width: widthOf(column.key, column.width),
    align: column.align,
    ...(column.sort ? { sort: column.sort } : {}),
  }));

  const custom: TaskColumn[] = fields.map((field) => {
    const key = customColumnKey(field._id);
    return {
      key,
      // A field's name is what its author typed. It is never translated — see
      // the note in `src/lib/taskLabels.ts` about statuses, which is the same
      // argument.
      label: field.name,
      width: widthOf(key, field.width ?? defaultFieldWidth(field.type)),
      align: fieldAlign(field.type),
      sort: key as TaskSortField,
      field,
    };
  });

  return [...builtIns, ...custom];
}

/**
 * The catalogue arranged as this person left it.
 *
 * Two rules that matter more than they look:
 *
 *   - a key in the stored order that no longer exists is dropped, not rendered as
 *     an empty column. Deleting a custom field is a normal thing to do, and every
 *     board that once showed it has that key in localStorage forever.
 *   - a column the order does not mention is *kept*, at the end. That is what
 *     makes a field created today appear on a board someone arranged last month
 *     instead of silently missing.
 */
export function arrangeColumns(
  catalog: readonly TaskColumn[],
  layout: TaskTableLayout,
): { ordered: TaskColumn[]; visible: TaskColumn[]; hidden: TaskColumn[] } {
  const byKey = new Map(catalog.map((column) => [column.key, column]));
  const ordered: TaskColumn[] = [];
  const placed = new Set<string>();

  for (const key of layout.order) {
    const column = byKey.get(key);
    if (column && !placed.has(key)) {
      ordered.push(column);
      placed.add(key);
    }
  }
  for (const column of catalog) {
    if (!placed.has(column.key)) ordered.push(column);
  }

  const hiddenKeys = new Set(layout.hidden);
  return {
    // `ordered` keeps the hidden columns in place, which is what a reorder has to
    // be computed against: switching a column off must not also move it.
    ordered,
    visible: ordered.filter((column) => !hiddenKeys.has(column.key)),
    hidden: ordered.filter((column) => hiddenKeys.has(column.key)),
  };
}

/**
 * The `grid-template-columns` for a row, and the width below which the grid
 * scrolls sideways instead of squeezing.
 *
 * Every track but the name is a fixed pixel width, which is the only way a header
 * and its rows — separate grid elements — line up while the whole thing scrolls
 * horizontally. The name track is `minmax(min, 1fr)`: it takes the slack on a wide
 * screen and stops shrinking at `min` on a narrow one, at which point `minWidth`
 * on the wrapper turns the overflow into a scrollbar.
 */
export function gridTemplate(columns: readonly TaskColumn[]): {
  template: string;
  minWidth: number;
} {
  const tracks = [
    `minmax(${NAME_COLUMN_MIN_WIDTH}px, 1fr)`,
    ...columns.map((column) => `${column.width}px`),
    `${ADD_COLUMN_WIDTH}px`,
  ];
  const minWidth =
    NAME_COLUMN_MIN_WIDTH +
    columns.reduce((sum, column) => sum + column.width, 0) +
    ADD_COLUMN_WIDTH;
  return { template: tracks.join(' '), minWidth };
}

/**
 * A dragged column dropped onto another one.
 *
 * Returns a complete key order rather than a patch, because the stored order is a
 * prefix (see {@link arrangeColumns}): moving the last column to the front has to
 * write down where all the others now sit, or the next render puts it back.
 *
 * `to === undefined` means the column was dropped past the rightmost header, which
 * moves it to the end.
 */
export function moveColumn(
  columns: readonly TaskColumn[],
  from: string,
  to: string | undefined,
): string[] {
  const keys = columns.map((column) => column.key);
  const source = keys.indexOf(from);
  if (source === -1 || from === to) return keys;
  keys.splice(source, 1);
  if (to === undefined) return [...keys, from];
  const target = keys.indexOf(to);
  if (target === -1) return [...keys, from];
  keys.splice(target, 0, from);
  return keys;
}

/** The field id behind a `cf:` column key, for the callers that need the raw id. */
export function columnFieldId(key: string): string | undefined {
  return isCustomColumnKey(key) ? customColumnId(key) : undefined;
}
