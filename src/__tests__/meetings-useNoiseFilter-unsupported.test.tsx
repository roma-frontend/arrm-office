/**
 * useNoiseFilter where Krisp cannot run — a browser without the required audio
 * worklet support, or a chunk that fails to load. The kit hook only logs a
 * warning in that case, which is why the wrapper probes support itself; this is
 * the file that proves the toggle reports "unavailable" instead of going inert.
 *
 * Separate from the supported-path suite because the probe result is cached in
 * module scope for the lifetime of the page (and so of the test file).
 */
import { renderHook, act } from '@testing-library/react';
import { useNoiseFilter } from '@/components/meetings/useNoiseFilter';

const mockKrispState = {
  isNoiseFilterEnabled: false,
  isNoiseFilterPending: false,
  setNoiseFilterEnabled: jest.fn(async (_on: boolean) => undefined),
};

jest.mock('@livekit/components-react/krisp', () => ({
  useKrispNoiseFilter: () => mockKrispState,
}));

// Loading the package works, but asking it about support blows up — the same
// failure shape as a browser missing AudioWorklet or a blocked WASM fetch.
jest.mock('@livekit/krisp-noise-filter', () => ({
  isKrispNoiseFilterSupported: () => {
    throw new Error('no audio worklet');
  },
}));

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useNoiseFilter (unsupported)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reports the browser as unsupported once probed', async () => {
    const { result } = renderHook(() => useNoiseFilter(true));
    await flush();

    expect(result.current.supported).toBe(false);
    expect(result.current.failed).toBe(false);
  });

  it('refuses to enable and does not touch the kit hook', async () => {
    const { result } = renderHook(() => useNoiseFilter(false));

    await act(async () => {
      await result.current.toggle(true);
    });

    expect(mockKrispState.setNoiseFilterEnabled).not.toHaveBeenCalled();
    expect(result.current.supported).toBe(false);
  });

  it('still allows switching the filter off', async () => {
    const { result } = renderHook(() => useNoiseFilter(false));

    await act(async () => {
      await result.current.toggle(false);
    });

    expect(mockKrispState.setNoiseFilterEnabled).toHaveBeenCalledWith(false);
  });
});
