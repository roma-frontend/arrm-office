/**
 * Create Task Wizard - Пошаговая форма создания задачи
 * Использует универсальный Wizard компонент
 */

'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Wizard, WizardStep } from '@/components/ui/wizard';
import {
  TextInputStep,
  TextareaStep,
  SelectStep,
  FileUploadStep,
} from '@/components/ui/wizard-step-components';
import { CheckSquare, User, AlertCircle, Tag, Paperclip, Target, Repeat } from 'lucide-react';
import { useMutation, useQuery } from 'convex/react';
import { useOptimisticCreateTask } from '@/hooks/useOptimisticActions';
import { api } from '@/convex/_generated/api';
import { useWizardContext } from '@/components/ui/wizard';
import { cn } from '@/lib/utils';
import { getConvexErrorMessage } from '@/lib/error-handler';

interface AttachmentData {
  url: string;
  name: string;
  type: string;
  size: number;
}
import type { Id } from '@/convex/_generated/dataModel';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

/** The series this wizard is editing instead of creating a new one. */
interface EditingSeries {
  _id: Id<'recurringTasks'>;
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  tags?: string[];
  assignedTo: Id<'users'>;
  projectId?: Id<'projects'>;
  objectiveId?: Id<'objectives'>;
  keyResultId?: Id<'keyResults'>;
  attachments?: Array<{ url: string; name: string; type: string; size: number }>;
  frequency: 'weekly' | 'monthly';
  daysOfWeek?: number[];
  dayOfMonth?: number;
  startDate: string;
  endDate?: string;
  deadlineOffsetDays?: number;
}

interface CreateTaskWizardProps {
  currentUserId: Id<'users'>;
  userRole: 'admin' | 'supervisor' | 'employee' | 'superadmin';
  assigneeId?: Id<'users'>;
  /** Pre-links the task to an objective (used by /tasks/new?objectiveId=…). */
  objectiveId?: Id<'objectives'>;
  /** Pre-links the task to a project (used by /tasks/new?projectId=…). */
  projectId?: Id<'projects'>;
  /** When set, the wizard edits this recurring series instead of creating. */
  editingSeries?: EditingSeries;
  /** Overridable so a goal-scoped draft cannot clash with the board's draft. */
  draftKey?: string;
  /** Passed through to the Wizard shell — lets a host sheet own the layout. */
  className?: string;
  onComplete?: () => void;
  onCancel?: () => void;
}

/**
 * Key-result selector for the objective the wizard is currently pointing at.
 *
 * Reads the objective from wizard context rather than props, and lives at module
 * scope: declared inside the wizard it was a new component type on every render,
 * so the field was unmounted and remounted — and lost focus — as the draft changed.
 */
const ObjectiveLinkedKRField = ({
  objectivesForLinking: objs,
}: {
  objectivesForLinking:
    | Array<{
        _id: string;
        title: string;
        keyResults: Array<{
          _id: string;
          title: string;
          completionPercent: number;
        }>;
      }>
    | undefined;
}) => {
  const { t } = useTranslation();
  const { stepData } = useWizardContext();
  const selObjectiveId = stepData.objectiveId as string | undefined;
  const selObjective = objs?.find((o) => o._id === selObjectiveId);

  if (!selObjective || selObjective.keyResults.length === 0) return null;

  return (
    <SelectStep
      field="keyResultId"
      label={t('taskWizard.steps.objectiveLink.keyResultLabel', 'Key Result')}
      options={selObjective.keyResults.map((kr) => ({
        value: kr._id,
        label: `${kr.title} (${kr.completionPercent}%)`,
      }))}
      placeholder={t(
        'taskWizard.steps.objectiveLink.keyResultPlaceholder',
        'Select a key result (optional)',
      )}
      description={t(
        'taskWizard.steps.objectiveLink.keyResultHint',
        'Link to a specific key result',
      )}
    />
  );
};

/**
 * Repeat rule fields, shown only once a frequency is chosen.
 *
 * Module scope for the same reason as `ObjectiveLinkedKRField`: declared inside
 * the wizard it would be a fresh component type on every render and the inputs
 * would lose focus as the draft changed.
 */
const RepeatRuleFields = () => {
  const { t } = useTranslation();
  const { stepData, updateStepData } = useWizardContext();
  const frequency = (stepData.repeat as string | undefined) ?? 'none';

  if (frequency === 'none') return null;

  const selectedDays = Array.isArray(stepData.repeatDaysOfWeek)
    ? (stepData.repeatDaysOfWeek as string[])
    : [];

  const toggleDay = (day: string) => {
    updateStepData(
      'repeatDaysOfWeek',
      selectedDays.includes(day) ? selectedDays.filter((d) => d !== day) : [...selectedDays, day],
    );
  };

  return (
    <div className="space-y-4">
      {frequency === 'weekly' && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-(--text-primary)">
            {t('taskWizard.steps.repeat.weekdaysLabel')}
          </label>
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_ORDER.map((day) => {
              const active = selectedDays.includes(String(day));
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleDay(String(day))}
                  className={cn(
                    'min-w-11 rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'border-(--primary) bg-(--primary) text-white'
                      : 'border-(--border) bg-(--card) text-(--text-primary) hover:border-(--primary)',
                  )}
                >
                  {t(`weekdays.${WEEKDAY_KEYS[day]}`)}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-(--text-muted)">{t('taskWizard.steps.repeat.weekdaysHint')}</p>
        </div>
      )}

      {frequency === 'monthly' && (
        <TextInputStep
          field="repeatDayOfMonth"
          label={t('taskWizard.steps.repeat.dayOfMonthLabel')}
          type="number"
          placeholder="1"
          description={t('taskWizard.steps.repeat.dayOfMonthHint')}
        />
      )}

      <TextInputStep
        field="repeatStartDate"
        label={t('taskWizard.steps.repeat.startDateLabel')}
        type="date"
        description={t('taskWizard.steps.repeat.startDateHint')}
      />
      <TextInputStep
        field="repeatEndDate"
        label={t('taskWizard.steps.repeat.endDateLabel')}
        type="date"
        description={t('taskWizard.steps.repeat.endDateHint')}
      />
      <TextInputStep
        field="repeatDeadlineOffsetDays"
        label={t('taskWizard.steps.repeat.offsetLabel')}
        type="number"
        placeholder="0"
        description={t('taskWizard.steps.repeat.offsetHint')}
      />
    </div>
  );
};

/** Monday first: the working week the people using this actually plan around. */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** Index 0-6 → the existing `weekdays.*` keys in the common namespace. */
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export function CreateTaskWizard({
  currentUserId,
  userRole,
  assigneeId,
  objectiveId,
  projectId,
  editingSeries,
  draftKey = 'create-task',
  className,
  onComplete,
  onCancel,
}: CreateTaskWizardProps) {
  const { t } = useTranslation();
  const { createOptimistic: createTask } = useOptimisticCreateTask();
  const createRecurringTask = useMutation(api.recurringTasks.createRecurringTask);
  const updateRecurringTask = useMutation(api.recurringTasks.updateRecurringTask);

  const addAttachment = useMutation(api.tasks.addAttachment);

  const safeUserId = currentUserId && currentUserId !== '' ? currentUserId : null;

  const employees = useQuery(api.tasks.getUsersForAssignment, safeUserId ? {} : 'skip');

  // The assignee list is exactly what the server query returns: it already
  // scopes per caller (whole org for admins, own reporting branch for
  // supervisors), so the wizard does not branch on role client-side.
  const availableEmployees = employees;

  // Goals linkage: fetch active objectives for task linking
  const userForQuery = useQuery(
    api.users.queries.getUserById,
    safeUserId ? { userId: safeUserId } : 'skip',
  );
  const objectivesForLinking = useQuery(
    api.goals.getObjectivesForTaskCreation,
    userForQuery?.organizationId
      ? { organizationId: userForQuery.organizationId as Id<'organizations'>, userId: safeUserId! }
      : 'skip',
  );

  // Regular employees can only create tasks for themselves, so the assignee
  // step is pure ceremony for them — drop it and hard-wire self-assignment in
  // handleSubmit instead of showing a one-option dropdown. The same applies
  // while editing a series that belongs to them.
  const isSelfAssignedOnly =
    userRole === 'employee' || (editingSeries && editingSeries.assignedTo === currentUserId);

  const steps: WizardStep[] = [
    {
      id: 'details',
      title: t('taskWizard.steps.details.title'),
      description: t('taskWizard.steps.details.description'),
      icon: <CheckSquare className="w-5 h-5" />,
      validation: (data) => !!data.title && String(data.title).trim().length > 0,
      content: (
        <div className="space-y-4">
          <TextInputStep
            field="title"
            label={t('taskWizard.steps.details.titleLabel')}
            placeholder={t('taskWizard.steps.details.titlePlaceholder')}
            required
          />
          <TextareaStep
            field="description"
            label={t('taskWizard.steps.details.descriptionLabel')}
            placeholder={t('taskWizard.steps.details.descriptionPlaceholder')}
            rows={5}
            // Someone else has to act on this text, and a vague description is
            // the most common reason a task bounces back for clarification.
            aiContext="task description"
          />
        </div>
      ),
    },
    ...(isSelfAssignedOnly
      ? []
      : [
          {
            id: 'assignee' as const,
            title: t('taskWizard.steps.assignee.title'),
            description: t('taskWizard.steps.assignee.description'),
            icon: <User className="w-5 h-5" />,
            validation: (data: Record<string, unknown>) => !!data.assigneeId,
            content: (
              <SelectStep
                field="assigneeId"
                label={t('taskWizard.steps.assignee.assigneeLabel')}
                options={
                  availableEmployees?.map((emp) => ({
                    value: emp._id,
                    label: `${emp.name}${emp.position ? ` — ${emp.position}` : ''}${emp.department ? ` (${emp.department})` : ''}`,
                  })) || []
                }
                placeholder={t('taskWizard.steps.assignee.assigneePlaceholder')}
                defaultValue={assigneeId}
                required
              />
            ),
          },
        ]),
    {
      id: 'priority',
      title: t('taskWizard.steps.priority.title'),
      description: t('taskWizard.steps.priority.description'),
      icon: <AlertCircle className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <SelectStep
            field="priority"
            label={t('taskWizard.steps.priority.priorityLabel')}
            options={[
              { value: 'low', label: t('priority.low') },
              { value: 'medium', label: t('priority.medium') },
              { value: 'high', label: t('priority.high') },
              { value: 'urgent', label: t('priority.urgent') },
            ]}
            placeholder={t('taskWizard.steps.priority.priorityPlaceholder')}
            defaultValue="medium"
          />
          <TextInputStep
            field="deadline"
            label={t('taskWizard.steps.priority.deadlineLabel')}
            type="date"
            description={t('taskWizard.steps.priority.deadlineDescription')}
          />
        </div>
      ),
    },
    {
      id: 'repeat',
      title: t('taskWizard.steps.repeat.title'),
      description: t('taskWizard.steps.repeat.description'),
      icon: <Repeat className="w-5 h-5" />,
      validation: (data) => {
        const frequency = (data.repeat as string | undefined) ?? 'none';
        if (frequency === 'none') return true;
        if (frequency === 'weekly') {
          const days = Array.isArray(data.repeatDaysOfWeek) ? data.repeatDaysOfWeek : [];
          return days.length > 0;
        }
        const day = Number(data.repeatDayOfMonth);
        return Number.isInteger(day) && day >= 1 && day <= 31;
      },
      content: (
        <div className="space-y-4">
          <SelectStep
            field="repeat"
            label={t('taskWizard.steps.repeat.frequencyLabel')}
            options={
              editingSeries
                ? [
                    { value: 'weekly', label: t('taskWizard.steps.repeat.frequency.weekly') },
                    { value: 'monthly', label: t('taskWizard.steps.repeat.frequency.monthly') },
                  ]
                : [
                    { value: 'none', label: t('taskWizard.steps.repeat.frequency.none') },
                    { value: 'weekly', label: t('taskWizard.steps.repeat.frequency.weekly') },
                    { value: 'monthly', label: t('taskWizard.steps.repeat.frequency.monthly') },
                  ]
            }
            placeholder={t('taskWizard.steps.repeat.frequencyPlaceholder')}
            defaultValue={editingSeries ? editingSeries.frequency : 'none'}
            description={t('taskWizard.steps.repeat.frequencyHint')}
          />
          <RepeatRuleFields />
        </div>
      ),
    },
    {
      id: 'tags',
      title: t('task.tags', 'Tags'),
      description: t('task.tagsHint', 'optional'),
      icon: <Tag className="w-5 h-5" />,
      content: (
        <TextInputStep
          field="tags"
          label={t('task.tags', 'Tags')}
          placeholder={t('task.tagsPlaceholder', 'e.g. bug, feature, docs (comma separated)')}
          description={t('task.tagsHint', 'optional')}
        />
      ),
    },
    {
      id: 'objectiveLink',
      title: t('taskWizard.steps.objectiveLink.title', 'Link to Goal'),
      description: t('taskWizard.steps.objectiveLink.description', 'Align this task with an OKR'),
      icon: <Target className="w-5 h-5" />,
      validation: () => true,
      content: (
        <div className="space-y-4">
          <SelectStep
            field="objectiveId"
            label={t('taskWizard.steps.objectiveLink.objectiveLabel', 'Objective')}
            options={
              objectivesForLinking?.map((obj) => ({
                value: obj._id,
                label: `${obj.title} (${obj.periodType} ${obj.periodYear})`,
              })) || []
            }
            placeholder={t(
              'taskWizard.steps.objectiveLink.objectivePlaceholder',
              'Select an objective (optional)',
            )}
            description={t(
              'taskWizard.steps.objectiveLink.objectiveHint',
              'Link this task to a strategic goal',
            )}
          />
          <ObjectiveLinkedKRField objectivesForLinking={objectivesForLinking} />
        </div>
      ),
    },
    {
      id: 'attachments',
      title: t('task.attachments', 'Attachments'),
      description: t('task.attachmentsHint', 'optional'),
      icon: <Paperclip className="w-5 h-5" />,
      content: (
        <FileUploadStep
          field="attachments"
          label={t('task.attachments', 'Attachments')}
          description={t('task.attachmentsHint', 'Add files to your task (optional)')}
          maxFiles={5}
          maxSizeMB={1}
        />
      ),
    },
  ];

  const handleSubmit = async (
    data: Record<string, string | number | boolean | string[] | null>,
  ) => {
    try {
      const tagsRaw = data.tags ? String(data.tags) : '';
      const tags = tagsRaw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const objectiveId = data.objectiveId
        ? (String(data.objectiveId) as Id<'objectives'>)
        : undefined;
      const keyResultId = data.keyResultId
        ? (String(data.keyResultId) as Id<'keyResults'>)
        : undefined;
      // The project picker is prop-driven for /tasks/new?projectId=…, but while
      // editing a series the link arrives through the prefilled step data.
      const resolvedProjectId = (
        data.projectId ? (String(data.projectId) as Id<'projects'>) : projectId
      ) as Id<'projects'> | undefined;

      const frequency = (data.repeat as string | undefined) ?? 'none';

      // A repeating task is a rule, not a task: it goes to its own table and the
      // hourly sweep files the occurrences. Creating a one-off here as well would
      // double up on whichever day the series starts.
      if (frequency === 'weekly' || frequency === 'monthly') {
        const daysOfWeek = Array.isArray(data.repeatDaysOfWeek)
          ? (data.repeatDaysOfWeek as string[]).map(Number).sort((a, b) => a - b)
          : [];
        const offsetRaw = Number(data.repeatDeadlineOffsetDays);
        const startDate = data.repeatStartDate
          ? String(data.repeatStartDate)
          : new Date().toISOString().slice(0, 10);
        const endDate = data.repeatEndDate ? String(data.repeatEndDate) : undefined;
        const deadlineOffsetDays =
          Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : undefined;

        // Files are part of the rule now: they travel with every occurrence the
        // sweep materializes, so the same briefing reaches each run of the task.
        const attachmentsJson = data.attachments as string | undefined;
        const attachments =
          attachmentsJson && attachmentsJson !== '[]' && attachmentsJson.length > 2
            ? (JSON.parse(attachmentsJson) as AttachmentData[]).map(
                ({ url, name, type, size }) => ({
                  url,
                  name,
                  type,
                  size,
                }),
              )
            : undefined;

        const result = editingSeries
          ? await updateRecurringTask({
              seriesId: editingSeries._id,
              title: String(data.title).trim(),
              description: data.description ? String(data.description).trim() : undefined,
              assignedTo: (isSelfAssignedOnly
                ? editingSeries.assignedTo
                : String(data.assigneeId)) as Id<'users'>,
              priority: (String(data.priority) || 'medium') as 'low' | 'medium' | 'high' | 'urgent',
              tags: tags.length > 0 ? tags : undefined,
              projectId: resolvedProjectId,
              objectiveId,
              keyResultId,
              frequency,
              daysOfWeek: frequency === 'weekly' ? daysOfWeek : undefined,
              dayOfMonth: frequency === 'monthly' ? Number(data.repeatDayOfMonth) : undefined,
              startDate,
              endDate,
              deadlineOffsetDays,
              attachments,
            })
          : await createRecurringTask({
              title: String(data.title).trim(),
              description: data.description ? String(data.description).trim() : undefined,
              assignedTo: (isSelfAssignedOnly
                ? currentUserId
                : String(data.assigneeId)) as Id<'users'>,
              priority: (String(data.priority) || 'medium') as 'low' | 'medium' | 'high' | 'urgent',
              tags: tags.length > 0 ? tags : undefined,
              projectId,
              objectiveId,
              keyResultId,
              frequency,
              daysOfWeek: frequency === 'weekly' ? daysOfWeek : undefined,
              dayOfMonth: frequency === 'monthly' ? Number(data.repeatDayOfMonth) : undefined,
              startDate,
              endDate,
              deadlineOffsetDays,
              attachments,
            });

        if (editingSeries) {
          toast.success(t('recurringTasks.updated'));
        } else {
          const created = result as {
            nextOccurrence: string | null;
          };
          toast.success(
            created.nextOccurrence
              ? t('recurringTasks.createdWithNext', { date: created.nextOccurrence })
              : t('recurringTasks.created'),
          );
        }
        onComplete?.();
        return;
      }

      const taskId = await createTask({
        assignedTo: (isSelfAssignedOnly ? currentUserId : String(data.assigneeId)) as Id<'users'>,
        assignedBy: currentUserId,
        title: String(data.title).trim(),
        description: data.description ? String(data.description).trim() : undefined,
        priority: (String(data.priority) || 'medium') as 'low' | 'medium' | 'high' | 'urgent',
        deadline: data.deadline ? new Date(String(data.deadline)).getTime() : undefined,
        tags: tags.length > 0 ? tags : undefined,
        objectiveId,
        keyResultId,
        projectId,
      });

      const attachmentsJson = data.attachments as string | undefined;
      if (attachmentsJson && attachmentsJson !== '[]' && attachmentsJson.length > 2) {
        const attachments = JSON.parse(attachmentsJson) as AttachmentData[];
        for (const attachment of attachments) {
          await addAttachment({
            taskId,
            url: attachment.url,
            name: attachment.name,
            type: attachment.type,
            size: attachment.size,
            uploadedBy: currentUserId,
          });
        }
      }

      toast.success(t('taskWizard.toast.success'));
      onComplete?.();
    } catch (error) {
      toast.error(getConvexErrorMessage(error, t('taskWizard.toast.error')));
      logger.error(error);
    }
  };

  const stepDefaults = React.useMemo(() => {
    // Editing a series: prefill every step from the rule, and no draft — a form
    // bound to an existing row must not resurrect stale input (see Wizard docs).
    if (editingSeries) {
      const repeatDaysOfWeek = (editingSeries.daysOfWeek ?? []).map(String);
      return {
        title: editingSeries.title,
        description: editingSeries.description ?? '',
        priority: editingSeries.priority,
        repeat: editingSeries.frequency,
        repeatDaysOfWeek,
        repeatDayOfMonth: editingSeries.dayOfMonth ? String(editingSeries.dayOfMonth) : '',
        repeatStartDate: editingSeries.startDate,
        repeatEndDate: editingSeries.endDate ?? '',
        repeatDeadlineOffsetDays: editingSeries.deadlineOffsetDays
          ? String(editingSeries.deadlineOffsetDays)
          : '',
        tags: (editingSeries.tags ?? []).join(', '),
        attachments: JSON.stringify(editingSeries.attachments ?? []),
        ...(editingSeries.projectId ? { projectId: editingSeries.projectId } : {}),
        ...(editingSeries.objectiveId ? { objectiveId: editingSeries.objectiveId } : {}),
        ...(editingSeries.keyResultId ? { keyResultId: editingSeries.keyResultId } : {}),
        ...(isSelfAssignedOnly ? {} : { assigneeId: editingSeries.assignedTo }),
      };
    }
    return { priority: 'medium', ...(objectiveId ? { objectiveId } : {}) };
  }, [editingSeries, objectiveId, isSelfAssignedOnly]);

  return (
    <Wizard
      className={className}
      steps={steps}
      onComplete={handleSubmit}
      onCancel={onCancel}
      submitLabel={editingSeries ? t('taskWizard.save', 'Save') : t('taskWizard.submit')}
      cancelLabel={t('actions.cancel')}
      defaultStepData={stepDefaults}
      draftKey={editingSeries ? undefined : draftKey}
    />
  );
}
