/**
 * Custom task fields — the columns an organization invents for itself.
 *
 * The screenshot that started this work has four of them: *Contact* (text),
 * *Amount owed* (money), *Category* (label) and *Confidence Level* (a dropdown
 * of coloured options). None of those belong in a shared schema — the next
 * organization wants *Invoice no.*, *Region* and *Risk*. So the shape lives in
 * `taskFields` rows and the values live in one `tasks.customFields` map, keyed
 * by field id.
 *
 * ## Why the values sit on the task rather than in their own table
 *
 * A row-per-value table is the textbook answer and the wrong one here. The board
 * already loads its tasks in one bounded read and filters them in memory; a
 * value table would add a second read per field per task, or a join the board
 * would have to batch by hand, to render a grid that is already fully in memory.
 * Keeping the values inline costs the ability to index *by* a field value — a
 * cost the board does not feel, because it sorts and filters the loaded page
 * anyway.
 *
 * The price of an untyped `v.any()` map is that nothing stops a caller writing
 * a string into a money field. {@link validateFieldValue} is that stop, and
 * every mutation that touches `customFields` must go through it.
 *
 * Pure and dependency-free, so the grid's cell components import the same
 * registry the server validates against — see `lib/taskStatus.ts` for why this
 * repository prefers that over a mirrored copy.
 */

import { v, ConvexError } from 'convex/values';
import type { Infer } from 'convex/values';
import { taskColorValidator, isTaskColor, type TaskColor } from './taskStatus';

// ── Field types ────────────────────────────────────────────────────────────
export const fieldTypeValidator = v.union(
  v.literal('text'),
  v.literal('longText'),
  v.literal('number'),
  v.literal('money'),
  v.literal('percent'),
  v.literal('rating'),
  v.literal('progress'),
  v.literal('select'),
  v.literal('multiSelect'),
  v.literal('date'),
  v.literal('user'),
  v.literal('users'),
  v.literal('checkbox'),
  v.literal('url'),
  v.literal('email'),
  v.literal('phone'),
);

export type TaskFieldType = Infer<typeof fieldTypeValidator>;

/** What a stored value looks like, once validated. */
export type TaskFieldValue = string | number | boolean | string[];

/**
 * How each type stores its value, and how wide its column wants to be.
 *
 * Keyed by the union, so a field type added to the validator without an entry
 * here fails to compile rather than reaching the grid as an unrenderable cell.
 *
 * `sortAs` is what the grid sorts by: `text` compares with `localeCompare`,
 * `number` numerically, `option` by the option's position in the field (so
 * *Low → Medium → High* sorts in that order and not alphabetically).
 */
export const FIELD_TYPE_META: Record<
  TaskFieldType,
  {
    kind: 'string' | 'number' | 'boolean' | 'stringArray';
    sortAs: 'text' | 'number' | 'option' | 'boolean';
    /** Whether the field carries a list of options the user authors. */
    hasOptions: boolean;
    /** Sensible starting column width in px. */
    width: number;
  }
> = {
  text: { kind: 'string', sortAs: 'text', hasOptions: false, width: 180 },
  longText: { kind: 'string', sortAs: 'text', hasOptions: false, width: 240 },
  number: { kind: 'number', sortAs: 'number', hasOptions: false, width: 120 },
  money: { kind: 'number', sortAs: 'number', hasOptions: false, width: 140 },
  percent: { kind: 'number', sortAs: 'number', hasOptions: false, width: 110 },
  rating: { kind: 'number', sortAs: 'number', hasOptions: false, width: 130 },
  progress: { kind: 'number', sortAs: 'number', hasOptions: false, width: 150 },
  select: { kind: 'string', sortAs: 'option', hasOptions: true, width: 160 },
  multiSelect: { kind: 'stringArray', sortAs: 'text', hasOptions: true, width: 200 },
  date: { kind: 'number', sortAs: 'number', hasOptions: false, width: 140 },
  user: { kind: 'string', sortAs: 'text', hasOptions: false, width: 170 },
  users: { kind: 'stringArray', sortAs: 'text', hasOptions: false, width: 190 },
  checkbox: { kind: 'boolean', sortAs: 'boolean', hasOptions: false, width: 90 },
  url: { kind: 'string', sortAs: 'text', hasOptions: false, width: 200 },
  email: { kind: 'string', sortAs: 'text', hasOptions: false, width: 200 },
  phone: { kind: 'string', sortAs: 'text', hasOptions: false, width: 160 },
};

/** In the order the "new field" picker offers them — commonest first. */
export const TASK_FIELD_TYPES = Object.keys(FIELD_TYPE_META) as TaskFieldType[];

// ── Column width ───────────────────────────────────────────────────────────
/**
 * The bounds a column width is held to.
 *
 * Here rather than in the client's presentation module because the server stores
 * a width too — `taskFields.width` is the organization-wide default that a new
 * device starts from — and a value the server accepted but the grid clamped
 * differently would make a column jump on first render.
 *
 * The minimum is a column still wide enough to grab and resize; below that a
 * mis-drag makes a column unrecoverable without editing the definition.
 */
export const MIN_COLUMN_WIDTH = 72;
export const MAX_COLUMN_WIDTH = 640;

export function clampColumnWidth(width: number): number {
  if (!Number.isFinite(width)) return MIN_COLUMN_WIDTH;
  return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(width)));
}

/** The starting width for a type; a per-device override lives in preferences. */
export function defaultFieldWidth(type: TaskFieldType): number {
  return FIELD_TYPE_META[type].width;
}

export function isTaskFieldType(value: unknown): value is TaskFieldType {
  return typeof value === 'string' && Object.hasOwn(FIELD_TYPE_META, value);
}

export function fieldHasOptions(type: TaskFieldType): boolean {
  return FIELD_TYPE_META[type].hasOptions;
}

// ── A field definition ─────────────────────────────────────────────────────
export const fieldOptionValidator = v.object({
  /** Stable id stored in the task's value; survives a rename of the label. */
  id: v.string(),
  label: v.string(),
  color: taskColorValidator,
  order: v.number(),
});

export type TaskFieldOption = Infer<typeof fieldOptionValidator>;

export const fieldConfigValidator = v.object({
  /** `money`: ISO 4217, e.g. `AMD`. Absent means the org's display currency. */
  currency: v.optional(v.string()),
  /** `number` / `money`: decimals to keep and to render. */
  precision: v.optional(v.number()),
  /** `number`: rejects values outside the range instead of clamping silently. */
  min: v.optional(v.number()),
  max: v.optional(v.number()),
  /** `number`: cosmetic units, e.g. a `kg` suffix. */
  prefix: v.optional(v.string()),
  suffix: v.optional(v.string()),
  /** `rating`: how many stars. Defaults to {@link DEFAULT_RATING_MAX}. */
  ratingMax: v.optional(v.number()),
});

export type TaskFieldConfig = Infer<typeof fieldConfigValidator>;

/**
 * The parts of a `taskFields` row this module needs.
 *
 * Structurally typed rather than `Doc<'taskFields'>` so the client can pass a
 * plain object and the tests do not need a database.
 */
export interface TaskFieldLike {
  type: TaskFieldType;
  name: string;
  options?: TaskFieldOption[];
  config?: TaskFieldConfig;
  required?: boolean;
}

export const DEFAULT_RATING_MAX = 5;
export const MAX_RATING_MAX = 10;
export const MAX_OPTIONS_PER_FIELD = 60;
export const MAX_FIELDS_PER_SCOPE = 60;
export const MAX_FIELD_NAME_LENGTH = 60;
export const MAX_OPTION_LABEL_LENGTH = 60;
export const MAX_TEXT_VALUE_LENGTH = 2_000;
export const MAX_LONG_TEXT_VALUE_LENGTH = 20_000;
export const MAX_MULTI_VALUES = 50;

// ── Value validation ───────────────────────────────────────────────────────
/**
 * Sentinel for "this cell is now empty".
 *
 * Distinguishing *cleared* from *never set* matters at the call site: a cleared
 * cell must delete the key from `customFields` rather than store `null`, or
 * every consumer would have to treat `null`, `''` and absent alike.
 */
export const CLEAR_FIELD_VALUE = Symbol('clearFieldValue');

function fail(field: TaskFieldLike, detail: string): never {
  throw new ConvexError(`"${field.name}": ${detail}`);
}

/** Trimmed, or `undefined` when there is nothing left. */
function nonEmpty(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Trimmed text, or a rejection.
 *
 * The emptiness check in {@link validateFieldValue} has already run, so reaching
 * here with nothing means `raw` was never text — a number posted into a `text`
 * column, say. Refusing beats coercing: `String(raw)` would happily store
 * `"[object Object]"`.
 */
function requireString(field: TaskFieldLike, raw: unknown, max: number): string {
  const value = nonEmpty(raw);
  if (value === undefined) fail(field, 'expected text');
  if (value.length > max) fail(field, `must be at most ${max} characters`);
  return value;
}

function validateNumber(field: TaskFieldLike, raw: unknown): number {
  const value = typeof raw === 'string' ? Number(raw.replace(/\s/g, '')) : raw;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(field, 'expected a number');
  }
  const { min, max, precision } = field.config ?? {};
  if (min !== undefined && value < min) fail(field, `must be at least ${min}`);
  if (max !== undefined && value > max) fail(field, `must be at most ${max}`);
  if (precision !== undefined && precision >= 0) {
    const factor = 10 ** Math.min(precision, 10);
    return Math.round(value * factor) / factor;
  }
  return value;
}

/** The scheme, or `null` when the string is not a URL at all. */
function urlProtocol(value: string): string | null {
  try {
    return new URL(value).protocol;
  } catch {
    return null;
  }
}

function validateOptionId(field: TaskFieldLike, raw: unknown): string {
  const id = nonEmpty(raw);
  if (id === undefined) fail(field, 'expected an option');
  if (!(field.options ?? []).some((o) => o.id === id)) {
    fail(field, `"${id}" is not one of its options`);
  }
  return id;
}

/**
 * Ids of documents in another table — user ids here.
 *
 * Deliberately a shape check and not an existence check: this module is pure,
 * and the mutation that calls it is the right place to confirm the user is real
 * and in the same organization. What this rejects is the obviously-not-an-id, so
 * a hand-crafted payload cannot park arbitrary text in a `user` column.
 */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function validateId(field: TaskFieldLike, raw: unknown): string {
  const id = nonEmpty(raw);
  if (id === undefined) fail(field, 'expected a user');
  if (!ID_PATTERN.test(id)) fail(field, 'is not a valid reference');
  return id;
}

function validateStringArray(
  field: TaskFieldLike,
  raw: unknown,
  each: (item: unknown) => string,
): string[] {
  if (!Array.isArray(raw)) fail(field, 'expected a list');
  if (raw.length > MAX_MULTI_VALUES) {
    fail(field, `holds at most ${MAX_MULTI_VALUES} values`);
  }
  // De-duplicated, order preserved: the same option selected twice is one
  // selection, and re-ordering the user's picks would fight the UI.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const value = each(item);
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

/**
 * The single gate every write to `tasks.customFields` passes through.
 *
 * Returns the normalized value to store, or {@link CLEAR_FIELD_VALUE} when the
 * input means "empty" — which is refused for a required field, since that is the
 * one thing `required` is for.
 *
 * Throws `ConvexError` with the field's name in the message, because this error
 * is shown to the person who typed the value.
 */
export function validateFieldValue(
  field: TaskFieldLike,
  raw: unknown,
): TaskFieldValue | typeof CLEAR_FIELD_VALUE {
  const isEmpty =
    raw === undefined ||
    raw === null ||
    (typeof raw === 'string' && raw.trim() === '') ||
    (Array.isArray(raw) && raw.length === 0);

  if (isEmpty) {
    // An unticked checkbox is a real `false`, not an absence — storing it as
    // "cleared" would make "is unchecked" unfilterable.
    if (field.type === 'checkbox') return false;
    if (field.required) fail(field, 'is required');
    return CLEAR_FIELD_VALUE;
  }

  switch (field.type) {
    case 'text':
    case 'phone':
      return requireString(field, raw, MAX_TEXT_VALUE_LENGTH);

    case 'longText':
      return requireString(field, raw, MAX_LONG_TEXT_VALUE_LENGTH);

    case 'url': {
      const value = requireString(field, raw, MAX_TEXT_VALUE_LENGTH);
      const protocol = urlProtocol(value);
      if (protocol === null) fail(field, 'is not a valid URL');
      // Only http(s): a `javascript:` or `data:` URL in a cell the grid renders
      // as a link would be a stored-XSS vector.
      if (protocol !== 'http:' && protocol !== 'https:') {
        fail(field, 'must be an http or https URL');
      }
      return value;
    }

    case 'email': {
      const value = requireString(field, raw, 320).toLowerCase();
      // One `@`, something either side, a dot in the domain. Deliberately not
      // RFC 5322 — the strict grammar rejects addresses that work, and this is a
      // typo guard, not an authorization decision.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        fail(field, 'is not a valid email address');
      }
      return value;
    }

    case 'number':
    case 'money':
      return validateNumber(field, raw);

    case 'percent': {
      const value = validateNumber(field, raw);
      if (value < 0 || value > 100) fail(field, 'must be between 0 and 100');
      return value;
    }

    case 'progress': {
      const value = validateNumber(field, raw);
      if (value < 0 || value > 100) fail(field, 'must be between 0 and 100');
      return Math.round(value);
    }

    case 'rating': {
      const max = ratingMaxOf(field);
      const value = validateNumber(field, raw);
      if (!Number.isInteger(value) || value < 0 || value > max) {
        fail(field, `must be a whole number between 0 and ${max}`);
      }
      return value;
    }

    case 'date': {
      const value = typeof raw === 'string' ? Date.parse(raw) : raw;
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        fail(field, 'is not a valid date');
      }
      return value;
    }

    case 'checkbox': {
      if (typeof raw === 'boolean') return raw;
      if (raw === 'true' || raw === 1) return true;
      if (raw === 'false' || raw === 0) return false;
      return fail(field, 'expected true or false');
    }

    case 'select':
      return validateOptionId(field, raw);

    case 'multiSelect':
      return validateStringArray(field, raw, (item) => validateOptionId(field, item));

    case 'user':
      return validateId(field, raw);

    case 'users':
      return validateStringArray(field, raw, (item) => validateId(field, item));
  }
}

export function ratingMaxOf(field: TaskFieldLike): number {
  const max = field.config?.ratingMax;
  if (typeof max !== 'number' || !Number.isInteger(max) || max < 1 || max > MAX_RATING_MAX) {
    return DEFAULT_RATING_MAX;
  }
  return max;
}

// ── Authoring a field ──────────────────────────────────────────────────────
const FIELD_KEY_PATTERN = /^[a-z0-9_]{1,60}$/;

/** "Amount owed" → `amount_owed`. `suffix` resolves a collision the caller found. */
export function fieldKeyFromName(name: string, suffix = 0): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 54);
  const stem = base === '' ? 'field' : base;
  return suffix > 0 ? `${stem}_${suffix}` : stem;
}

/**
 * Rejects a definition the grid could not render or the validator could not use.
 *
 * The option checks are the substantive ones: a `select` with no options is a
 * column nobody can fill, and duplicate option ids would make a stored value
 * ambiguous.
 */
export function assertValidFieldDef(field: TaskFieldLike & { key?: string }): void {
  if (!isTaskFieldType(field.type)) {
    throw new ConvexError(`Unknown field type: ${String(field.type)}`);
  }

  const name = field.name.trim();
  if (name === '' || name.length > MAX_FIELD_NAME_LENGTH) {
    throw new ConvexError(`Field names must be 1–${MAX_FIELD_NAME_LENGTH} characters`);
  }
  if (field.key !== undefined && !FIELD_KEY_PATTERN.test(field.key)) {
    throw new ConvexError(`Invalid field key: ${field.key}`);
  }

  const options = field.options ?? [];
  if (fieldHasOptions(field.type)) {
    if (options.length === 0) {
      throw new ConvexError(`"${name}" needs at least one option`);
    }
    if (options.length > MAX_OPTIONS_PER_FIELD) {
      throw new ConvexError(`"${name}" may hold at most ${MAX_OPTIONS_PER_FIELD} options`);
    }
    const seen = new Set<string>();
    for (const option of options) {
      const label = option.label.trim();
      if (label === '' || label.length > MAX_OPTION_LABEL_LENGTH) {
        throw new ConvexError(`Option labels must be 1–${MAX_OPTION_LABEL_LENGTH} characters`);
      }
      if (!ID_PATTERN.test(option.id)) {
        throw new ConvexError(`Invalid option id: ${option.id}`);
      }
      if (seen.has(option.id)) {
        throw new ConvexError(`Duplicate option id: ${option.id}`);
      }
      seen.add(option.id);
      if (!isTaskColor(option.color)) {
        throw new ConvexError(`Invalid option colour: ${String(option.color)}`);
      }
    }
  } else if (options.length > 0) {
    throw new ConvexError(`A ${field.type} field does not take options`);
  }

  const { min, max, precision, ratingMax } = field.config ?? {};
  if (min !== undefined && max !== undefined && min > max) {
    throw new ConvexError(`"${name}": minimum is above its maximum`);
  }
  if (
    precision !== undefined &&
    (!Number.isInteger(precision) || precision < 0 || precision > 10)
  ) {
    throw new ConvexError(`"${name}": precision must be a whole number from 0 to 10`);
  }
  if (
    ratingMax !== undefined &&
    (!Number.isInteger(ratingMax) || ratingMax < 1 || ratingMax > MAX_RATING_MAX)
  ) {
    throw new ConvexError(`"${name}": rating scale must be 1–${MAX_RATING_MAX}`);
  }
}

// ── Reading a value ────────────────────────────────────────────────────────
export function optionOf(field: TaskFieldLike, value: unknown): TaskFieldOption | undefined {
  if (typeof value !== 'string') return undefined;
  return (field.options ?? []).find((o) => o.id === value);
}

/**
 * A locale-independent string for export and free-text search.
 *
 * Not for display: the grid formats money and dates through the reader's locale
 * (`useCurrency`, `toLocaleDateString`). This is the flat rendition that belongs
 * in a CSV, where a locale-formatted number would break the column.
 */
export function stringifyFieldValue(field: TaskFieldLike, value: unknown): string {
  if (value === undefined || value === null) return '';
  switch (field.type) {
    case 'checkbox':
      return value ? 'yes' : 'no';
    case 'date':
      return typeof value === 'number' ? new Date(value).toISOString().slice(0, 10) : '';
    case 'select':
      return optionOf(field, value)?.label ?? '';
    case 'multiSelect':
      return Array.isArray(value)
        ? value
            .map((id) => optionOf(field, id)?.label)
            .filter((label): label is string => !!label)
            .join(', ')
        : '';
    case 'users':
      return Array.isArray(value) ? value.join(', ') : '';
    default:
      return String(value);
  }
}

/**
 * Comparator for sorting the grid by a custom field.
 *
 * Empty cells always sort last, whichever direction the column is sorted in —
 * a screenful of blanks at the top is never what someone wanted when they
 * clicked a column header.
 */
export function compareFieldValues(field: TaskFieldLike, a: unknown, b: unknown): number {
  const aEmpty = a === undefined || a === null || a === '' || (Array.isArray(a) && a.length === 0);
  const bEmpty = b === undefined || b === null || b === '' || (Array.isArray(b) && b.length === 0);
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  switch (FIELD_TYPE_META[field.type].sortAs) {
    case 'number':
      return Number(a) - Number(b);
    case 'boolean':
      return Number(Boolean(a)) - Number(Boolean(b));
    case 'option': {
      // By the author's ordering, so Low → Medium → High reads as a scale.
      const orderOf = (value: unknown) => optionOf(field, value)?.order ?? Number.MAX_SAFE_INTEGER;
      return orderOf(a) - orderOf(b);
    }
    case 'text':
      return stringifyFieldValue(field, a).localeCompare(stringifyFieldValue(field, b));
  }
}

/** Re-exported so cell components need only one import for a coloured chip. */
export type { TaskColor };
