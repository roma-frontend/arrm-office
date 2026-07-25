/**
 * Tests for useSubscription hook.
 *
 * Mocks: convex/react (useQuery), useAuthStore.
 */
jest.mock('convex/react', () => ({
  useQuery: jest.fn(),
}));

jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: Object.assign(
    jest.fn(() => ({ user: { id: 'user-1' } })),
    {
      getState: jest.fn(() => ({ user: { id: 'user-1' } })),
    },
  ),
}));

import { useSubscription } from '@/hooks/useSubscription';
import { useQuery } from 'convex/react';
import { useAuthStore } from '@/store/useAuthStore';

describe('useSubscription', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuthStore.getState as jest.Mock).mockReturnValue({ user: { id: 'user-1' } });
  });

  it('returns loading state when query is undefined', () => {
    (useQuery as jest.Mock).mockReturnValue(undefined);

    // We need to call within a function to avoid hook rules issues
    // Since we're testing the hook's returned object structure,
    // we'll use a simple approach with the mock analysis
    const result = useSubscription();
    expect(result.isLoading).toBe(true);
    expect(result.isActive).toBe(false);
    expect(result.plan).toBe('starter');
  });

  it('returns active state with starter plan', () => {
    (useQuery as jest.Mock).mockReturnValue({ plan: 'starter', _id: 'org-1' });

    const result = useSubscription();
    expect(result.isLoading).toBe(false);
    expect(result.isActive).toBe(true);
    expect(result.plan).toBe('starter');
  });

  it('returns active state with professional plan', () => {
    (useQuery as jest.Mock).mockReturnValue({ plan: 'professional', _id: 'org-2' });

    const result = useSubscription();
    expect(result.isActive).toBe(true);
    expect(result.plan).toBe('professional');
  });

  it('returns active state with enterprise plan', () => {
    (useQuery as jest.Mock).mockReturnValue({ plan: 'enterprise', _id: 'org-3' });

    const result = useSubscription();
    expect(result.isActive).toBe(true);
    expect(result.plan).toBe('enterprise');
  });

  it('falls back to starter when organization has no plan field', () => {
    (useQuery as jest.Mock).mockReturnValue({ _id: 'org-1' });

    const result = useSubscription();
    expect(result.plan).toBe('starter');
  });

  it('falls back to starter when organization is null', () => {
    (useQuery as jest.Mock).mockReturnValue(null);

    const result = useSubscription();
    expect(result.plan).toBe('starter');
  });
});
