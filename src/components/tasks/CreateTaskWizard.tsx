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
import { CheckSquare, User, AlertCircle, Tag, Paperclip } from 'lucide-react';
import { useMutation, useQuery } from 'convex/react';
import { useOptimisticCreateTask } from '@/hooks/useOptimisticActions';
import { api } from '@/convex/_generated/api';

interface AttachmentData {
  url: string;
  name: string;
  type: string;
  size: number;
}
import type { Id } from '@/convex/_generated/dataModel';
import { toast } from 'sonner';

interface CreateTaskWizardProps {
  currentUserId: Id<'users'>;
  userRole: 'admin' | 'supervisor' | 'employee';
  assigneeId?: Id<'users'>;
  onComplete?: () => void;
  onCancel?: () => void;
}

export function CreateTaskWizard({
  currentUserId,
  userRole,
  assigneeId,
  onComplete,
  onCancel,
}: CreateTaskWizardProps) {
  const { t } = useTranslation();
  const { createOptimistic: createTask } = useOptimisticCreateTask();
  const addAttachment = useMutation(api.tasks.addAttachment);

  const safeUserId = currentUserId && currentUserId !== '' ? currentUserId : null;

  const employees = useQuery(
    api.tasks.getUsersForAssignment,
    safeUserId ? { requesterId: safeUserId } : 'skip',
  );
  const myEmployees = useQuery(
    api.tasks.getMyEmployees,
    userRole === 'supervisor' && safeUserId ? { supervisorId: safeUserId } : 'skip',
  );

  const availableEmployees = userRole === 'admin' ? employees : myEmployees;

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
          />
        </div>
      ),
    },
    {
      id: 'assignee',
      title: t('taskWizard.steps.assignee.title'),
      description: t('taskWizard.steps.assignee.description'),
      icon: <User className="w-5 h-5" />,
      validation: (data) => !!data.assigneeId,
      content: (
        <SelectStep
          field="assigneeId"
          label={t('taskWizard.steps.assignee.assigneeLabel')}
          options={
            availableEmployees?.map((emp: any) => ({
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

      const taskId = await createTask({
        assignedTo: String(data.assigneeId) as Id<'users'>,
        assignedBy: currentUserId,
        title: String(data.title).trim(),
        description: data.description ? String(data.description).trim() : undefined,
        priority: (String(data.priority) || 'medium') as 'low' | 'medium' | 'high' | 'urgent',
        deadline: data.deadline ? new Date(String(data.deadline)).getTime() : undefined,
        tags: tags.length > 0 ? tags : undefined,
      });

      const attachmentsJson = data.attachments as string | undefined;
      if (attachmentsJson && attachmentsJson !== '[]' && attachmentsJson.length > 2) {
        const attachments: AttachmentData[] = JSON.parse(attachmentsJson);
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
      toast.error(t('taskWizard.toast.error'));
      console.error(error);
    }
  };

  return (
    <Wizard
      steps={steps}
      onComplete={handleSubmit}
      onCancel={onCancel}
      submitLabel={t('taskWizard.submit')}
      cancelLabel={t('actions.cancel')}
      defaultStepData={{ priority: 'medium' }}
    />
  );
}
