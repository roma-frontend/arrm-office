/**
 * Attachments on an open task.
 *
 * Attaching is part of doing the work, so the assignee can add files here rather
 * than only the person who created the task being able to at creation time. The
 * card is always rendered for anyone who may attach: an empty list with an upload
 * control is the whole point, and hiding it until a file exists made the feature
 * unreachable for the person who actually has the document.
 *
 * The visibility rules below only decide what to show. The mutations enforce the
 * same rules server-side, so a hidden control is convenience, not security.
 */

'use client';

import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from 'convex/react';
import { toast } from 'sonner';
import { FileText, Paperclip, Trash2, Upload } from 'lucide-react';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { uploadTaskAttachment } from '@/actions/cloudinary';
import { getConvexErrorMessage } from '@/lib/error-handler';
import { logger } from '@/lib/logger';

const MAX_SIZE_MB = 10;

export interface TaskAttachment {
  url: string;
  name: string;
  type: string;
  size: number;
  uploadedBy?: Id<'users'>;
  uploadedAt?: number;
}

interface TaskAttachmentsCardProps {
  taskId: Id<'tasks'>;
  attachments: TaskAttachment[];
  /** The signed-in user, or undefined while the auth store hydrates. */
  currentUserId?: Id<'users'>;
  currentUserRole?: string;
  /** From the task: who has to do it, and who handed it over. */
  assignedTo: Id<'users'>;
  assignedBy: Id<'users'>;
  /** The assignee's supervisor, so their manager can attach too. */
  assigneeSupervisorId?: Id<'users'>;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TaskAttachmentsCard({
  taskId,
  attachments,
  currentUserId,
  currentUserRole,
  assignedTo,
  assignedBy,
  assigneeSupervisorId,
}: TaskAttachmentsCardProps) {
  const { t } = useTranslation();
  const addAttachment = useMutation(api.tasks.addAttachment);
  const removeAttachment = useMutation(api.tasks.removeAttachment);

  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removingUrl, setRemovingUrl] = useState<string | null>(null);

  const isManager =
    currentUserRole === 'admin' ||
    currentUserRole === 'superadmin' ||
    (currentUserRole === 'supervisor' && assigneeSupervisorId === currentUserId) ||
    assignedBy === currentUserId;

  const canAttach = !!currentUserId && (isManager || assignedTo === currentUserId);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0 || !currentUserId) return;

      setUploading(true);
      try {
        for (const file of Array.from(files)) {
          if (file.size / (1024 * 1024) > MAX_SIZE_MB) {
            toast.error(t('taskAttachments.tooLarge', { name: file.name, max: MAX_SIZE_MB }));
            continue;
          }

          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error('Could not read the file'));
            reader.readAsDataURL(file);
          });

          const url = await uploadTaskAttachment(base64, file.name, file.type);
          await addAttachment({
            taskId,
            url,
            name: file.name,
            type: file.type,
            size: file.size,
          });
        }
        toast.success(t('taskAttachments.uploaded'));
      } catch (error) {
        logger.error('Failed to attach file', error);
        toast.error(getConvexErrorMessage(error, t('taskAttachments.uploadFailed')));
      } finally {
        setUploading(false);
        // Clearing lets the same file be picked again after a failure.
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [addAttachment, currentUserId, t, taskId],
  );

  const handleRemove = async (attachment: TaskAttachment) => {
    setRemovingUrl(attachment.url);
    try {
      await removeAttachment({ taskId, url: attachment.url });
      toast.success(t('taskAttachments.removed'));
    } catch (error) {
      toast.error(getConvexErrorMessage(error, t('taskAttachments.removeFailed')));
    } finally {
      setRemovingUrl(null);
    }
  };

  // Nothing to show and nothing they could do: stay out of the way.
  if (!canAttach && attachments.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <Paperclip className="h-5 w-5" />
          {t('taskAttachments.title')}
        </CardTitle>
        {canAttach && (
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="shrink-0 gap-2"
            >
              <Upload className="h-4 w-4" />
              {uploading ? t('taskAttachments.uploading') : t('taskAttachments.attachFile')}
            </Button>
          </>
        )}
      </CardHeader>
      <CardContent>
        {attachments.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {canAttach ? t('taskAttachments.clickToAttach') : t('taskAttachments.noAttachments')}
          </p>
        ) : (
          <div className="space-y-2">
            {attachments.map((attachment) => {
              // An employee may take back their own upload but not a manager's brief.
              const mayRemove = canAttach && (isManager || attachment.uploadedBy === currentUserId);

              return (
                <div
                  key={attachment.url}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{attachment.name}</p>
                      {attachment.size > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {formatSize(attachment.size)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {/* A real link: the old button did nothing at all. */}
                    <Button variant="ghost" size="sm" asChild>
                      <a href={attachment.url} target="_blank" rel="noopener noreferrer">
                        {t('taskAttachments.download')}
                      </a>
                    </Button>
                    {mayRemove && (
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={removingUrl === attachment.url}
                        aria-label={t('taskAttachments.deleteFile')}
                        onClick={() => handleRemove(attachment)}
                        className="text-red-500 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default TaskAttachmentsCard;
