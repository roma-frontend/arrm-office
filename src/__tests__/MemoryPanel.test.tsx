/**
 * Tests for MemoryPanel — the long-term memory manager modal.
 *
 * Mocks: convex/react useQuery keyed by ref name with the real second-arg
 * ('skip' handling), useMutation returning lazily-created jest.fn()s,
 * react-i18next fallback-t, sonner toast, ui Button stub, lucide stubs.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockMemories: any[] = [];
let mockMemoriesPending = false;
const mutationImpls: Record<string, jest.Mock> = {};

jest.mock('@/convex/_generated/api', () => ({
  api: {
    aiMemory: {
      listMemories: { _name: 'listMemories' },
      deleteMemory: { _name: 'deleteMemory' },
      clearMemories: { _name: 'clearMemories' },
    },
  },
}));

jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }) => {
    const name = ref?._name ?? '';
    // Convex can serve cached results even after the args turn into 'skip'
    // (e.g. userId becomes undefined between renders), so the query returns
    // the array whenever it is not pending.
    if (name === 'listMemories') return mockMemoriesPending ? undefined : mockMemories;
    return undefined;
  },
  useMutation: (ref: { _name?: string }) => {
    const name = ref?._name ?? '';
    mutationImpls[name] = mutationImpls[name] ?? jest.fn();
    return mutationImpls[name];
  },
}));

const mockToast = { success: jest.fn(), error: jest.fn() };
jest.mock('sonner', () => ({ toast: mockToast }));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
  }),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, className }: any) => (
    <button className={className} onClick={onClick}>
      {children}
    </button>
  ),
}));

jest.mock('lucide-react', () => ({
  Brain: () => <span>brain</span>,
  Trash2: () => <span>trash</span>,
  X: () => <span>x</span>,
  Sparkles: () => <span>sparkles</span>,
}));

import { MemoryPanel } from '@/components/ai/MemoryPanel';

const PROPS = { userId: 'user_1', open: true, onClose: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockMemories.length = 0;
  mockMemoriesPending = false;
  Object.keys(mutationImpls).forEach((k) => delete mutationImpls[k]);
});

describe('MemoryPanel', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<MemoryPanel {...PROPS} open={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the title and description', () => {
    render(<MemoryPanel {...PROPS} />);
    expect(screen.getByText('Assistant memory')).toBeInTheDocument();
    expect(
      screen.getByText(/Facts the assistant remembered from your conversations/),
    ).toBeInTheDocument();
  });

  it('shows the loading ellipsis while the query is pending', () => {
    mockMemoriesPending = true;
    render(<MemoryPanel {...PROPS} />);
    expect(screen.getByText('…')).toBeInTheDocument();
  });

  it('shows empty state when there are no memories', () => {
    render(<MemoryPanel {...PROPS} />);
    expect(screen.getByText(/No memories yet/)).toBeInTheDocument();
  });

  it('renders the list of memories', () => {
    mockMemories.push({ _id: 'm1', content: 'Likes coffee' });
    mockMemories.push({ _id: 'm2', content: 'Team of 12' });
    render(<MemoryPanel {...PROPS} />);
    expect(screen.getByText('Likes coffee')).toBeInTheDocument();
    expect(screen.getByText('Team of 12')).toBeInTheDocument();
    // Clear-all button appears when memories exist
    expect(screen.getByText('Clear all memories')).toBeInTheDocument();
  });

  it('deletes a memory and toasts success', async () => {
    mockMemories.push({ _id: 'm1', content: 'Likes coffee' });
    render(<MemoryPanel {...PROPS} />);
    fireEvent.click(screen.getByLabelText('Delete memory'));
    await waitFor(() => {
      expect(mutationImpls['deleteMemory']).toHaveBeenCalledWith({ memoryId: 'm1' });
    });
    expect(mockToast.success).toHaveBeenCalledWith('Memory deleted');
  });

  it('toasts error when delete fails', async () => {
    mockMemories.push({ _id: 'm1', content: 'Likes coffee' });
    mutationImpls['deleteMemory'] = jest.fn().mockRejectedValue(new Error('boom'));
    render(<MemoryPanel {...PROPS} />);
    fireEvent.click(screen.getByLabelText('Delete memory'));
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Failed to delete memory');
    });
  });

  it('first click on clear arms confirmation, second click clears', async () => {
    mockMemories.push({ _id: 'm1', content: 'Likes coffee' });
    render(<MemoryPanel {...PROPS} />);
    fireEvent.click(screen.getByText('Clear all memories'));
    expect(screen.getByText('Click again to confirm')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Click again to confirm'));
    await waitFor(() => {
      expect(mutationImpls['clearMemories']).toHaveBeenCalledWith({ userId: 'user_1' });
    });
    expect(mockToast.success).toHaveBeenCalledWith('All memories cleared');
  });

  it('toasts error when clearing fails', async () => {
    mockMemories.push({ _id: 'm1', content: 'Likes coffee' });
    mutationImpls['clearMemories'] = jest.fn().mockRejectedValue(new Error('boom'));
    render(<MemoryPanel {...PROPS} />);
    fireEvent.click(screen.getByText('Clear all memories'));
    fireEvent.click(screen.getByText('Click again to confirm'));
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Failed to clear memories');
    });
  });

  it('closes when the overlay backdrop is clicked', () => {
    const onClose = jest.fn();
    mockMemories.push({ _id: 'm1', content: 'Likes coffee' });
    const { container } = render(<MemoryPanel {...PROPS} onClose={onClose} />);
    const backdrop = container.querySelector('.backdrop-blur-sm');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes via the header X button', () => {
    const onClose = jest.fn();
    render(<MemoryPanel {...PROPS} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('bails out of clearing when userId disappears after confirm', async () => {
    // Cached memories are still served even though userId is now undefined.
    mockMemories.push({ _id: 'm1', content: 'Likes coffee' });
    render(<MemoryPanel {...PROPS} userId={undefined} />);
    expect(screen.getByText('Likes coffee')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Clear all memories'));
    fireEvent.click(screen.getByText('Click again to confirm'));
    // Early return — no mutation and no toast.
    expect(mutationImpls['clearMemories']).not.toHaveBeenCalled();
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it('resets the confirmation when the 3s window elapses', () => {
    const realSetTimeout = global.setTimeout;
    // Execute the 3s reset callback immediately so the lambda is covered.
    (global as { setTimeout: typeof setTimeout }).setTimeout = ((fn: () => void, ms?: number) =>
      ms === 3000
        ? (fn(), 0 as unknown as NodeJS.Timeout)
        : realSetTimeout(fn, ms)) as typeof setTimeout;
    try {
      mockMemories.push({ _id: 'm1', content: 'Likes coffee' });
      render(<MemoryPanel {...PROPS} />);
      // The immediate-executing 3s callback flips the button back to idle in
      // the same tick, so the confirm label never shows and the lambda (and
      // the early return path of handleClear) still run.
      fireEvent.click(screen.getByText('Clear all memories'));
      expect(screen.queryByText('Click again to confirm')).toBeNull();
      expect(screen.getByText('Clear all memories')).toBeInTheDocument();
    } finally {
      (global as { setTimeout: typeof setTimeout }).setTimeout = realSetTimeout;
    }
  });
});
