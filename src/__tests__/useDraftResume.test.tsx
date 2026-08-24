/**
 * Tests for useDraftResume hook — draft resume prompt state.
 *
 * Covers: available flag, step/savedAt, dismiss, discard, suppression logic,
 * null key, watch=false.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDraftResume } from '@/hooks/useDraftResume';
import { peekWizardDraft, clearWizardDraft } from '@/hooks/useWizardDraft';

// Mock dependencies
jest.mock('@/store/useAuthStore', () => ({
  useAuthUser: jest.fn(() => ({ id: 'user-123' })),
}));

jest.mock('@/hooks/useWizardDraft', () => ({
  peekWizardDraft: jest.fn(),
  clearWizardDraft: jest.fn(),
}));

describe('useDraftResume', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (peekWizardDraft as jest.Mock).mockReturnValue(null);
  });

  it('returns available=false when no draft exists', async () => {
    (peekWizardDraft as jest.Mock).mockReturnValue(null);

    const { result } = renderHook(() => useDraftResume('my-form', true));

    await waitFor(() => {
      expect(result.current.available).toBe(false);
    });
  });

  it('returns available=true when draft exists', async () => {
    (peekWizardDraft as jest.Mock).mockReturnValue({
      step: 2,
      savedAt: 1000,
    });

    const { result } = renderHook(() => useDraftResume('my-form', true));

    await waitFor(() => {
      expect(result.current.available).toBe(true);
    });
  });

  it('returns correct step from draft', async () => {
    (peekWizardDraft as jest.Mock).mockReturnValue({
      step: 3,
      savedAt: 2000,
    });

    const { result } = renderHook(() => useDraftResume('my-form', true));

    await waitFor(() => {
      expect(result.current.step).toBe(3);
    });
  });

  it('returns correct savedAt from draft', async () => {
    const savedAt = 1234567890;
    (peekWizardDraft as jest.Mock).mockReturnValue({
      step: 0,
      savedAt,
    });

    const { result } = renderHook(() => useDraftResume('my-form', true));

    await waitFor(() => {
      expect(result.current.savedAt).toBe(savedAt);
    });
  });

  it('returns available=false when watch is false', async () => {
    (peekWizardDraft as jest.Mock).mockReturnValue({
      step: 1,
      savedAt: 1000,
    });

    const { result } = renderHook(() => useDraftResume('my-form', false));

    // watch=false means draft is not checked
    expect(result.current.available).toBe(false);
  });

  it('returns available=false when key is null', async () => {
    const { result } = renderHook(() => useDraftResume(null, true));

    await waitFor(() => {
      expect(result.current.available).toBe(false);
    });
  });

  it('returns available=false when key is undefined', async () => {
    const { result } = renderHook(() => useDraftResume(undefined, true));

    await waitFor(() => {
      expect(result.current.available).toBe(false);
    });
  });

  it('dismiss hides the prompt', async () => {
    (peekWizardDraft as jest.Mock).mockReturnValue({
      step: 1,
      savedAt: 1000,
    });

    const { result } = renderHook(() => useDraftResume('my-form', true));

    await waitFor(() => {
      expect(result.current.available).toBe(true);
    });

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.available).toBe(false);
  });

  it('discard calls clearWizardDraft', async () => {
    (peekWizardDraft as jest.Mock).mockReturnValue({
      step: 1,
      savedAt: 1000,
    });

    const { result } = renderHook(() => useDraftResume('my-form', true));

    await waitFor(() => {
      expect(result.current.available).toBe(true);
    });

    act(() => {
      result.current.discard();
    });

    expect(clearWizardDraft).toHaveBeenCalledWith('my-form', 'user-123');
    expect(result.current.available).toBe(false);
    expect(result.current.step).toBe(0);
    expect(result.current.savedAt).toBeNull();
  });

  it('peekWizardDraft is called with correct key and userId', async () => {
    (peekWizardDraft as jest.Mock).mockReturnValue(null);

    renderHook(() => useDraftResume('compensation-record', true));

    await waitFor(() => {
      expect(peekWizardDraft).toHaveBeenCalledWith('compensation-record', 'user-123');
    });
  });

  it('does not call peekWizardDraft when watch is false', async () => {
    (peekWizardDraft as jest.Mock).mockReturnValue(null);

    renderHook(() => useDraftResume('compensation-record', false));

    // peekWizardDraft should not be called since watch=false
    // (the effect returns early)
    await new Promise((r) => setTimeout(r, 50));
    expect(peekWizardDraft).not.toHaveBeenCalled();
  });

  it('defaults step to 0 and savedAt to null when no draft', async () => {
    const { result } = renderHook(() => useDraftResume('my-form', true));

    await waitFor(() => {
      expect(result.current.step).toBe(0);
      expect(result.current.savedAt).toBeNull();
    });
  });

  it('dismiss does not discard the draft from sessionStorage', async () => {
    (peekWizardDraft as jest.Mock).mockReturnValue({
      step: 1,
      savedAt: 1000,
    });

    const { result } = renderHook(() => useDraftResume('my-form', true));

    await waitFor(() => {
      expect(result.current.available).toBe(true);
    });

    act(() => {
      result.current.dismiss();
    });

    // Dismiss should hide prompt but not touch sessionStorage
    expect(result.current.available).toBe(false);
    expect(clearWizardDraft).not.toHaveBeenCalled();
  });
});
