/**
 * Tests for useKeystrokeDynamics hook — typing rhythm measurement
 */

import { renderHook, act } from '@testing-library/react';
import { useKeystrokeDynamics } from '@/hooks/useKeystrokeDynamics';

afterEach(() => {
  jest.useRealTimers();
});

describe('useKeystrokeDynamics', () => {
  it('records key down and key up events with timing', () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useKeystrokeDynamics());

    act(() => {
      // Simulate typing 4 characters with real timing differences
      'abcd'.split('').forEach((ch) => {
        result.current.onKeyDown({ key: ch } as any);
        jest.advanceTimersByTime(80); // dwell time
        result.current.onKeyUp({ key: ch } as any);
        jest.advanceTimersByTime(200); // flight time
      });
    });

    const sample = result.current.getSample();
    expect(sample).not.toBeNull();
    expect(sample!.sampleCount).toBeGreaterThanOrEqual(3);
    expect(sample!.avgDwell).toBeGreaterThan(0);
    expect(sample!.avgFlight).toBeGreaterThan(0);
  });

  it('returns null for fewer than 4 keystrokes', () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useKeystrokeDynamics());

    act(() => {
      result.current.onKeyDown({ key: 'a' } as any);
      jest.advanceTimersByTime(50);
      result.current.onKeyUp({ key: 'a' } as any);
    });

    expect(result.current.getSample()).toBeNull();
  });

  it('records Backspace key', () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useKeystrokeDynamics());

    act(() => {
      result.current.onKeyDown({ key: 'Backspace' } as any);
      jest.advanceTimersByTime(50);
      result.current.onKeyUp({ key: 'Backspace' } as any);
    });

    expect(result.current.getSample()).toBeNull(); // Only 1 event
  });

  it('records standard characters with timing', () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useKeystrokeDynamics());

    act(() => {
      'hello!'.split('').forEach((ch) => {
        result.current.onKeyDown({ key: ch } as any);
        jest.advanceTimersByTime(70);
        result.current.onKeyUp({ key: ch } as any);
        jest.advanceTimersByTime(180);
      });
    });

    const sample = result.current.getSample();
    expect(sample).not.toBeNull();
    expect(sample!.sampleCount).toBeGreaterThanOrEqual(3);
  });

  it('ignores special keys like Shift, Control', () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useKeystrokeDynamics());

    act(() => {
      result.current.onKeyDown({ key: 'Shift' } as any);
      result.current.onKeyDown({ key: 'Control' } as any);
    });

    expect(result.current.getSample()).toBeNull();
  });

  it('calculates stdDev values', () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useKeystrokeDynamics());

    act(() => {
      'abcdefgh'.split('').forEach((ch) => {
        result.current.onKeyDown({ key: ch } as any);
        jest.advanceTimersByTime(70);
        result.current.onKeyUp({ key: ch } as any);
        jest.advanceTimersByTime(200);
      });
    });

    const sample = result.current.getSample();
    expect(sample).not.toBeNull();
    expect(sample!.stdDevDwell).toBeGreaterThanOrEqual(0);
    expect(sample!.stdDevFlight).toBeGreaterThanOrEqual(0);
  });

  it('reset clears all events', () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useKeystrokeDynamics());

    act(() => {
      'abcdefgh'.split('').forEach((ch) => {
        result.current.onKeyDown({ key: ch } as any);
        jest.advanceTimersByTime(70);
        result.current.onKeyUp({ key: ch } as any);
        jest.advanceTimersByTime(200);
      });
    });

    expect(result.current.getSample()).not.toBeNull();

    act(() => {
      result.current.reset();
    });

    expect(result.current.getSample()).toBeNull();
  });
});
