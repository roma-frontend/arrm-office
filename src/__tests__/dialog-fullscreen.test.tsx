/**
 * Tests for the dialog fullscreen mode.
 *
 * Two things are asserted, both of which used to be missing:
 *   1. the maximize control only appears when a caller opts in;
 *   2. maximizing appends the fullscreen size classes *after* the caller's own
 *      className, because a caller's `sm:max-w-[640px]` would otherwise keep
 *      the dialog at its windowed width — tailwind-merge only drops a class
 *      when the breakpoint modifier matches too.
 *
 * The enter/exit animation itself is CSS (`.dialog-content-anim` in
 * styles/animations.css) and is asserted only by the presence of the class,
 * since jsdom does not run keyframes.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FullscreenToggle } from '@/components/ui/fullscreen-panel';

function renderDialog(props: Record<string, unknown> = {}) {
  return render(
    <Dialog open>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh]" {...props}>
        <p>Body</p>
      </DialogContent>
    </Dialog>,
  );
}

describe('DialogContent fullscreen', () => {
  it('shows no maximize control by default', () => {
    renderDialog();

    expect(screen.queryByTitle('Fullscreen')).not.toBeInTheDocument();
  });

  it('renders the maximize control when allowFullscreen is set', () => {
    renderDialog({ allowFullscreen: true });

    expect(screen.getByTitle('Fullscreen')).toBeInTheDocument();
  });

  it('carries the animation class so open/close is not instant', () => {
    renderDialog({ allowFullscreen: true });

    expect(screen.getByText('Body').parentElement).toHaveClass('dialog-content-anim');
  });

  it('grows to the viewport and back, overriding the caller max-width', () => {
    renderDialog({ allowFullscreen: true });
    const panel = screen.getByText('Body').parentElement as HTMLElement;

    expect(panel.className).toContain('sm:max-w-[640px]');

    fireEvent.click(screen.getByTitle('Fullscreen'));

    expect(panel.className).toContain('sm:max-w-[100vw]');
    expect(panel.className).toContain('min-h-[100dvh]');
    expect(panel.className).toContain('rounded-none');
    expect(panel.className).not.toContain('sm:max-w-[640px]');

    fireEvent.click(screen.getByTitle('Exit fullscreen'));

    expect(panel.className).toContain('sm:max-w-[640px]');
    expect(panel.className).not.toContain('min-h-[100dvh]');
  });

  it('starts maximized with defaultFullscreen', () => {
    renderDialog({ allowFullscreen: true, defaultFullscreen: true });

    expect(screen.getByTitle('Exit fullscreen')).toBeInTheDocument();
  });

  it('accepts caller-supplied labels', () => {
    renderDialog({
      allowFullscreen: true,
      fullscreenLabels: { enter: 'На весь экран', exit: 'Выйти' },
    });

    expect(screen.getByTitle('На весь экран')).toBeInTheDocument();
  });
});

describe('FullscreenToggle', () => {
  it('reports its state to assistive tech and toggles on click', () => {
    const onToggle = jest.fn();
    const { rerender } = render(<FullscreenToggle fullscreen={false} onToggle={onToggle} />);

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(<FullscreenToggle fullscreen onToggle={onToggle} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });
});
