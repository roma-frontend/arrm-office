'use client';

import { useState, useRef } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { uploadTaskAttachment } from '@/actions/cloudinary';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { CustomSelect } from '@/components/ui/CustomSelect';

interface Props {
  currentUserId: Id<'users'>;
  userRole: 'admin' | 'supervisor' | 'employee';
  onClose: () => void;
}

export function CreateTaskModal({ currentUserId, userRole, onClose }: Props) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState<string>('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [deadline, setDeadline] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ uploaded: number; total: number } | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const safeUserId = currentUserId && currentUserId !== '' ? currentUserId : null;

  const employees = useQuery(
    api.tasks.getUsersForAssignment,
    safeUserId ? { requesterId: safeUserId } : 'skip',
  );
  const myEmployees = useQuery(
    api.tasks.getMyEmployees,
    userRole === 'supervisor' && safeUserId ? { supervisorId: safeUserId } : 'skip',
  );

  const createTask = useMutation(api.tasks.createTask);
  const addAttachment = useMutation(api.tasks.addAttachment);

  const handleFileAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files ?? []).filter((f) => {
      if (f.size > 10 * 1024 * 1024) {
        toast.error(`${f.name} too large (max 10MB)`);
        return false;
      }
      return true;
    });
    setFiles((prev) => [...prev, ...newFiles].slice(0, 10));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const availableEmployees = userRole === 'admin' ? employees : myEmployees;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError(t('task.titleRequired'));
      return;
    }
    if (!assignedTo) {
      setError(t('task.selectAssignee'));
      return;
    }

    setLoading(true);
    setError('');
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const taskId = await createTask({
        title: title.trim(),
        description: description.trim() || undefined,
        assignedTo: assignedTo as Id<'users'>,
        assignedBy: currentUserId,
        priority,
        deadline: deadline ? new Date(deadline).getTime() : undefined,
        tags: tags.length > 0 ? tags : undefined,
      });

      // Upload attachments if any
      if (files.length > 0 && taskId) {
        setUploadProgress({ uploaded: 0, total: files.length });
        let uploaded = 0;
        for (const file of files) {
          try {
            const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
            const url = await uploadTaskAttachment(base64, file.name);
            await addAttachment({
              taskId: taskId as Id<'tasks'>,
              url,
              name: file.name,
              type: file.type,
              size: file.size,
              uploadedBy: currentUserId,
            });
            uploaded++;
            setUploadProgress({ uploaded, total: files.length });
          } catch {
            toast.error(`Failed to upload ${file.name}`);
          }
        }
        setUploadProgress(null);
      }

      onClose();
    } catch (err: any) {
      setError(err.message ?? t('task.failedToCreate'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-(--card) rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-(--border)">
        {/* Header */}
        <div className="px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold ">{t('task.createTask')}</h2>
              <p className="text-black-200 text-sm mt-0.5">{t('task.assignTask')}</p>
            </div>
            <Button
              onClick={onClose}
              variant="ghost"
              size="icon"
              className="w-8 h-8 rounded-full hover:bg-white/30"
            >
              ✕
            </Button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-semibold text-(--text-secondary) mb-1.5">
              {t('task.taskTitleRequired')}
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('task.titlePlaceholder')}
              className="w-full px-4 py-2.5 rounded-xl border border-(--input-border) bg-(--input) text-(--text-primary) text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder:text-(--text-muted)"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold text-(--text-secondary) mb-1.5">
              {t('task.description')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('task.descriptionPlaceholder')}
              rows={3}
              className="w-full px-4 py-2.5 rounded-xl border border-(--input-border) bg-(--input) text-(--text-primary) text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent resize-none placeholder:text-(--text-muted)"
            />
          </div>

          {/* Assignee */}
          <div>
            <label className="block text-sm font-semibold text-(--text-secondary) mb-1.5">
              {t('task.assignToRequired')}
            </label>
            <CustomSelect
              value={assignedTo}
              onChange={setAssignedTo}
              fullWidth
              options={[
                { value: '', label: t('task.selectEmployee') },
                ...(availableEmployees?.map((emp) => ({
                  value: emp._id,
                  label: `${emp.name}${emp.role ? ` [${t(`roles.${emp.role}`)}]` : ''}${emp.position ? ` — ${emp.position}` : ''}${emp.department ? ` (${emp.department})` : ''}`,
                })) || []),
              ]}
              triggerClassName="w-full px-4 py-2.5 rounded-xl border border-(--border) bg-(--background-subtle) text-(--text-primary) text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
              dropdownClassName="bg-(--background-subtle) border border-(--border) text-(--text-primary)"
            />
            {availableEmployees?.length === 0 && (
              <p className="text-xs text-amber-400 mt-1">
                {userRole === 'supervisor'
                  ? t('task.noEmployeesAssigned')
                  : t('task.noEmployeesFound')}
              </p>
            )}
          </div>

          {/* Priority + Deadline row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-(--text-secondary) mb-1.5">
                {t('task.priority')}
              </label>
              <CustomSelect
                value={priority}
                onChange={(v) => setPriority(v as any)}
                fullWidth
                options={[
                  { value: 'low', label: t('task.low') },
                  { value: 'medium', label: t('task.medium') },
                  { value: 'high', label: t('task.high') },
                  { value: 'urgent', label: t('task.urgent') },
                ]}
                triggerClassName="w-full px-4 py-2.5 rounded-xl border border-(--border) bg-(--background-subtle) text-(--text-primary) text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                dropdownClassName="bg-(--background-subtle) border border-(--border) text-(--text-primary)"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-(--text-secondary) mb-1.5">
                {t('task.deadline')}
              </label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-4 py-2.5 rounded-xl border border-(--border) bg-(--background-subtle) text-(--text-primary) text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-semibold text-(--text-secondary) mb-1.5">
              {t('task.tags')}{' '}
              <span className="font-normal text-(--text-muted)">{t('task.tagsHint')}</span>
            </label>
            <input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder={t('task.tagsPlaceholder')}
              className="w-full px-4 py-2.5 rounded-xl border border-(--input-border) bg-(--input) text-(--text-primary) text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder:text-(--text-muted)"
            />
          </div>

          {/* File attachments preview */}
          <div>
            <label className="block text-sm font-semibold text-(--text-secondary) mb-1.5">
              {t('task.attachments')}
            </label>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={files.length >= 10}
                  className="px-3 py-2 rounded-xl border border-(--border) bg-(--background-subtle) text-(--text-secondary) text-sm hover:bg-(--border) transition-colors disabled:opacity-50"
                >
                  📎 {t('task.addFiles')}
                </button>
                {files.length > 0 && (
                  <span className="text-xs text-(--text-muted)">
                    {files.length}/10 {t('task.filesSelected')}
                  </span>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="*/*"
                className="hidden"
                onChange={handleFileAdd}
              />
              {files.length > 0 && (
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                  {files.map((file, index) => (
                    <div
                      key={index}
                      className="group relative flex items-center gap-2 p-2 rounded-lg border border-(--border) bg-(--background-subtle)"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-(--text-primary) truncate">
                          {file.name}
                        </p>
                        <p className="text-xs text-(--text-muted)">
                          {(file.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="w-6 h-6 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-sm hover:bg-red-500/30 transition-colors"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-xl border border-(--border) text-(--text-secondary) text-sm font-medium hover:bg-(--background-subtle) transition-colors disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-xl bg-linear-to-r from-(--primary) to-(--primary-dark,var(--primary)) hover:opacity-90 text-white text-sm font-semibold shadow-md shadow-blue-500/20 transition-all disabled:opacity-60"
            >
              {loading
                ? uploadProgress
                  ? `${t('task.uploading')} (${uploadProgress.uploaded}/${uploadProgress.total})`
                  : t('task.creating')
                : t('task.createTaskButton')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
