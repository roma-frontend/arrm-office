'use client';

/**
 * The Phase 2 fields of the create-task wizard: the board's own status, the board's
 * own columns, co-assignees, a start date and a time estimate.
 *
 * Everything here lives at module scope, for the same reason as
 * `ObjectiveLinkedKRField` in the wizard itself: a component declared inside
 * `CreateTaskWizard` is a new component type on every render, so React unmounts the
 * input on each keystroke and the caret goes with it.
 *
 * Custom values are held in the wizard's flat `stepData` under `cf:<fieldId>` keys.
 * The wizard step components bind by a field-name string, so they carry these
 * without knowing anything about custom fields. `customFieldValuesFrom` folds them
 * back into the record `createTask` expects, and `missingRequiredFields` answers the
 * step's `validation` so a required column stops the wizard on its own step, beside
 * the empty input, instead of at the mutation behind a toast. The server checks the
 * same rule in `assertRequiredFields`; this is the courtesy, not the enforcement.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useWizardContext } from '@/components/ui/wizard';
import {
  CheckboxStep,
  SelectStep,
  TextInputStep,
  TextareaStep,
} from '@/components/ui/wizard-step-components';
import { AssigneePicker, type AssigneeOption } from '@/components/tasks/AssigneePicker';
import { Label } from '@/components/ui/label';
import { statusLabel } from '@/lib/taskLabels';
import { FIELD_CELL_KIND, ratingMaxOf, type TaskGridField } from '@/lib/taskFieldTypes';
import { parseDuration } from '@/components/tasks/detail/TaskTimeTracker';
import { DEFAULT_STATUS_SET, firstOpenStatus, sortStatuses } from '../../../convex/lib/taskStatus';

/** Namespace for custom values inside the wizard's flat step data. */
export const CF_PREFIX = 'cf:';

/** What one wizard field can hold; mirrors the Wizard context's value type. */
export type WizardValue = string | number | boolean | string[] | null;
export type WizardData = Record<string, WizardValue>;

/** Live columns only: a retired field must not ask for input on new tasks. */
export function visibleFields(fields: readonly TaskGridField[] | undefined): TaskGridField[] {
  return (fields ?? []).filter((field) => field.isActive !== false);
}

function isBlank(value: WizardValue | undefined): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * The `customFields` record for `createTask`, or `undefined` when nothing was filled.
 *
 * Values go over the wire as typed: the server's `validateFieldValue` is what turns
 * "2026-03-01" into epoch milliseconds and "1 200" into a number, and doing any of
 * that here would mean two answers to one question.
 *
 * Checkboxes are always sent, blank or not, because an unticked box is a real
 * `false` and not a missing value -- which is also how `buildCustomFieldsPatch`
 * reads it.
 */
export function customFieldValuesFrom(
  data: WizardData,
  fields: readonly TaskGridField[] | undefined,
): Record<string, unknown> | undefined {
  const values: Record<string, unknown> = {};
  for (const field of visibleFields(fields)) {
    const raw = data[CF_PREFIX + field._id];
    if (field.type === 'checkbox') {
      values[field._id] = raw === true;
      continue;
    }
    if (isBlank(raw)) continue;
    values[field._id] = raw;
  }
  return Object.keys(values).length > 0 ? values : undefined;
}

/**
 * Required columns still empty.
 *
 * Checkboxes are exempt on purpose: `assertRequiredFields` accepts `false`, so a
 * required checkbox that refused to submit here would be the browser inventing a
 * rule the server does not have.
 */
export function missingRequiredFields(
  data: WizardData,
  fields: readonly TaskGridField[] | undefined,
): TaskGridField[] {
  return visibleFields(fields).filter(
    (field) =>
      field.required === true && field.type !== 'checkbox' && isBlank(data[CF_PREFIX + field._id]),
  );
}

/** Minutes from the estimate box, which accepts `90`, `1h 30m` or `1:30`. */
/**
 * The co-assignees the wizard picked, or `undefined` for none.
 *
 * Sent as picked: the server drops the responsible person from the list and holds it
 * to `MAX_ASSIGNEES`, and a second opinion here would only disagree with it.
 */
export function coAssigneesFrom(data: WizardData): Id<'users'>[] | undefined {
  if (!Array.isArray(data.assigneeIds) || data.assigneeIds.length === 0) return undefined;
  return data.assigneeIds.map((id) => id as Id<'users'>);
}

/**
 * Stored `customFields` turned back into wizard step data.
 *
 * The inverse of {@link customFieldValuesFrom}, and deliberately loose about types: the
 * inputs are all text, dates arrive as milliseconds and go back out as `yyyy-MM-dd`,
 * and a value belonging to a column that has since been archived is simply carried
 * along -- the fields step will not render it, and nothing is lost by keeping it.
 */
export function wizardCustomFieldDefaults(raw: unknown): WizardData {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const defaults: WizardData = {};
  for (const [fieldId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'boolean') {
      defaults[CF_PREFIX + fieldId] = value;
    } else if (typeof value === 'number' || typeof value === 'string') {
      defaults[CF_PREFIX + fieldId] = value;
    } else if (Array.isArray(value)) {
      defaults[CF_PREFIX + fieldId] = value.map(String);
    }
  }
  return defaults;
}

export function estimateMinutesFrom(data: WizardData): number | undefined {
  const raw = data.timeEstimate;
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  const minutes = parseDuration(raw);
  return minutes !== null && minutes > 0 ? minutes : undefined;
}

// ── Status ─────────────────────────────────────────────────────────────────
/**
 * The board's own opening status.
 *
 * The default is `firstOpenStatus`, not the literal `pending`: on a board whose
 * first column is UNPAID a new task belongs in UNPAID, and the server derives the
 * canonical status from whichever status is chosen here.
 */
export function WizardStatusField({
  projectId,
  organizationId,
}: {
  projectId?: Id<'projects'>;
  organizationId?: Id<'organizations'>;
}) {
  const { t } = useTranslation();
  const resolved = useQuery(api.taskStatuses.resolveForProject, {
    ...(projectId ? { projectId } : {}),
    ...(organizationId ? { organizationId } : {}),
  });
  const statuses = sortStatuses(resolved?.statuses ?? DEFAULT_STATUS_SET);

  return (
    <SelectStep
      field="statusKey"
      label={t('taskWizard.steps.priority.statusLabel', 'Status')}
      options={statuses.map((status) => ({
        value: status.key,
        label: statusLabel(t, status),
      }))}
      placeholder={t('taskWizard.steps.priority.statusPlaceholder', 'Select a status')}
      description={t('taskWizard.steps.priority.statusHint', 'Which column this task opens in')}
      defaultValue={firstOpenStatus(statuses).key}
    />
  );
}

// ── Dates and estimate ─────────────────────────────────────────────────────
/**
 * When work starts and how long it is expected to take.
 *
 * The estimate is a text box rather than a number of minutes, because nobody
 * plans in minutes: `1h 30m` and `1:30` are what people type, and
 * {@link parseDuration} is the same reader the time-tracking panel uses, so one
 * notation is learned once.
 */
export function WizardScheduleFields() {
  const { t } = useTranslation();
  const { stepData } = useWizardContext();
  const estimate = typeof stepData.timeEstimate === 'string' ? stepData.timeEstimate : '';
  const unreadable = estimate.trim() !== '' && parseDuration(estimate) === null;
  // A rule has no single occurrence to date, so its start is expressed as an offset on
  // the repeat step instead. Showing a date picker here that the series ignores would
  // be a field that silently does nothing. The estimate below applies either way.
  const repeats = stepData.repeat === 'weekly' || stepData.repeat === 'monthly';

  return (
    <div className="space-y-4">
      {!repeats && (
        <TextInputStep
          field="startDate"
          label={t('taskWizard.steps.priority.startDateLabel', 'Start date')}
          type="date"
          description={t(
            'taskWizard.steps.priority.startDateHint',
            'When work on this is meant to begin',
          )}
        />
      )}
      <div className="space-y-1">
        <TextInputStep
          field="timeEstimate"
          label={t('taskWizard.steps.priority.estimateLabel', 'Time estimate')}
          placeholder={t('taskPanels.durationPlaceholder', '90, 1h 30m')}
          description={t(
            'taskWizard.steps.priority.estimateHint',
            'Minutes, or 1h 30m — tracked time is compared against this',
          )}
        />
        {unreadable && (
          <p className="text-xs text-(--danger-text)">
            {t('taskWizard.steps.priority.estimateInvalid', 'Try 90, 1h 30m or 1:30')}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Co-assignees ───────────────────────────────────────────────────────────
/**
 * People working alongside the responsible person.
 *
 * The responsible person is read from the wizard's own `assigneeId` step so the
 * chip follows the select, and is passed as `primary` so they cannot also be
 * picked as a co-assignee -- the same rule the server keeps in `setAssignees`.
 */
export function WizardCoAssignees({
  organizationId,
  people,
}: {
  organizationId?: Id<'organizations'>;
  people: readonly AssigneeOption[] | undefined;
}) {
  const { t } = useTranslation();
  const { stepData, updateStepData } = useWizardContext();

  const value = Array.isArray(stepData.assigneeIds) ? stepData.assigneeIds : [];
  const primaryId = typeof stepData.assigneeId === 'string' ? stepData.assigneeId : undefined;
  const primary = primaryId ? (people ?? []).find((one) => one._id === primaryId) : undefined;

  return (
    <div className="space-y-2">
      <Label className="text-(--text-primary)">
        {t('taskWizard.steps.assignee.coAssigneesLabel', 'Also working on it')}
      </Label>
      <AssigneePicker
        value={value}
        onChange={(ids) => updateStepData('assigneeIds', ids)}
        primary={primary ?? null}
        {...(organizationId ? { organizationId } : {})}
      />
      <p className="text-xs text-muted-foreground">
        {t(
          'taskWizard.steps.assignee.coAssigneesHint',
          'Optional. The person above stays responsible for the task.',
        )}
      </p>
    </div>
  );
}

// ── Custom columns ─────────────────────────────────────────────────────────
/** A single checkbox column: a real boolean, not a one-item list. */
function WizardCheckboxField({ field }: { field: TaskGridField }) {
  const { stepData, updateStepData } = useWizardContext();
  const key = CF_PREFIX + field._id;
  const checked = stepData[key] === true;

  return (
    <label className="flex items-center gap-2 text-sm text-(--text-primary)">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => updateStepData(key, event.target.checked)}
        className="h-4 w-4 accent-(--primary)"
      />
      {field.name}
    </label>
  );
}

/**
 * One custom column as an input.
 *
 * Dispatch is on {@link FIELD_CELL_KIND} rather than on the field type, so money,
 * percent and number share one number box and url, email and phone share one text
 * box -- the same collapsing the grid cells do, and for the same reason: sixteen
 * field types do not need sixteen inputs.
 *
 * `field.name` is never translated. It is what somebody typed when they added the
 * column, and a board with a column called "Сумма долга" should read that way in
 * every locale.
 */
function WizardCustomField({
  field,
  people,
}: {
  field: TaskGridField;
  people: readonly AssigneeOption[] | undefined;
}) {
  const { t } = useTranslation();
  const key = CF_PREFIX + field._id;
  const required = field.required === true;
  const kind = FIELD_CELL_KIND[field.type];

  switch (kind) {
    case 'longText':
      return <TextareaStep field={key} label={field.name} rows={3} required={required} />;

    case 'number':
      return (
        <TextInputStep
          field={key}
          label={field.name}
          type="number"
          required={required}
          {...(field.config?.suffix ? { description: field.config.suffix } : {})}
        />
      );

    case 'rating':
      return (
        <TextInputStep
          field={key}
          label={field.name}
          type="number"
          required={required}
          description={t('taskWizard.steps.fields.ratingHint', '0 to {{max}}', {
            max: ratingMaxOf(field),
          })}
        />
      );

    case 'progress':
      return (
        <TextInputStep
          field={key}
          label={field.name}
          type="number"
          required={required}
          description={t('taskWizard.steps.fields.percentHint', '0 to 100')}
        />
      );

    case 'date':
      return <TextInputStep field={key} label={field.name} type="date" required={required} />;

    case 'select':
      return (
        <SelectStep
          field={key}
          label={field.name}
          required={required}
          options={(field.options ?? []).map((option) => ({
            value: option.id,
            label: option.label,
          }))}
          placeholder={t('taskWizard.steps.fields.selectPlaceholder', 'Choose one')}
        />
      );

    case 'multiSelect':
      return (
        <CheckboxStep
          field={key}
          label={field.name}
          options={(field.options ?? []).map((option) => ({
            value: option.id,
            label: option.label,
          }))}
        />
      );

    case 'user':
      return (
        <SelectStep
          field={key}
          label={field.name}
          required={required}
          options={(people ?? []).map((person) => ({ value: person._id, label: person.name }))}
          placeholder={t('taskWizard.steps.fields.userPlaceholder', 'Choose a person')}
        />
      );

    case 'users':
      return (
        <CheckboxStep
          field={key}
          label={field.name}
          options={(people ?? []).map((person) => ({ value: person._id, label: person.name }))}
        />
      );

    case 'checkbox':
      return <WizardCheckboxField field={field} />;

    default:
      return (
        <TextInputStep
          field={key}
          label={field.name}
          type={field.type === 'email' ? 'email' : 'text'}
          required={required}
          {...(field.type === 'url' ? { placeholder: 'https://' } : {})}
        />
      );
  }
}

/**
 * Every custom column this board carries, in board order.
 *
 * Renders nothing at all when the board has no columns, so the step it lives on can
 * drop itself rather than showing an empty page -- see `hasCustomFields` in the
 * wizard.
 */
export function WizardCustomFields({
  projectId,
  organizationId,
  people,
}: {
  projectId?: Id<'projects'>;
  organizationId?: Id<'organizations'>;
  people: readonly AssigneeOption[] | undefined;
}) {
  const { t } = useTranslation();
  const fields = useTaskFields(projectId, organizationId);
  const live = visibleFields(fields);

  if (live.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('taskWizard.steps.fields.none', 'This board has no extra columns')}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {live.map((field) => (
        <WizardCustomField key={field._id} field={field} people={people} />
      ))}
    </div>
  );
}

/**
 * The board's columns, for the wizard.
 *
 * A hook rather than a prop drilled from the page, because the wizard needs the same
 * list twice -- once to render the step and once to check it on submit -- and Convex
 * serves the second read from the same subscription.
 */
export function useTaskFields(
  projectId?: Id<'projects'>,
  organizationId?: Id<'organizations'>,
): TaskGridField[] | undefined {
  const fields = useQuery(api.taskFields.listFields, {
    ...(projectId ? { projectId } : {}),
    ...(organizationId ? { organizationId } : {}),
  });
  return fields as TaskGridField[] | undefined;
}
