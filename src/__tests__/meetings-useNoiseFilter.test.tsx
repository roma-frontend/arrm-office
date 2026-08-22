/**
 * Tests for useNoiseFilter on a browser that supports Krisp.
 *
 * The hook caches the support answer in module scope (the answer cannot change
 * within a page load), so a fresh registry per case is impossible without
 * duplicating React. The unsupported path therefore lives in its own file:
 * `meetings-useNoiseFilter-unsupported.test.tsx`.
 */
import { renderHook, act } from '@testing-library/react';
import { useNoiseFilter } from '@/components/meetings/useNoiseFilter';

const mockKrispState = {
  isNoiseFilterEnabled: false,
  isNoiseFilterPending: false,
  setNoiseFilterEnabled: jest.fn(async (_on: boolean) => undefined),
};
const mockLoad = { calls: 0 };

jest.mock('@livekit/components-react/krisp', () => ({
  useKrispNoiseFilter: () => mockKrispState,
}));

jest.mock('@livekit/krisp-noise-filter', () => {
  mockLoad.calls += 1;
  return { isKrispNoiseFilterSupported: () => true };
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useNoiseFilter (supported)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockKrispState.isNoiseFilterEnabled = false;
    mockKrispState.isNoiseFilterPending = false;
    mockLoad.calls = 0;
  });

  // Must stay first: the probe result is cached for the rest of the file.
  it('does not load the filter until it is probed', async () => {
    const { result } = renderHook(() => useNoiseFilter(false));
    await flush();

    expect(result.current.supported).toBeNull();
    expect(mockLoad.calls).toBe(0);
  });

  it('reports support once probed', async () => {
    const { result } = renderHook(() => useNoiseFilter(true));
    await flush();

    expect(result.current.supported).toBe(true);
    expect(mockLoad.calls).toBe(1);
  });

  it('answers from the cache on later mounts', async () => {
    const { result } = renderHook(() => useNoiseFilter(false));
    await flush();

    expect(result.current.supported).toBe(true);
    expect(mockLoad.calls).toBe(0);
  });

  it('enables and disables the filter through the kit hook', async () => {
    const { result } = renderHook(() => useNoiseFilter(true));
    await flush();

    await act(async () => {
      await result.current.toggle(true);
    });
    expect(mockKrispState.setNoiseFilterEnabled).toHaveBeenCalledWith(true);

    await act(async () => {
      await result.current.toggle(false);
    });
    expect(mockKrispState.setNoiseFilterEnabled).toHaveBeenLastCalledWith(false);
    expect(result.current.failed).toBe(false);
  });

  it('surfaces a failure from the processor', async () => {
    mockKrispState.setNoiseFilterEnabled.mockRejectedValueOnce(new Error('worklet failed'));
    const { result } = renderHook(() => useNoiseFilter(true));
    await flush();

    await act(async () => {
      await result.current.toggle(true);
    });
    expect(result.current.failed).toBe(true);

    // A later successful toggle clears it again.
    await act(async () => {
      await result.current.toggle(true);
    });
    expect(result.current.failed).toBe(false);
  });

  it('mirrors the kit hook state', async () => {
    mockKrispState.isNoiseFilterEnabled = true;
    mockKrispState.isNoiseFilterPending = true;
    const { result } = renderHook(() => useNoiseFilter(true));
    await flush();

    expect(result.current.enabled).toBe(true);
    expect(result.current.pending).toBe(true);
  });

  it('does not update state after unmount', async () => {
    const { result, unmount } = renderHook(() => useNoiseFilter(true));
    await flush();
    unmount();

    await act(async () => {
      await result.current.toggle(true);
    });
    expect(mockKrispState.setNoiseFilterEnabled).toHaveBeenCalledWith(true);
  });
});
