/**
 * Tests for RadixScrollLockFix — strips Radix's body scroll-compensation
 * inline styles via a MutationObserver.
 *
 * jsdom ships a real MutationObserver, so the strip-on-mount, reactive
 * stripping and disconnect-on-unmount behaviors are all tested against the
 * actual observer (async mutations are flushed with waitFor).
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, waitFor } from '@testing-library/react';
import { RadixScrollLockFix } from '@/components/RadixScrollLockFix';

const bodyStyle = () => document.body.style;

const setBodyStyle = (css: string) => {
  document.body.setAttribute('style', css);
};

describe('RadixScrollLockFix', () => {
  beforeEach(() => {
    document.body.removeAttribute('style');
  });

  afterEach(() => {
    document.body.removeAttribute('style');
  });

  it('renders nothing', () => {
    const { container } = render(<RadixScrollLockFix />);
    expect(container.firstChild).toBeNull();
  });

  it('strips margin-right, padding-right and relative position on mount', () => {
    document.body.style.marginRight = '15px';
    document.body.style.paddingRight = '15px';
    document.body.style.position = 'relative';

    render(<RadixScrollLockFix />);

    expect(bodyStyle().marginRight).toBe('');
    expect(bodyStyle().paddingRight).toBe('');
    expect(bodyStyle().position).toBe('');
  });

  it('leaves unrelated style properties untouched', () => {
    document.body.style.marginLeft = '10px';
    document.body.style.backgroundColor = 'rgb(0, 0, 0)';
    document.body.style.position = 'fixed'; // not the relative Radix value

    render(<RadixScrollLockFix />);

    expect(bodyStyle().marginLeft).toBe('10px');
    expect(bodyStyle().backgroundColor).toBe('rgb(0, 0, 0)');
    expect(bodyStyle().position).toBe('fixed');
  });

  it('reacts to new style mutations and strips them again', async () => {
    render(<RadixScrollLockFix />);

    // Radix adds the compensation styles after mount — the observer must strip
    // them reactively.
    setBodyStyle('margin-right: 15px; padding-right: 15px; position: relative;');

    await waitFor(() => {
      expect(bodyStyle().marginRight).toBe('');
      expect(bodyStyle().paddingRight).toBe('');
      expect(bodyStyle().position).toBe('');
    });
  });

  it('reacts to a style mutation that only adds margin-right', async () => {
    render(<RadixScrollLockFix />);

    setBodyStyle('margin-right: 15px;');

    await waitFor(() => {
      expect(bodyStyle().marginRight).toBe('');
    });
  });

  it('ignores mutations of non-style attributes via the observer guard', () => {
    // The observer is configured with attributeFilter: ['style'], so in practice
    // only style mutations arrive. The guard inside the callback is defensive —
    // exercise both sides by driving the callback manually with a fake observer.
    const originalMO = window.MutationObserver;
    let capturedCallback: MutationCallback = () => {};
    const observeSpy = jest.fn();
    const disconnectSpy = jest.fn();
    (window as any).MutationObserver = jest.fn((cb: MutationCallback) => {
      capturedCallback = cb;
      return { observe: observeSpy, disconnect: disconnectSpy };
    });

    try {
      render(<RadixScrollLockFix />);
      expect(observeSpy).toHaveBeenCalledWith(document.body, {
        attributes: true,
        attributeFilter: ['style'],
      });

      // Non-style attribute mutation → strip() must NOT run.
      setBodyStyle('margin-right: 15px;');
      capturedCallback([{ type: 'attributes', attributeName: 'data-x' } as MutationRecord]);
      expect(bodyStyle().marginRight).toBe('15px');

      // Style attribute mutation → strip() must run.
      capturedCallback([{ type: 'attributes', attributeName: 'style' } as MutationRecord]);
      expect(bodyStyle().marginRight).toBe('');
    } finally {
      (window as any).MutationObserver = originalMO;
      document.body.removeAttribute('style');
    }
  });

  it('disconnects the observer on unmount so styles are no longer stripped', async () => {
    const disconnectSpy = jest.spyOn(window.MutationObserver.prototype, 'disconnect');
    const { unmount } = render(<RadixScrollLockFix />);

    unmount();
    expect(disconnectSpy).toHaveBeenCalled();

    setBodyStyle('margin-right: 15px;');
    // give the (now disconnected) observer a moment — the style must survive
    await new Promise((r) => setTimeout(r, 20));
    expect(bodyStyle().marginRight).toBe('15px');

    disconnectSpy.mockRestore();
    document.body.removeAttribute('style');
  });
});
