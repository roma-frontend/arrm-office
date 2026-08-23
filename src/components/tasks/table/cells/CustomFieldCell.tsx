'use client';

/**
 * One custom-field cell, dispatched on the field's type.
 *
 * The grid renders `<CustomFieldCell field={…} …/>` and never learns which
 * component that becomes. That indirection is what makes a new field type a
 * one-line change: add it to `fieldTypeValidator`, give it a `CellKind` in
 * `FIELD_CELL_KIND`, and every board that shows the column gets an editor.
 *
 * The map is keyed by {@link CellKind} rather than by field type, so `money`,
 * `percent` and `number` share one implementation — the differences between them
 * are formatting and validation, which live in the registry.
 */

import type { ComponentType } from 'react';
import { FIELD_CELL_KIND, type CellKind } from '@/lib/taskFieldTypes';
import type { TaskCellProps } from './cellChrome';
import { LongTextCell, NumberCell, TextCell } from './TypedCells';
import { DateCell, MultiSelectCell, SelectCell, UserCell, UsersCell } from './PickerCells';
import { CheckboxCell, ProgressCell, RatingCell } from './ToggleCells';

/** Keyed by the union: a new cell kind must have a component to compile. */
const CELL_COMPONENTS: Record<CellKind, ComponentType<TaskCellProps>> = {
  text: TextCell,
  longText: LongTextCell,
  number: NumberCell,
  select: SelectCell,
  multiSelect: MultiSelectCell,
  date: DateCell,
  user: UserCell,
  users: UsersCell,
  checkbox: CheckboxCell,
  rating: RatingCell,
  progress: ProgressCell,
};

export function CustomFieldCell(props: TaskCellProps) {
  const kind = FIELD_CELL_KIND[props.field.type];
  // A field type written by a newer build than this bundle: fall back to the text
  // cell rather than rendering nothing. The value is still shown and still
  // editable as text; the server refuses anything its own validator dislikes.
  const Cell = CELL_COMPONENTS[kind] ?? TextCell;
  return <Cell {...props} />;
}

export type { TaskCellProps, TaskCellUser } from './cellChrome';
