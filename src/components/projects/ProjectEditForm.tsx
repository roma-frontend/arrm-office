'use client';

/**
 * Project edit form — name, description, status, priority, dates and tags.
 *
 * Hosted in the slide-over opened from the Edit button on the project detail
 * page (`ProjectEditSheet`). The project's own document is passed in so the form
 * opens instant instead of waiting on a second subscription; after a save the
 * parent's live query refetches and the detail page updates in place.
 */

import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { Label } from '@/components/ui/label';
import { ShieldLoader } from '@/components/ui/ShieldLoader';

export interface ProjectEditFormProps {
  project: {
    _id: Id<'projects'>;
    name: string;
    description?: string;
    status: 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled';
    priority: 'low' | 'medium' | 'high' | 'urgent';
    deadline?: number;
    startDate?: number;
    endDate?: number;
    tags?: string[];
  };
  onDone: () => void;
}

const STATUS_OPTIONS: Array<{ value: string; labelKey: string; fallback: string }> = [
  { value: 'planning', labelKey: 'planning', fallback: 'Planning' },
  { value: 'active', labelKey: 'active', fallback: 'Active' },
  { value: 'on_hold', labelKey: 'onHold', fallback: 'On Hold' },
  { value: 'completed', labelKey: 'completed', fallback: 'Completed' },
  { value: 'cancelled', labelKey: 'cancelled', fallback: 'Cancelled' },
];

const PRIORITY_OPTIONS: Array<{ value: string; labelKey: string; fallback: string }> = [
  { value: 'low', labelKey: 'low', fallback: 'Low' },
  { value: 'medium', labelKey: 'medium', fallback: 'Medium' },
  { value: 'high', labelKey: 'high', fallback: 'High' },
  { value: 'urgent', labelKey: 'urgent', fallback: 'Urgent' },
];

/** Milliseconds since epoch → `yyyy-mm-dd` for a date input. */
const toDateInput = (ms: number | undefined) => (ms ? new Date(ms).toISOString().slice(0, 10) : '');

const fromDateInput = (value: string) => (value ? new Date(value).getTime() : undefined);

const toTagInput = (tags: string[] | undefined) => (tags && tags.length > 0 ? tags.join(', ') : '');

const fromTagInput = (value: string) =>
  value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

export function ProjectEditForm({ project, onDone }: ProjectEditFormProps) {
  const { t } = useTranslation();
  const updateProject = useMutation(api.projects.updateProject);

  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [status, setStatus] = useState(project.status);
  const [priority, setPriority] = useState(project.priority);
  const [deadline, setDeadline] = useState(toDateInput(project.deadline));
  const [startDate, setStartDate] = useState(toDateInput(project.startDate));
  const [endDate, setEndDate] = useState(toDateInput(project.endDate));
  const [tags, setTags] = useState(toTagInput(project.tags));
  const [saving, setSaving] = useState(false);

  const statusLabel = (o: (typeof STATUS_OPTIONS)[number]) =>
    t(`projects.status.${o.labelKey}`, o.fallback);
  const priorityLabel = (o: (typeof PRIORITY_OPTIONS)[number]) =>
    t(`projects.priority.${o.labelKey}`, o.fallback);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error(t('projects.nameRequired', 'Project name is required'));
      return;
    }
    setSaving(true);
    try {
      await updateProject({
        projectId: project._id,
        name: name.trim(),
        description: description.trim() || undefined,
        status,
        priority,
        deadline: fromDateInput(deadline),
        startDate: fromDateInput(startDate),
        endDate: fromDateInput(endDate),
        tags: fromTagInput(tags),
      });
      toast.success(t('projects.updated', 'Project updated'));
      onDone();
    } catch (error) {
      logger.error('Failed to update project:', error);
      toast.error(error instanceof Error ? error.message : t('projects.updateFailed', 'Failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <Label>{t('projects.name', 'Project Name')} *</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('projects.namePlaceholder', 'e.g. Q4 Product Launch')}
          className="mt-1"
        />
      </div>

      <div>
        <Label>{t('projects.description', 'Description')}</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('projects.descPlaceholder', 'Brief project overview...')}
          rows={3}
          className="mt-1"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <Label>{t('projects.statusLabel', 'Status')}</Label>
          <CustomSelect
            fullWidth
            triggerClassName="mt-1 w-full"
            value={status}
            onChange={(v) =>
              setStatus(v as 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled')
            }
            options={STATUS_OPTIONS.map((o) => ({ value: o.value, label: statusLabel(o) }))}
          />
        </div>

        <div>
          <Label>{t('projects.priorityLabel', 'Priority')}</Label>
          <CustomSelect
            fullWidth
            triggerClassName="mt-1 w-full"
            value={priority}
            onChange={(v) => setPriority(v as 'low' | 'medium' | 'high' | 'urgent')}
            options={PRIORITY_OPTIONS.map((o) => ({ value: o.value, label: priorityLabel(o) }))}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div>
          <Label>{t('projects.startDate', 'Start date')}</Label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label>{t('projects.endDate', 'End date')}</Label>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label>{t('projects.deadline', 'Deadline')}</Label>
          <Input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="mt-1"
          />
        </div>
      </div>

      <div>
        <Label>{t('projects.tagsLabel', 'Tags')}</Label>
        <Input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder={t('projects.tagsPlaceholder', 'Comma-separated tags')}
          className="mt-1"
        />
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <ShieldLoader size="xs" variant="inline" /> : <Save className="w-4 h-4" />}
          {saving ? t('buttons.saving', 'Saving…') : t('buttons.saveChanges', 'Save changes')}
        </Button>
      </div>
    </form>
  );
}

export default ProjectEditForm;
