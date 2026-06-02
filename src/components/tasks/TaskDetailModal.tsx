'use client';

import React, { useState, useRef } from 'react';
import { useMainRef } from '@/hooks/useMainRef';
import { useMutation, useQuery, usePaginatedQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@/lib/date-format';
import { api } from '../../../convex/_generated/api';
import { TaskAttachments } from './TaskAttachments';
import { Button } from '@/components/ui/button';
import { CustomSelect } from '@/components/ui/CustomSelect';
import type { Id } from '../../../convex/_generated/dataModel';
import Image from 'next/image';
import { motion, AnimatePresence } from '@/lib/cssMotion';

type Status = 'pending' | 'in_progress' | 'review' | 'completed' | 'cancelled';
type Priority = 'low' | 'medium' | 'high' | 'urgent';

const STATUS_STYLES: Record<Status, { color: string; bg: string; dot: string }> = {
  pending: {
    color: 'text-(--text-muted)',
    bg: 'bg-(--background-subtle)',
    dot: 'bg-(--text-muted)',
  },
  in_progress: { color: 'text-blue-400', bg: 'bg-blue-500/10', dot: 'bg-blue-500' },
  review: { color: 'text-amber-400', bg: 'bg-amber-500/10', dot: 'bg-amber-500' },
  completed: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', dot: 'bg-emerald-500' },
  cancelled: { color: 'text-rose-400', bg: 'bg-rose-500/10', dot: 'bg-rose-400' },
};

const PRIORITY_STYLES: Record<Priority, { color: string; bg: string; icon: string }> = {
  low: { color: 'text-(--text-muted)', bg: 'bg-(--background-subtle)', icon: '↓' },
  medium: { color: 'text-blue-400', bg: 'bg-blue-500/10', icon: '→' },
  high: { color: 'text-orange-400', bg: 'bg-orange-500/10', icon: '↑' },
  urgent: { color: 'text-rose-400', bg: 'bg-rose-500/10', icon: '⚡' },
};

function getStatusLabel(status: Status, t: (key: string) => string): string {
  const keys: Record<Status, string> = {
    pending: 'tasksClient.pending',
    in_progress: 'tasksClient.inProgress',
    review: 'tasksClient.inReview',
    completed: 'tasksClient.completed',
    cancelled: 'tasksClient.cancelled',
  };
  return t(keys[status]);
}

function getPriorityLabel(priority: Priority, t: (key: string) => string): string {
  const keys: Record<Priority, string> = {
    low: 'tasksClient.low',
    medium: 'tasksClient.medium',
    high: 'tasksClient.high',
    urgent: 'tasksClient.urgent',
  };
  return t(keys[priority]);
}

// Status transitions available per role
const EMPLOYEE_TRANSITIONS: Record<Status, Status[]> = {
  pending: ['in_progress'],
  in_progress: ['review', 'pending'],
  review: ['in_progress'],
  completed: [],
  cancelled: [],
};

const MANAGER_TRANSITIONS: Record<Status, Status[]> = {
  pending: ['in_progress', 'cancelled'],
  in_progress: ['review', 'pending', 'cancelled'],
  review: ['completed', 'in_progress', 'cancelled'],
  completed: ['in_progress'],
  cancelled: ['pending'],
};

function Avatar({ name, url }: { name: string; url?: string | null }) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  return (
    <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 flex items-center justify-center font-bold text-white text-xs bg-linear-to-br from-blue-500 to-sky-500">
      {url ? (
        <Image
          src={url}
          width={32}
          height={32}
          alt={name}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        initials
      )}
    </div>
  );
}

interface Props {
  task: any;
  currentUserId: Id<'users'>;
  userRole: 'admin' | 'supervisor' | 'employee';
  onClose: () => void;
}

export function TaskDetailModal({ task, currentUserId, userRole, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const mainRef = useMainRef();
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDesc, setEditDesc] = useState(task.description ?? '');
  const [editPriority, setEditPriority] = useState<Priority>(task.priority);
  const [editDeadline, setEditDeadline] = useState(
    task.deadline ? new Date(task.deadline).toISOString().split('T')[0] : '',
  );
  const modalBodyRef = useRef<HTMLDivElement>(null);

  const canManage = userRole === 'admin' || userRole === 'supervisor';
  const isAssignee = task.assignedTo === currentUserId;

  // Fetch fresh task data (reactive to attachment changes)
  const freshTask = useQuery(api.tasks.getTask, { taskId: task._id });
  const taskData = freshTask ?? task;

  const {
    results: comments,
    status: commentsStatus,
    loadMore: loadMoreComments,
  } = usePaginatedQuery(
    api.tasks.listCommentsPaginated,
    { taskId: task._id },
    { initialNumItems: 20 },
  );
  const updateStatus = useMutation(api.tasks.updateTaskStatus);
  const updateTask = useMutation(api.tasks.updateTask);
  const deleteTask = useMutation(api.tasks.deleteTask);
  const addComment = useMutation(api.tasks.addComment);
  const markRead = useMutation(api.notifications.markAllAsRead);

  // Mark task notifications as read when modal opens
  React.useEffect(() => {
    markRead({ userId: currentUserId }).catch(() => {});

    // Scroll modal body to top
    if (modalBodyRef.current) {
      modalBodyRef.current.scrollTop = 0;
    }

    // Scroll main element to top and disable its scroll
    const mainElement = mainRef.current;
    const originalScrollTop = mainElement?.scrollTop ?? 0;
    const originalOverflow = mainElement?.style.overflow;

    if (mainElement) {
      mainElement.scrollTop = 0;
      mainElement.style.overflow = 'hidden';
    }

    return () => {
      if (mainElement) {
        mainElement.style.overflow = originalOverflow || '';
        mainElement.scrollTop = originalScrollTop;
      }
    };
  }, []);

  const statusCfg = STATUS_STYLES[taskData.status as Status];
  const priorityCfg = PRIORITY_STYLES[taskData.priority as Priority];
  const statusLabel = getStatusLabel(taskData.status as Status, t);
  const priorityLabel = getPriorityLabel(taskData.priority as Priority, t);

  const transitions = canManage
    ? MANAGER_TRANSITIONS[taskData.status as Status]
    : EMPLOYEE_TRANSITIONS[taskData.status as Status];

  const handleStatusChange = async (newStatus: Status) => {
    await updateStatus({ taskId: task._id, status: newStatus, userId: currentUserId });
    onClose();
  };

  const handleSaveEdit = async () => {
    await updateTask({
      taskId: task._id,
      title: editTitle.trim(),
      description: editDesc.trim() || undefined,
      priority: editPriority,
      deadline: editDeadline ? new Date(editDeadline).getTime() : undefined,
    });
    setEditMode(false);
    onClose();
  };

  const handleDelete = async () => {
    setShowDeleteModal(true);
  };

  const confirmDeleteTaskAction = async () => {
    await deleteTask({ taskId: task._id });
    setShowDeleteModal(false);
    onClose();
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    setSubmitting(true);
    await addComment({ taskId: task._id, authorId: currentUserId, content: comment.trim() });
    setComment('');
    setSubmitting(false);
  };

  const deadlinePassed =
    taskData.deadline && taskData.deadline < Date.now() && taskData.status !== 'completed';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-(--card) rounded-3xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden border border-(--border)">
        {/* Header */}
        <div className="px-6 py-5 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {editMode ? (
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full bg-white/20 text-white placeholder-white/60 rounded-xl px-3 py-1.5 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-white/50"
                />
              ) : (
                <h2 className="text-xl font-bold leading-snug">{taskData.title}</h2>
              )}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/20">
                  {statusLabel}
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/20 text-white">
                  {priorityCfg.icon} {priorityLabel}
                </span>
                {deadlinePassed && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-500/80 text-white">
                    ⏰ {t('taskDetail.overdue')}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {canManage && !editMode && (
                <Button
                  onClick={() => setEditMode(true)}
                  variant="ghost"
                  size="icon"
                  className="w-8 h-8 rounded-full hover:bg-white/30"
                  title={t('ariaLabels.editTask')}
                >
                  ✏️
                </Button>
              )}
              {editMode && (
                <>
                  <Button onClick={handleSaveEdit} variant="default" size="sm">
                    {t('buttons.save')}
                  </Button>
                  <Button onClick={() => setEditMode(false)} variant="ghost" size="sm">
                    {t('buttons.cancel')}
                  </Button>
                </>
              )}
              {canManage && !editMode && (
                <Button
                  onClick={handleDelete}
                  variant="ghost"
                  size="icon"
                  className="w-8 h-8 rounded-full hover:bg-rose-500/80"
                  title={t('ariaLabels.deleteTask')}
                >
                  🗑️
                </Button>
              )}
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
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            {/* Description */}
            <div>
              <h3 className="text-xs font-semibold text-(--text-muted) uppercase tracking-wide mb-2">
                {t('taskDetail.description')}
              </h3>
              {editMode ? (
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-xl border border-(--border) bg-(--background-subtle) text-(--text-primary) text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                />
              ) : (
                <p className="text-(--text-secondary) text-sm leading-relaxed">
                  {taskData.description || (
                    <span className="text-(--text-muted) italic">
                      {t('taskDetail.noDescription')}
                    </span>
                  )}
                </p>
              )}
            </div>

            {/* Meta info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <h3 className="text-xs font-semibold text-(--text-muted) uppercase tracking-wide mb-2">
                  {t('taskDetail.assignedTo')}
                </h3>
                <div className="flex items-center gap-2">
                  <Avatar
                    name={taskData.assignedToUser?.name ?? '?'}
                    url={taskData.assignedToUser?.avatarUrl}
                  />
                  <div>
                    <p className="text-sm font-medium text-(--text-primary)">
                      {taskData.assignedToUser?.name ?? '—'}
                    </p>
                    <p className="text-xs text-(--text-muted)">
                      {taskData.assignedToUser?.position ?? ''}
                    </p>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-(--text-muted) uppercase tracking-wide mb-2">
                  {t('taskDetail.assignedBy')}
                </h3>
                <div className="flex items-center gap-2">
                  <Avatar
                    name={taskData.assignedByUser?.name ?? '?'}
                    url={taskData.assignedByUser?.avatarUrl}
                  />
                  <div>
                    <p className="text-sm font-medium text-(--text-primary)">
                      {taskData.assignedByUser?.name ?? '—'}
                    </p>
                    <p className="text-xs text-(--text-muted)">
                      {taskData.assignedByUser?.role ?? ''}
                    </p>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-(--text-muted) uppercase tracking-wide mb-2">
                  {t('taskDetail.priority')}
                </h3>
                {editMode ? (
                  <CustomSelect
                    value={editPriority}
                    onChange={(v) => setEditPriority(v as Priority)}
                    options={[
                      { value: 'low', label: `↓ ${t('taskDetail.low')}` },
                      { value: 'medium', label: `→ ${t('taskDetail.medium')}` },
                      { value: 'high', label: `↑ ${t('taskDetail.high')}` },
                      { value: 'urgent', label: `⚡ ${t('taskDetail.urgent')}` },
                    ]}
                    triggerClassName="px-3 py-1.5 rounded-lg border border-(--border) bg-(--background-subtle) text-(--text-primary) text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    dropdownClassName="bg-(--background-subtle) border border-(--border) text-(--text-primary)"
                  />
                ) : (
                  <span
                    className={`text-sm font-semibold px-3 py-1 rounded-full ${priorityCfg.bg} ${priorityCfg.color}`}
                  >
                    {priorityCfg.icon} {priorityLabel}
                  </span>
                )}
              </div>
              <div>
                <h3 className="text-xs font-semibold text-(--text-muted) uppercase tracking-wide mb-2">
                  {t('taskDetail.deadline')}
                </h3>
                {editMode ? (
                  <input
                    type="date"
                    value={editDeadline}
                    onChange={(e) => setEditDeadline(e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-(--border) bg-(--background-subtle) text-(--text-primary) text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                ) : taskData.deadline ? (
                  <p
                    className={`text-sm font-medium ${deadlinePassed ? 'text-rose-400' : 'text-(--text-primary)'}`}
                  >
                    {deadlinePassed ? '⏰ ' : '📅 '}
                    {formatDate(taskData.deadline, i18n.language, {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                ) : (
                  <p className="text-sm text-(--text-muted) italic">{t('taskDetail.noDeadline')}</p>
                )}
              </div>
            </div>

            {/* Tags */}
            {taskData.tags && taskData.tags.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-(--text-muted) uppercase tracking-wide mb-2">
                  {t('taskDetail.tags')}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {taskData.tags.map((tag: any) => (
                    <span
                      key={tag}
                      className="text-xs bg-blue-500/10 text-blue-400 px-3 py-1 rounded-full font-medium"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Status transitions */}
            {transitions.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-(--text-muted) uppercase tracking-wide mb-2">
                  {t('taskDetail.moveTo')}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {transitions.map((st) => {
                    const cfg = STATUS_STYLES[st];
                    return (
                      <button
                        key={st}
                        onClick={() => handleStatusChange(st)}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border ${cfg.bg} ${cfg.color} border-current/20 hover:scale-105 transition-all shadow-sm`}
                      >
                        <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                        {getStatusLabel(st, t)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Attachments */}
            <div>
              <TaskAttachments
                taskId={taskData._id as Id<'tasks'>}
                attachments={taskData.attachments ?? []}
                currentUserId={currentUserId}
                canUpload={true}
              />
            </div>

            {/* Comments */}
            <div>
              <h3 className="text-xs font-semibold text-(--text-muted) uppercase tracking-wide mb-3">
                {t('taskDetail.comments')} {comments ? `(${comments.length})` : ''}
              </h3>
              <div className="space-y-3 mb-4 max-h-48 overflow-y-auto pr-1">
                {comments?.length === 0 && (
                  <p className="text-sm text-(--text-muted) italic text-center py-3">
                    {t('taskDetail.noComments')}
                  </p>
                )}
                {comments?.map((c) => (
                  <div key={c._id} className="flex gap-3">
                    <Avatar name={c.author?.name ?? '?'} url={c.author?.avatarUrl} />
                    <div className="flex-1 bg-(--background-subtle) rounded-2xl px-4 py-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-(--text-primary)">
                          {c.author?.name}
                        </span>
                        <span className="text-xs text-(--text-muted)">
                          {formatDate(c.createdAt, i18n.language, {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-sm text-(--text-secondary) leading-relaxed">{c.content}</p>
                    </div>
                  </div>
                ))}
                {commentsStatus === 'CanLoadMore' && (
                  <button
                    type="button"
                    onClick={() => loadMoreComments(20)}
                    className="text-xs text-[#2563eb] hover:underline py-1"
                  >
                    {t('taskDetail.loadMoreComments', { defaultValue: 'Load more comments' })}
                  </button>
                )}
              </div>

              {/* Comment input */}
              <form onSubmit={handleComment} className="flex gap-2">
                <input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={t('placeholders.addAComment')}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-(--input-border) bg-(--input) text-(--text-primary) text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-(--text-muted)"
                />
                <button
                  type="submit"
                  disabled={submitting || !comment.trim()}
                  className="px-4 py-2.5 rounded-xl btn-gradient text-white text-sm font-semibold disabled:opacity-50 shadow-sm"
                >
                  {t('buttons.send')}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Delete task confirmation modal */}
      <AnimatePresence>
        {showDeleteModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[99999] bg-black/80 flex items-center justify-center p-4"
            onClick={() => setShowDeleteModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-(--card) border border-(--border) rounded-2xl overflow-hidden max-w-md w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-rose-500/10 border-b border-rose-500/20 px-6 py-5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-rose-500/20 flex items-center justify-center text-2xl">
                    🗑️
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-rose-400">
                      {t('tasksClient.deleteTask')}
                    </h3>
                    <p className="text-sm text-rose-400/70 mt-0.5">
                      {t('taskAttachments.confirmDeleteSubtitle')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="px-6 py-4">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-(--background-subtle) border border-(--border)">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-(--text-primary) truncate">
                      {task.title}
                    </p>
                    <p className="text-xs text-(--text-muted)">
                      {t('taskAttachments.confirmDeleteWarning')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="px-6 pb-5 flex gap-3">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-(--border) text-(--text-secondary) text-sm font-medium hover:bg-(--background-subtle) transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={confirmDeleteTaskAction}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold shadow-md shadow-rose-500/20 transition-colors"
                >
                  {t('taskAttachments.deleteFile')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
