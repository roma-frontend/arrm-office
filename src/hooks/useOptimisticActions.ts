/**
 * Optimistic UI hooks using React 19's useOptimistic
 *
 * These hooks provide instant UI feedback during mutations.
 * Convex's real-time subscriptions automatically reconcile optimistic state
 * with server-confirmed data. On error, the optimistic state is rolled back.
 */

'use client';

import { useOptimistic, useCallback, useState, startTransition } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@/../convex/_generated/api';
import type { Id } from '@/../convex/_generated/dataModel';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

// -----------------------------------------------------------------------------
// Chat: Optimistic Send Message
// -----------------------------------------------------------------------------

interface OptimisticMessage {
  _id: string;
  conversationId: Id<'chatConversations'>;
  senderId: Id<'users'>;
  content: string;
  createdAt: number;
  pending: boolean;
  type: 'text' | 'image' | 'file' | 'audio';
  attachmentUrl?: string;
  replyToId?: Id<'chatMessages'>;
  replyToContent?: string;
  replyToSenderName?: string;
  mentionedUserIds?: Id<'users'>[];
  poll?: {
    question: string;
    options: Array<{ id: string; text: string; votes: Id<'users'>[] }>;
  };
  attachments?: Array<{ url: string; name: string; type: string; size: number }>;
  audioDuration?: number;
}

export function useOptimisticSendMessage(
  conversationId: Id<'chatConversations'>,
  userId: Id<'users'>,
  organizationId: Id<'organizations'> | undefined,
) {
  const sendMessage = useMutation(api.chat.mutations.sendMessage);
  const [error, setError] = useState<string | null>(null);

  const [optimisticMessages, addOptimisticMessage] = useOptimistic<
    OptimisticMessage[],
    OptimisticMessage
  >([], (current, newMessage) => {
    return [...current, newMessage];
  });

  const sendOptimistic = useCallback(
    async (
      content: string,
      options?: {
        replyToId?: Id<'chatMessages'>;
        replyToContent?: string;
        replyToSenderName?: string;
        attachmentUrl?: string;
        attachmentType?: 'image' | 'file';
        attachmentSize?: number;
        mentionedUserIds?: Id<'users'>[];
        poll?: {
          question: string;
          options: Array<{ id: string; text: string; votes: Id<'users'>[] }>;
        };
        attachments?: Array<{ url: string; name: string; type: string; size: number }>;
        audioDuration?: number;
      },
    ) => {
      // A message needs *something* in it. Voice notes carry only
      // `audioDuration`, and multi-file messages only `attachments`, so checking
      // text/single attachment/poll alone silently dropped both.
      const hasPayload =
        content.trim().length > 0 ||
        !!options?.attachmentUrl ||
        !!options?.poll ||
        !!options?.audioDuration ||
        (options?.attachments?.length ?? 0) > 0;
      if (!hasPayload) return;

      const msgType = options?.poll
        ? 'text'
        : options?.attachmentUrl
          ? options.attachmentType === 'image'
            ? 'image'
            : 'file'
          : options?.audioDuration
            ? 'audio'
            : 'text';

      const optimisticMsg: OptimisticMessage = {
        _id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        conversationId,
        senderId: userId,
        content,
        createdAt: Date.now(),
        pending: true,
        type: msgType,
        attachmentUrl: options?.attachmentUrl,
        replyToId: options?.replyToId,
        replyToContent: options?.replyToContent,
        replyToSenderName: options?.replyToSenderName,
        mentionedUserIds: options?.mentionedUserIds,
        poll: options?.poll,
        attachments: options?.attachments,
        audioDuration: options?.audioDuration,
      };

      try {
        startTransition(() => addOptimisticMessage(optimisticMsg));

        await sendMessage({
          conversationId,
          senderId: userId,
          organizationId,
          type: msgType,
          content,
          replyToId: options?.replyToId,
          mentionedUserIds:
            options?.mentionedUserIds && options.mentionedUserIds.length > 0
              ? options.mentionedUserIds
              : undefined,
          poll: options?.poll,
          attachments: options?.attachments,
          audioDuration: options?.audioDuration,
        });

        setError(null);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send message');
        throw err;
      }
    },
    [conversationId, userId, organizationId, sendMessage, addOptimisticMessage],
  );

  return {
    sendOptimistic,
    error,
    optimisticMessages,
  };
}

// -----------------------------------------------------------------------------
// Chat: Optimistic Thread Reply
// -----------------------------------------------------------------------------

interface OptimisticThreadReply {
  _id: string;
  parentMessageId: Id<'chatMessages'>;
  conversationId: Id<'chatConversations'>;
  senderId: Id<'users'>;
  content: string;
  createdAt: number;
  pending: boolean;
  sender?: { _id: Id<'users'>; name: string; avatarUrl?: string };
}

export function useOptimisticThreadReply(
  parentMessageId: Id<'chatMessages'>,
  conversationId: Id<'chatConversations'>,
  userId: Id<'users'>,
  organizationId: Id<'organizations'> | undefined,
) {
  const sendReply = useMutation(api.chat.mutations.sendThreadReply);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('You');

  const [optimisticReplies, addOptimisticReply] = useOptimistic<
    OptimisticThreadReply[],
    OptimisticThreadReply
  >([], (current, newReply) => {
    return [...current, newReply];
  });

  const replyOptimistic = useCallback(
    async (content: string) => {
      if (!content.trim()) return;

      const optimisticReply: OptimisticThreadReply = {
        _id: `temp-reply-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        parentMessageId,
        conversationId,
        senderId: userId,
        content,
        createdAt: Date.now(),
        pending: true,
        sender: { _id: userId, name: userName, avatarUrl: undefined },
      };

      try {
        startTransition(() => addOptimisticReply(optimisticReply));

        await sendReply({
          parentMessageId,
          conversationId,
          senderId: userId,
          organizationId,
          content: content.trim(),
        });

        setError(null);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send reply');
        throw err;
      }
    },
    [
      parentMessageId,
      conversationId,
      userId,
      organizationId,
      sendReply,
      addOptimisticReply,
      userName,
    ],
  );

  return {
    replyOptimistic,
    error,
    optimisticReplies,
    setUserName,
  };
}

// -----------------------------------------------------------------------------
// Chat: Optimistic Reaction
// -----------------------------------------------------------------------------

export function useOptimisticReaction(messageId: Id<'chatMessages'>, userId: Id<'users'>) {
  const toggleReaction = useMutation(api.chat.mutations.toggleReaction);
  const [error, setError] = useState<string | null>(null);

  const [optimisticReactions, setOptimisticReactions] = useOptimistic<
    Record<string, Id<'users'>[]>,
    { emojiKey: string; userId: Id<'users'>; toggle: boolean }
  >({}, (current, action) => {
    const next = { ...current };
    const existing = next[action.emojiKey];
    const users = existing ? [...existing] : [];

    if (action.toggle) {
      if (!users.includes(action.userId)) {
        users.push(action.userId);
      }
    } else {
      const idx = users.indexOf(action.userId);
      if (idx >= 0) users.splice(idx, 1);
    }

    if (users.length === 0) {
      delete next[action.emojiKey];
    } else {
      next[action.emojiKey] = users;
    }

    return next;
  });

  const toggleOptimistic = useCallback(
    async (emoji: string, currentUsers: Id<'users'>[]) => {
      const sanitizedEmoji = emoji.replace(/[\s\x00-\x1F\x7F]/g, '');
      if (!sanitizedEmoji) return;

      const emojiKey = emojiToKey(sanitizedEmoji);
      const hasReaction = currentUsers.includes(userId);

      try {
        startTransition(() => setOptimisticReactions({ emojiKey, userId, toggle: !hasReaction }));

        await toggleReaction({
          messageId,
          userId,
          emoji: sanitizedEmoji,
        });

        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to toggle reaction');
        throw err;
      }
    },
    [messageId, userId, toggleReaction, setOptimisticReactions],
  );

  return {
    toggleOptimistic,
    error,
    optimisticReactions,
  };
}

// -----------------------------------------------------------------------------
// Tasks: Optimistic Create Task
// -----------------------------------------------------------------------------

interface OptimisticTask {
  _id: string;
  title: string;
  description?: string;
  assignedTo: Id<'users'>;
  assignedBy: Id<'users'>;
  status: 'pending';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  deadline?: number;
  tags?: string[];
  objectiveId?: Id<'objectives'>;
  keyResultId?: Id<'keyResults'>;
  projectId?: Id<'projects'>;
  createdAt: number;
  updatedAt: number;
  pending: boolean;
}

export function useOptimisticCreateTask() {
  const createTask = useMutation(api.tasks.createTask);
  const [error, setError] = useState<string | null>(null);

  const [optimisticTasks, addOptimisticTask] = useOptimistic<OptimisticTask[], OptimisticTask>(
    [],
    (current, newTask) => [...current, newTask],
  );

  const createOptimistic = useCallback(
    async (args: {
      title: string;
      description?: string;
      assignedTo: Id<'users'>;
      assignedBy: Id<'users'>;
      priority: 'low' | 'medium' | 'high' | 'urgent';
      deadline?: number;
      tags?: string[];
      objectiveId?: Id<'objectives'>;
      keyResultId?: Id<'keyResults'>;
      projectId?: Id<'projects'>;
      // Phase 2 fields. Optional, and passed straight through: the optimistic row
      // below still shows `pending`, because the board's own opening status is
      // resolved on the server and guessing it here would flicker the wrong chip.
      statusKey?: string;
      assigneeIds?: Id<'users'>[];
      startDate?: number;
      timeEstimateMinutes?: number;
      customFields?: Record<string, unknown>;
    }) => {
      const now = Date.now();
      const optimisticTask: OptimisticTask = {
        _id: `temp-task-${now}-${Math.random().toString(36).slice(2, 9)}`,
        ...args,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
        pending: true,
      };

      try {
        startTransition(() => addOptimisticTask(optimisticTask));
        const taskId = await createTask(args);
        setError(null);
        return taskId;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create task');
        throw err;
      }
    },
    [createTask, addOptimisticTask],
  );

  return { createOptimistic, error, optimisticTasks };
}

// -----------------------------------------------------------------------------
// Tasks: Optimistic Status Update
// -----------------------------------------------------------------------------

interface OptimisticTaskUpdate {
  taskId: Id<'tasks'>;
  newStatus: string;
  oldStatus: string;
}

export function useOptimisticTaskStatus() {
  const { t } = useTranslation();
  const updateTaskStatus = useMutation(api.tasks.updateTaskStatus);
  const [error, setError] = useState<string | null>(null);

  const [optimisticUpdates, setOptimisticUpdate] = useOptimistic<
    Map<string, OptimisticTaskUpdate>,
    OptimisticTaskUpdate
  >(new Map(), (current, update) => {
    const next = new Map(current);
    next.set(update.taskId, update);
    return next;
  });

  const updateOptimistic = useCallback(
    async (
      taskId: Id<'tasks'>,
      status: 'pending' | 'in_progress' | 'review' | 'completed' | 'cancelled',
      userId: Id<'users'>,
      oldStatus: string,
    ) => {
      try {
        startTransition(() => setOptimisticUpdate({ taskId, newStatus: status, oldStatus }));

        await updateTaskStatus({ taskId, status, userId });

        setError(null);

        // Show undo toast — does not auto-close, user must dismiss manually or click Undo
        toast.success(t('tasks.statusUpdated', 'Status updated'), {
          duration: Infinity,
          action: {
            label: t('common.undo', 'Undo'),
            onClick: async () => {
              try {
                await updateTaskStatus({
                  taskId,
                  status: oldStatus as
                    | 'pending'
                    | 'in_progress'
                    | 'review'
                    | 'completed'
                    | 'cancelled',
                  userId,
                });
                toast.success(t('tasks.statusReverted', 'Status reverted'));
              } catch {
                toast.error(t('tasks.statusRevertFailed', 'Failed to revert status'));
              }
            },
          },
        });

        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update task status');
        throw err;
      }
    },
    [updateTaskStatus, setOptimisticUpdate, t],
  );

  return {
    updateOptimistic,
    error,
    optimisticUpdates,
  };
}

// -----------------------------------------------------------------------------
// Recurring Tasks: Status Update
// -----------------------------------------------------------------------------

export function useRecurringTaskStatus() {
  const updateRecurringStatus = useMutation(api.recurringTasks.updateRecurringTaskStatus);

  const updateRecurringOptimistic = useCallback(
    async (
      seriesId: Id<'recurringTasks'>,
      status: 'pending' | 'in_progress' | 'review' | 'completed' | 'cancelled',
    ) => {
      await updateRecurringStatus({ seriesId, status });
      return true;
    },
    [updateRecurringStatus],
  );

  return { updateRecurringOptimistic };
}

// -----------------------------------------------------------------------------
// Leaves: Optimistic Approve/Reject/Delete
// -----------------------------------------------------------------------------

interface OptimisticLeaveAction {
  leaveId: Id<'leaveRequests'>;
  action: 'approve' | 'reject' | 'delete';
  previousStatus?: string;
}

export function useOptimisticLeaveActions() {
  const approveLeave = useMutation(api.leaves.approveLeave);
  const rejectLeave = useMutation(api.leaves.rejectLeave);
  const deleteLeave = useMutation(api.leaves.deleteLeave);
  const [error, setError] = useState<string | null>(null);

  const [optimisticActions, setOptimisticAction] = useOptimistic<
    Map<string, OptimisticLeaveAction>,
    OptimisticLeaveAction
  >(new Map(), (current, action) => {
    const next = new Map(current);
    next.set(action.leaveId, action);
    return next;
  });

  const approveOptimistic = useCallback(
    async (leaveId: Id<'leaveRequests'>, reviewerId: Id<'users'>, comment?: string) => {
      try {
        startTransition(() =>
          setOptimisticAction({ leaveId, action: 'approve', previousStatus: 'pending' }),
        );

        await approveLeave({ leaveId, reviewerId, comment });

        setError(null);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to approve leave');
        throw err;
      }
    },
    [approveLeave, setOptimisticAction],
  );

  const rejectOptimistic = useCallback(
    async (leaveId: Id<'leaveRequests'>, reviewerId: Id<'users'>, comment?: string) => {
      try {
        startTransition(() =>
          setOptimisticAction({ leaveId, action: 'reject', previousStatus: 'pending' }),
        );

        await rejectLeave({ leaveId, reviewerId, comment });

        setError(null);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to reject leave');
        throw err;
      }
    },
    [rejectLeave, setOptimisticAction],
  );

  const deleteOptimistic = useCallback(
    async (leaveId: Id<'leaveRequests'>, _requesterId: Id<'users'>) => {
      try {
        startTransition(() => setOptimisticAction({ leaveId, action: 'delete' }));

        await deleteLeave({ leaveId });

        setError(null);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete leave');
        throw err;
      }
    },
    [deleteLeave, setOptimisticAction],
  );

  return {
    approveOptimistic,
    rejectOptimistic,
    deleteOptimistic,
    error,
    optimisticActions,
  };
}

// -----------------------------------------------------------------------------
// Drivers: Optimistic Request
// -----------------------------------------------------------------------------

interface OptimisticDriverRequest {
  requestId: string;
  organizationId: Id<'organizations'>;
  requesterId: Id<'users'>;
  driverId: Id<'drivers'>;
  startTime: number;
  endTime: number;
  tripInfo: {
    from: string;
    to: string;
    purpose: string;
    passengerCount: number;
    notes?: string;
  };
  tripCategory: string;
  createdAt: number;
  pending: boolean;
}

export function useOptimisticDriverRequest() {
  const requestDriver = useMutation(api.drivers.requests_mutations.requestDriver);
  const [error, setError] = useState<string | null>(null);

  const [optimisticRequests, addOptimisticRequest] = useOptimistic<
    OptimisticDriverRequest[],
    OptimisticDriverRequest
  >([], (current, newRequest) => {
    return [...current, newRequest];
  });

  const requestOptimistic = useCallback(
    async (
      organizationId: Id<'organizations'>,
      requesterId: Id<'users'>,
      driverId: Id<'drivers'>,
      startTime: number,
      endTime: number,
      tripInfo: {
        from: string;
        to: string;
        purpose: string;
        passengerCount: number;
        notes?: string;
      },
      tripCategory:
        | 'client_meeting'
        | 'airport'
        | 'office_transfer'
        | 'emergency'
        | 'team_event'
        | 'personal',
    ) => {
      const optimisticRequest: OptimisticDriverRequest = {
        requestId: `temp-driver-${Date.now()}`,
        organizationId,
        requesterId,
        driverId,
        startTime,
        endTime,
        tripInfo,
        tripCategory,
        createdAt: Date.now(),
        pending: true,
      };

      try {
        startTransition(() => addOptimisticRequest(optimisticRequest));

        const result = await requestDriver({
          organizationId,
          driverId,
          startTime,
          endTime,
          tripInfo,
          tripCategory,
        });

        setError(null);
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to request driver');
        throw err;
      }
    },
    [requestDriver, addOptimisticRequest],
  );

  return {
    requestOptimistic,
    error,
    optimisticRequests,
  };
}

// -----------------------------------------------------------------------------
// Helper: Emoji to ASCII-safe key (same as server)
// -----------------------------------------------------------------------------

function emojiToKey(emoji: string): string {
  const codePoints: string[] = [];
  for (const char of emoji) {
    const codePoint = char.codePointAt(0);
    if (codePoint !== undefined) {
      codePoints.push('u' + codePoint.toString(16).toLowerCase());
    }
  }
  return codePoints.join('_');
}
