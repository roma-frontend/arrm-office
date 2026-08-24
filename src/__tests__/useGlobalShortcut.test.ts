/**
 * Tests for useGlobalShortcut hook — window-level keyboard shortcuts.
 *
 * Covers: key matching, meta/ctrl modifier, shift/alt, disabled state,
 * allowInInput bypass, and input field suppression.
 */
import { renderHook, act } from '@testing-library/react';
import { useGlobalShortcut } from '@/hooks/useGlobalShortcut';

/**
 * Dispatch a keydown event.
 *
 * If `target` is provided, dispatch on that element (so `event.target` is set
 * correctly in jsdom — dispatching on `window` always sets target to `window`).
 */
function fireKeydown(
  key: string,
  opts: Partial<KeyboardEventInit> & { target?: EventTarget } = {},
) {
  const { target, ...eventOpts } = opts;
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...eventOpts,
  });
  act(() => {
    (target ?? window).dispatchEvent(event);
  });
}

describe('useGlobalShortcut', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fires handler when matching key is pressed', () => {
    const handler = jest.fn();
    renderHook(() => useGlobalShortcut({ key: '/' }, handler));

    fireKeydown('/');

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire for wrong key', () => {
    const handler = jest.fn();
    renderHook(() => useGlobalShortcut({ key: '/' }, handler));

    fireKeydown('a');

    expect(handler).not.toHaveBeenCalled();
  });

  it('is case-insensitive', () => {
    const handler = jest.fn();
    renderHook(() => useGlobalShortcut({ key: 'k' }, handler));

    fireKeydown('K');

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('fires when meta key is required and metaKey is held', () => {
    const handler = jest.fn();
    renderHook(() => useGlobalShortcut({ key: 'k', meta: true }, handler));

    fireKeydown('k', { metaKey: true });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('fires when meta key required and ctrlKey is held (cross-platform)', () => {
    const handler = jest.fn();
    renderHook(() => useGlobalShortcut({ key: 'k', meta: true }, handler));

    fireKeydown('k', { ctrlKey: true });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire when meta required but no modifier held', () => {
    const handler = jest.fn();
    renderHook(() => useGlobalShortcut({ key: 'k', meta: true }, handler));

    fireKeydown('k');

    expect(handler).not.toHaveBeenCalled();
  });

  it('does NOT fire when meta required but only shift is held', () => {
    const handler = jest.fn();
    renderHook(() => useGlobalShortcut({ key: 'k', meta: true }, handler));

    fireKeydown('k', { shiftKey: true });

    expect(handler).not.toHaveBeenCalled();
  });

  it('fires with shift modifier when shiftKey is held', () => {
    const handler = jest.fn();
    renderHook(() => useGlobalShortcut({ key: 'k', shift: true }, handler));

    fireKeydown('k', { shiftKey: true });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire when shift required but not held', () => {
    const handler = jest.fn();
    renderHook(() => useGlobalShortcut({ key: 'k', shift: true }, handler));

    fireKeydown('k');

    expect(handler).not.toHaveBeenCalled();
  });

  it('fires with alt modifier when altKey is held', () => {
    const handler = jest.fn();
    renderHook(() => useGlobalShortcut({ key: 'k', alt: true }, handler));

    fireKeydown('k', { altKey: true });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire for bare key when focus is in an input', () => {
    const handler = jest.fn();
    renderHook(() => useGlobalShortcut({ key: '/' }, handler));

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    // Dispatch on the input so event.target is the input in jsdom
    fireKeydown('/', { target: input });

    expect(handler).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('does NOT fire for bare key when focus is in a textarea', () => {
    const handler = jest.fn();
    renderHook(() => useGlobalShortcut({ key: '/' }, handler));

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();

    // Dispatch on the textarea so event.target is the textarea in jsdom
    fireKeydown('/', { target: textarea });

    expect(handler).not.toHaveBeenCalled();
    document.body.removeChild(textarea);
  });

  // Skipped: jsdom does not implement `isContentEditable` (returns undefined),
  // so the contenteditable guard in `useGlobalShortcut` can't be tested here.
  it.skip('does NOT fire for bare key when focus is in a contenteditable', () => {});

  it('fires in input when allowInInput is true', () => {
    const handler = jest.fn();
    renderHook(() => useGlobalShortcut({ key: '/', allowInInput: true }, handler));

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    // Dispatch on the input so event.target is the input in jsdom
    fireKeydown('/', { target: input });

    expect(handler).toHaveBeenCalledTimes(1);
    document.body.removeChild(input);
  });

  it('fires meta shortcut in input (implied allowInInput)', () => {
    const handler = jest.fn();
    renderHook(() => useGlobalShortcut({ key: 'k', meta: true }, handler));

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    // Dispatch on the input so event.target is the input in jsdom
    fireKeydown('k', { target: input, metaKey: true });

    expect(handler).toHaveBeenCalledTimes(1);
    document.body.removeChild(input);
  });

  it('does NOT fire when enabled is false', () => {
    const handler = jest.fn();
    renderHook(() => useGlobalShortcut({ key: '/', enabled: false }, handler));

    fireKeydown('/');

    expect(handler).not.toHaveBeenCalled();
  });

  it('fires when enabled is true', () => {
    const handler = jest.fn();
    renderHook(() => useGlobalShortcut({ key: '/', enabled: true }, handler));

    fireKeydown('/');

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('passes the KeyboardEvent to the handler', () => {
    const handler = jest.fn();
    renderHook(() => useGlobalShortcut({ key: '/' }, handler));

    fireKeydown('/');

    expect(handler.mock.calls[0][0]).toBeInstanceOf(KeyboardEvent);
    expect(handler.mock.calls[0][0].key).toBe('/');
  });

  it('cleans up event listener on unmount', () => {
    const handler = jest.fn();
    const { unmount } = renderHook(() => useGlobalShortcut({ key: '/' }, handler));

    unmount();
    fireKeydown('/');

    expect(handler).not.toHaveBeenCalled();
  });

  it('updates handler without re-attaching listener', () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();
    const { rerender } = renderHook(({ h }) => useGlobalShortcut({ key: '/' }, h), {
      initialProps: { h: handler1 },
    });

    fireKeydown('/');
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).not.toHaveBeenCalled();

    rerender({ h: handler2 });
    fireKeydown('/');

    // handler2 is now active via the ref sync
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it('supports combined modifiers (meta + shift)', () => {
    const handler = jest.fn();
    renderHook(() => useGlobalShortcut({ key: 'k', meta: true, shift: true }, handler));

    fireKeydown('k', { metaKey: true, shiftKey: true });
    expect(handler).toHaveBeenCalledTimes(1);

    // Without shift should not fire
    fireKeydown('k', { metaKey: true });
    expect(handler).toHaveBeenCalledTimes(1); // still 1
  });
});
