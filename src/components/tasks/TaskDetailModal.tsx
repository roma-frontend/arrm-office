"use client";

import React, { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../convex/_generated/api";
import { TaskAttachments } from "./TaskAttachments";
import type { Id } from "../../../convex/_generated/dataModel";

type Status = "pending" | "in_progress" | "review" | "completed" | "cancelled";
type Priority = "low" | "medium" | "high" | "urgent";

const STATUS_STYLES: Record<Status, { color: string; bg: string; dot: string }> = {
  pending:     { color: "text-[var(--text-muted)]", bg: "bg-[var(--background-subtle)]", dot: "bg-[var(--text-muted)]" },
  in_progress: { color: "text-blue-400",            bg: "bg-blue-500/10",                dot: "bg-blue-500" },
  review:      { color: "text-amber-400",           bg: "bg-amber-500/10",               dot: "bg-amber-500" },
  completed:   { color: "text-emerald-400",         bg: "bg-emerald-500/10",             dot: "bg-emerald-500" },
  cancelled:   { color: "text-rose-400",            bg: "bg-rose-500/10",                dot: "bg-rose-400" },
};

const PRIORITY_STYLES: Record<Priority, { color: string; bg: string; icon: string }> = {
  low:    { color: "text-[var(--text-muted)]", bg: "bg-[var(--background-subtle)]", icon: "↓" },
  medium: { color: "text-blue-400",            bg: "bg-blue-500/10",                icon: "→" },
  high:   { color: "text-orange-400",          bg: "bg-orange-500/10",              icon: "↑" },
  urgent: { color: "text-rose-400",            bg: "bg-rose-500/10",                icon: "⚡" },
};

function getStatusLabel(status: Status, t: (key: string) => string): string {
  const keys: Record<Status, string> = {
    pending: "tasksClient.pending",
    in_progress: "tasksClient.inProgress",
    review: "tasksClient.inReview",
    completed: "tasksClient.completed",
    cancelled: "tasksClient.cancelled",
  };
  return t(keys[status]);
}

function getPriorityLabel(priority: Priority, t: (key: string) => string): string {
  const keys: Record<Priority, string> = {
    low: "tasksClient.low",
    medium: "tasksClient.medium",
    high: "tasksClient.high",
    urgent: "tasksClient.urgent",
  };
  return t(keys[priority]);
}

// Status transitions available per role
const EMPLOYEE_TRANSITIONS: Record<Status, Status[]> = {
  pending:     ["in_progress"],
  in_progress: ["review", "pending"],
  review:      ["in_progress"],
  completed:   [],
  cancelled:   [],
};

const MANAGER_TRANSITIONS: Record<Status, Status[]> = {
  pending:     ["in_progress", "cancelled"],
  in_progress: ["review", "pending", "cancelled"],
  review:      ["completed", "in_progress", "cancelled"],
  completed:   ["in_progress"],
  cancelled:   ["pending"],
};

function Avatar({ name, url }: { name: string; url?: string | null }) {
  const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  return (
    <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center font-bold text-white text-xs bg-gradient-to-br from-blue-500 to-sky-500">
      {url ? <img src={url} alt={name} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : initials}
    </div>
  );
}

interface Props {
  task: any;
  currentUserId: Id<"users">;
  userRole: "admin" | "supervisor" | "employee";
  onClose: () => void;
}

export function TaskDetailModal({ task, currentUserId, userRole, onClose }: Props) {
  const { t } = useTranslation();
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDesc, setEditDesc] = useState(task.description ?? "");
  const [editPriority, setEditPriority] = useState<Priority>(task.priority);
  const [editDeadline, setEditDeadline] = useState(
    task.deadline ? new Date(task.deadline).toISOString().split("T")[0] : ""
  );

  const canManage = userRole === "admin" || userRole === "supervisor";
  const isAssignee = task.assignedTo === currentUserId;

  const comments = useQuery(api.tasks.getTaskComments, { taskId: task._id });
  const updateStatus = useMutation(api.tasks.updateTaskStatus);
  const updateTask = useMutation(api.tasks.updateTask);
  const deleteTask = useMutation(api.tasks.deleteTask);
  const addComment = useMutation(api.tasks.addComment);
  const markRead = useMutation(api.notifications.markAllAsRead);

  // Mark task notifications as read when modal opens
  React.useEffect(() => {
    markRead({ userId: currentUserId }).catch(() => {});
  }, []);

  const statusCfg = STATUS_STYLES[task.status as Status];
  const priorityCfg = PRIORITY_STYLES[task.priority as Priority];
  const statusLabel = getStatusLabel(task.status as Status, t);
  const priorityLabel = getPriorityLabel(task.priority as Priority, t);

  const transitions = canManage
    ? MANAGER_TRANSITIONS[task.status as Status]
    : EMPLOYEE_TRANSITIONS[task.status as Status];

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
    if (!confirm("Delete this task? This cannot be undone.")) return;
    await deleteTask({ taskId: task._id });
    onClose();
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    setSubmitting(true);
    await addComment({ taskId: task._id, authorId: currentUserId, content: comment.trim() });
    setComment("");
    setSubmitting(false);
  };

  const deadlinePassed = task.deadline && task.deadline < Date.now() && task.status !== "completed";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[var(--card)] rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-[var(--border)]">

        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-sky-500 px-6 py-5 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {editMode ? (
                <input
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="w-full bg-white/20 text-white placeholder-white/60 rounded-xl px-3 py-1.5 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-white/50"
                />
              ) : (
                <h2 className="text-xl font-bold text-white leading-snug">{task.title}</h2>
              )}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/20 text-white">
                  {statusLabel}
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/20 text-white">
                  {priorityCfg.icon} {priorityLabel}
                </span>
                {deadlinePassed && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-500/80 text-white">⏰ Overdue</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {canManage && !editMode && (
                <button onClick={() => setEditMode(true)} className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white text-sm transition-colors" title={t('ariaLabels.editTask')}>✏️</button>
              )}
              {editMode && (
                <>
                  <button onClick={handleSaveEdit} className="px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 text-xs font-bold hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors">{t('buttons.save')}</button>
                  <button onClick={() => setEditMode(false)} className="px-3 py-1.5 rounded-lg bg-white/20 text-white text-xs font-medium hover:bg-white/30 transition-colors">{t('buttons.cancel')}</button>
                </>
              )}
              {canManage && !editMode && (
                <button onClick={handleDelete} className="w-8 h-8 rounded-full bg-white/20 hover:bg-rose-500/80 flex items-center justify-center text-white text-sm transition-colors" title={t('ariaLabels.deleteTask')}>🗑️</button>
              )}
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors">✕</button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">

            {/* Description */}
            <div>
              <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">Description</h3>
              {editMode ? (
                <textarea
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--background-subtle)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                />
              ) : (
                <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
                  {task.description || <span className="text-[var(--text-muted)] italic">No description</span>}
                </p>
              )}
            </div>

            {/* Meta info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">Assigned To</h3>
                <div className="flex items-center gap-2">
                  <Avatar name={task.assignedToUser?.name ?? "?"} url={task.assignedToUser?.avatarUrl} />
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{task.assignedToUser?.name ?? "—"}</p>
                    <p className="text-xs text-[var(--text-muted)]">{task.assignedToUser?.position ?? ""}</p>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">Assigned By</h3>
                <div className="flex items-center gap-2">
                  <Avatar name={task.assignedByUser?.name ?? "?"} url={task.assignedByUser?.avatarUrl} />
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{task.assignedByUser?.name ?? "—"}</p>
                    <p className="text-xs text-[var(--text-muted)]">{task.assignedByUser?.role ?? ""}</p>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">Priority</h3>
                {editMode ? (
                  <select value={editPriority} onChange={e => setEditPriority(e.target.value as Priority)} className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background-subtle)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                    <option value="low">↓ Low</option>
                    <option value="medium">→ Medium</option>
                    <option value="high">↑ High</option>
                    <option value="urgent">⚡ Urgent</option>
                  </select>
                ) : (
                  <span className={`text-sm font-semibold px-3 py-1 rounded-full ${priorityCfg.bg} ${priorityCfg.color}`}>
                    {priorityCfg.icon} {priorityLabel}
                  </span>
                )}
              </div>
              <div>
                <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">Deadline</h3>
                {editMode ? (
                  <input type="date" value={editDeadline} onChange={e => setEditDeadline(e.target.value)} className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background-subtle)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                ) : task.deadline ? (
                  <p className={`text-sm font-medium ${deadlinePassed ? "text-rose-400" : "text-[var(--text-primary)]"}`}>
                    {deadlinePassed ? "⏰ " : "📅 "}
                    {new Date(task.deadline).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                  </p>
                ) : (
                  <p className="text-sm text-[var(--text-muted)] italic">No deadline</p>
                )}
              </div>
            </div>

            {/* Tags */}
            {task.tags && task.tags.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {task.tags.map((tag: string) => (
                    <span key={tag} className="text-xs bg-blue-500/10 text-blue-400 px-3 py-1 rounded-full font-medium">#{tag}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Status transitions */}
            {transitions.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">Move To</h3>
                <div className="flex flex-wrap gap-2">
                  {transitions.map(st => {
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
                taskId={task._id as Id<"tasks">}
                attachments={task.attachments ?? []}
                currentUserId={currentUserId}
                canUpload={true}
              />
            </div>

            {/* Comments */}
            <div>
              <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">
                Comments {comments ? `(${comments.length})` : ""}
              </h3>
              <div className="space-y-3 mb-4 max-h-48 overflow-y-auto pr-1">
                {comments?.length === 0 && (
                  <p className="text-sm text-[var(--text-muted)] italic text-center py-3">No comments yet</p>
                )}
                {comments?.map(c => (
                  <div key={c._id} className="flex gap-3">
                    <Avatar name={c.author?.name ?? "?"} url={(c.author as any)?.avatarUrl} />
                    <div className="flex-1 bg-[var(--background-subtle)] rounded-2xl px-4 py-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-[var(--text-primary)]">{c.author?.name}</span>
                        <span className="text-xs text-[var(--text-muted)]">{new Date(c.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{c.content}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Comment input */}
              <form onSubmit={handleComment} className="flex gap-2">
                <input
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder={t('placeholders.addAComment')}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--background-subtle)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-[var(--text-muted)]"
                />
                <button
                  type="submit"
                  disabled={submitting || !comment.trim()}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 text-white text-sm font-semibold disabled:opacity-50 hover:from-blue-700 hover:to-sky-700 transition-all shadow-sm"
                >
                  {t('buttons.send')}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
