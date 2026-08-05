/**
 * Tests for the optimistic UI hooks (src/hooks/useOptimisticActions.ts).
 *
 * These wrap React 19's `useOptimistic` with a Convex mutation. The optimistic
 * value itself is transient (React rolls it back as soon as the synchronous
 * transition completes), so the tests pin down the observable contract: which
 * mutation is called with which arguments, the empty-input guards, the error
 * surfacing and the return values.
 */
jest.mock('convex/react', () => ({
  useMutation: jest.fn(),
}));

import { renderHook, act } from '@testing-library/react';
import {
  useOptimisticSendMessage,
  useOptimisticThreadReply,
  useOptimisticReaction,
  useOptimisticCreateTask,
  useOptimisticTaskStatus,
  useOptimisticLeaveActions,
  useOptimisticDriverRequest,
} from '@/hooks/useOptimisticActions';
import { useMutation } from 'convex/react';

let mutationMock: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mutationMock = jest.fn();
  (useMutation as jest.Mock).mockReturnValue(mutationMock);
});

describe('useOptimisticSendMessage', () => {
  it('calls the mutation with the message payload', async () => {
    mutationMock.mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useOptimisticSendMessage('conv_1' as never, 'user_1' as never, 'org_1' as never),
    );
    const ok = await act(async () => result.current.sendOptimistic('hello'));
    expect(ok).toBe(true);
    expect(mutationMock).toHaveBeenCalledWith({
      conversationId: 'conv_1',
      senderId: 'user_1',
      organizationId: 'org_1',
      type: 'text',
      content: 'hello',
      replyToId: undefined,
      mentionedUserIds: undefined,
      poll: undefined,
      attachments: undefined,
      audioDuration: undefined,
    });
    expect(result.current.error).toBeNull();
  });

  it('classifies an image attachment as type image', async () => {
    mutationMock.mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useOptimisticSendMessage('conv_1' as never, 'user_1' as never, 'org_1' as never),
    );
    await act(async () =>
      result.current.sendOptimistic('', {
        attachmentUrl: 'https://cdn/x.png',
        attachmentType: 'image',
      }),
    );
    expect(mutationMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'image' }));
  });

  it('classifies a generic attachment as type file', async () => {
    mutationMock.mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useOptimisticSendMessage('conv_1' as never, 'user_1' as never, 'org_1' as never),
    );
    await act(async () =>
      result.current.sendOptimistic('', { attachmentUrl: 'https://cdn/x.pdf' }),
    );
    expect(mutationMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'file' }));
  });

  it('classifies audio by audioDuration', async () => {
    mutationMock.mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useOptimisticSendMessage('conv_1' as never, 'user_1' as never, 'org_1' as never),
    );
    await act(async () => result.current.sendOptimistic('', { audioDuration: 1200 }));
    expect(mutationMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'audio' }));
  });

  it('forwards mentions, poll and attachments to the mutation', async () => {
    mutationMock.mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useOptimisticSendMessage('conv_1' as never, 'user_1' as never, 'org_1' as never),
    );
    await act(async () =>
      result.current.sendOptimistic('poll time', {
        poll: { question: 'Q', options: [] },
        mentionedUserIds: ['u2' as never],
        attachments: [{ url: 'u', name: 'n', type: 't', size: 1 }],
        replyToId: 'r1' as never,
      }),
    );
    expect(mutationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        poll: { question: 'Q', options: [] },
        mentionedUserIds: ['u2'],
        attachments: [{ url: 'u', name: 'n', type: 't', size: 1 }],
        replyToId: 'r1',
      }),
    );
  });

  it('ignores empty messages without attachments or polls', async () => {
    const { result } = renderHook(() =>
      useOptimisticSendMessage('conv_1' as never, 'user_1' as never, 'org_1' as never),
    );
    await act(async () => result.current.sendOptimistic('   '));
    expect(mutationMock).not.toHaveBeenCalled();
  });

  it('records the error and rethrows when the mutation fails', async () => {
    mutationMock.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() =>
      useOptimisticSendMessage('conv_1' as never, 'user_1' as never, 'org_1' as never),
    );
    await act(async () => {
      await expect(result.current.sendOptimistic('hello')).rejects.toThrow('network down');
    });
    expect(result.current.error).toBe('network down');
  });
});

describe('useOptimisticThreadReply', () => {
  it('sends a trimmed reply', async () => {
    mutationMock.mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useOptimisticThreadReply(
        'msg_1' as never,
        'conv_1' as never,
        'user_1' as never,
        'org_1' as never,
      ),
    );
    const ok = await act(async () => result.current.replyOptimistic('  reply text  '));
    expect(ok).toBe(true);
    expect(mutationMock).toHaveBeenCalledWith({
      parentMessageId: 'msg_1',
      conversationId: 'conv_1',
      senderId: 'user_1',
      organizationId: 'org_1',
      content: 'reply text',
    });
  });

  it('ignores whitespace-only replies', async () => {
    const { result } = renderHook(() =>
      useOptimisticThreadReply(
        'msg_1' as never,
        'conv_1' as never,
        'user_1' as never,
        'org_1' as never,
      ),
    );
    await act(async () => result.current.replyOptimistic('   '));
    expect(mutationMock).not.toHaveBeenCalled();
  });

  it('surfaces errors from the reply mutation', async () => {
    mutationMock.mockRejectedValue(new Error('reply boom'));
    const { result } = renderHook(() =>
      useOptimisticThreadReply(
        'msg_1' as never,
        'conv_1' as never,
        'user_1' as never,
        'org_1' as never,
      ),
    );
    await act(async () => {
      await expect(result.current.replyOptimistic('hi')).rejects.toThrow('reply boom');
    });
    expect(result.current.error).toBe('reply boom');
  });
});

describe('useOptimisticReaction', () => {
  it('calls the toggle mutation with the sanitized emoji', async () => {
    mutationMock.mockResolvedValue(undefined);
    const { result } = renderHook(() => useOptimisticReaction('msg_1' as never, 'user_1' as never));
    await act(async () => result.current.toggleOptimistic('👍', []));
    expect(mutationMock).toHaveBeenCalledWith({
      messageId: 'msg_1',
      userId: 'user_1',
      emoji: '👍',
    });
  });

  it('toggles off when the user already reacted', async () => {
    mutationMock.mockResolvedValue(undefined);
    const { result } = renderHook(() => useOptimisticReaction('msg_1' as never, 'user_1' as never));
    await act(async () => result.current.toggleOptimistic('👍', ['user_1']));
    expect(mutationMock).toHaveBeenCalledWith(expect.objectContaining({ emoji: '👍' }));
  });

  it('ignores whitespace-only emoji', async () => {
    const { result } = renderHook(() => useOptimisticReaction('msg_1' as never, 'user_1' as never));
    await act(async () => result.current.toggleOptimistic('   ', []));
    expect(mutationMock).not.toHaveBeenCalled();
  });

  it('surfaces errors from the reaction mutation', async () => {
    mutationMock.mockRejectedValue(new Error('reaction boom'));
    const { result } = renderHook(() => useOptimisticReaction('msg_1' as never, 'user_1' as never));
    await act(async () => {
      await expect(result.current.toggleOptimistic('👍', [])).rejects.toThrow('reaction boom');
    });
    expect(result.current.error).toBe('reaction boom');
  });
});

describe('useOptimisticCreateTask', () => {
  const taskArgs = {
    title: 'Ship it',
    description: 'details',
    assignedTo: 'user_2' as never,
    assignedBy: 'user_1' as never,
    priority: 'high' as const,
    deadline: 12345,
    tags: ['x'],
  };

  it('creates the task and returns the server id', async () => {
    mutationMock.mockResolvedValue('task_99');
    const { result } = renderHook(() => useOptimisticCreateTask());
    const id = await act(async () => result.current.createOptimistic(taskArgs));
    expect(id).toBe('task_99');
    expect(mutationMock).toHaveBeenCalledWith(taskArgs);
    expect(result.current.error).toBeNull();
  });

  it('surfaces errors instead of swallowing them', async () => {
    mutationMock.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useOptimisticCreateTask());
    await act(async () => {
      await expect(result.current.createOptimistic(taskArgs)).rejects.toThrow('boom');
    });
    expect(result.current.error).toBe('boom');
  });
});

describe('useOptimisticTaskStatus', () => {
  it('updates the task status through the mutation', async () => {
    mutationMock.mockResolvedValue(undefined);
    const { result } = renderHook(() => useOptimisticTaskStatus());
    const ok = await act(async () =>
      result.current.updateOptimistic(
        'task_1' as never,
        'in_progress',
        'user_1' as never,
        'pending',
      ),
    );
    expect(ok).toBe(true);
    expect(mutationMock).toHaveBeenCalledWith({
      taskId: 'task_1',
      status: 'in_progress',
      userId: 'user_1',
    });
  });

  it('surfaces status update errors', async () => {
    mutationMock.mockRejectedValue(new Error('status boom'));
    const { result } = renderHook(() => useOptimisticTaskStatus());
    await act(async () => {
      await expect(
        result.current.updateOptimistic(
          'task_1' as never,
          'completed',
          'user_1' as never,
          'pending',
        ),
      ).rejects.toThrow('status boom');
    });
    expect(result.current.error).toBe('status boom');
  });
});

describe('useOptimisticLeaveActions', () => {
  it('approves a leave', async () => {
    mutationMock.mockResolvedValue(undefined);
    const { result } = renderHook(() => useOptimisticLeaveActions());
    const ok = await act(async () =>
      result.current.approveOptimistic('leave_1' as never, 'user_1' as never, 'ok'),
    );
    expect(ok).toBe(true);
    expect(mutationMock).toHaveBeenCalledWith({
      leaveId: 'leave_1',
      reviewerId: 'user_1',
      comment: 'ok',
    });
  });

  it('rejects a leave', async () => {
    mutationMock.mockResolvedValue(undefined);
    const { result } = renderHook(() => useOptimisticLeaveActions());
    await act(async () => result.current.rejectOptimistic('leave_1' as never, 'user_1' as never));
    expect(mutationMock).toHaveBeenCalledWith({
      leaveId: 'leave_1',
      reviewerId: 'user_1',
      comment: undefined,
    });
  });

  it('deletes a leave', async () => {
    mutationMock.mockResolvedValue(undefined);
    const { result } = renderHook(() => useOptimisticLeaveActions());
    await act(async () => result.current.deleteOptimistic('leave_1' as never, 'user_1' as never));
    expect(mutationMock).toHaveBeenCalledWith({ leaveId: 'leave_1' });
  });

  it('surfaces leave action errors', async () => {
    mutationMock.mockRejectedValue(new Error('leave boom'));
    const { result } = renderHook(() => useOptimisticLeaveActions());
    await act(async () => {
      await expect(
        result.current.approveOptimistic('leave_1' as never, 'user_1' as never),
      ).rejects.toThrow('leave boom');
    });
    expect(result.current.error).toBe('leave boom');
  });
});

describe('useOptimisticDriverRequest', () => {
  const tripInfo = {
    from: 'Office',
    to: 'Airport',
    purpose: 'Transfer',
    passengerCount: 2,
  };

  it('requests a driver and returns the result', async () => {
    mutationMock.mockResolvedValue({ requestId: 'req_1' });
    const { result } = renderHook(() => useOptimisticDriverRequest());
    const returned = await act(async () =>
      result.current.requestOptimistic(
        'org_1' as never,
        'user_1' as never,
        'driver_1' as never,
        1000,
        2000,
        tripInfo,
        'airport',
      ),
    );
    expect(returned).toEqual({ requestId: 'req_1' });
    expect(mutationMock).toHaveBeenCalledWith({
      organizationId: 'org_1',
      driverId: 'driver_1',
      startTime: 1000,
      endTime: 2000,
      tripInfo,
      tripCategory: 'airport',
    });
  });

  it('surfaces driver request errors', async () => {
    mutationMock.mockRejectedValue(new Error('driver boom'));
    const { result } = renderHook(() => useOptimisticDriverRequest());
    await act(async () => {
      await expect(
        result.current.requestOptimistic(
          'org_1' as never,
          'user_1' as never,
          'driver_1' as never,
          1000,
          2000,
          tripInfo,
          'airport',
        ),
      ).rejects.toThrow('driver boom');
    });
    expect(result.current.error).toBe('driver boom');
  });
});
