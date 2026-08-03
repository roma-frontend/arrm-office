/**
 * Regression tests for the nested scroll lock.
 *
 * /calendar locks the page itself while "any modal is open", and a dialog shell
 * such as RoomModalShell locks it again for its own panel, so two locks are
 * held at once. Before the locks were reference counted, the inner one — which
 * mounts first and therefore captures the *unlocked* styles — released to
 * `overflow: ''` while the dialog was still open, and the outer lock then wrote
 * back the `hidden` it had captured. The page could not be scrolled again until
 * a reload, which is what "after opening a modal the calendar stops scrolling"
 * turned out to be.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { useScrollLock } from '@/hooks/useScrollLock';

function Locker({ locked }: { locked: boolean }) {
  useScrollLock(locked);
  return null;
}

/** Mirrors the real nesting: a page-level lock with a dialog lock inside it. */
function Page({ outer, inner }: { outer: boolean; inner: boolean }) {
  useScrollLock(outer);
  return inner ? <Locker locked /> : null;
}

describe('useScrollLock', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
    document.body.innerHTML = '<main class="main-scrollable"></main>';
  });

  it('locks and releases a single lock', () => {
    const { rerender } = render(<Page outer inner={false} />);
    expect(document.body.style.overflow).toBe('hidden');

    rerender(<Page outer={false} inner={false} />);
    expect(document.body.style.overflow).toBe('');
  });

  it('stays locked until the last nested lock is released', () => {
    const { rerender } = render(<Page outer inner />);
    expect(document.body.style.overflow).toBe('hidden');

    // Dialog closed, page still considers a modal open.
    rerender(<Page outer inner={false} />);
    expect(document.body.style.overflow).toBe('hidden');

    rerender(<Page outer={false} inner={false} />);
    expect(document.body.style.overflow).toBe('');
  });

  it('releases cleanly when the outer lock goes first', () => {
    const { rerender } = render(<Page outer inner />);

    // The page decides no modal is open while the dialog is still mounted,
    // e.g. during its exit animation.
    rerender(<Page outer={false} inner />);
    expect(document.body.style.overflow).toBe('hidden');

    rerender(<Page outer={false} inner={false} />);
    expect(document.body.style.overflow).toBe('');
  });

  it('also locks the dashboard scroll container, not just the body', () => {
    const main = document.querySelector('main') as HTMLElement;

    const { rerender } = render(<Page outer inner={false} />);
    expect(main.style.overflow).toBe('hidden');

    rerender(<Page outer={false} inner={false} />);
    expect(main.style.overflow).toBe('');
  });

  it('unmounting the whole tree releases every lock', () => {
    const main = document.querySelector('main') as HTMLElement;
    const { unmount } = render(<Page outer inner />);

    unmount();

    expect(document.body.style.overflow).toBe('');
    expect(main.style.overflow).toBe('');
  });

  it('preserves inline styles that were already set before locking', () => {
    document.body.style.overflow = 'clip';
    document.body.style.paddingRight = '8px';

    const { rerender } = render(<Page outer inner />);
    expect(document.body.style.overflow).toBe('hidden');

    rerender(<Page outer={false} inner={false} />);
    expect(document.body.style.overflow).toBe('clip');
    expect(document.body.style.paddingRight).toBe('8px');
  });
});
