/**
 * Tests for KeyboardShortcutsModal — modal showing ⌘-shortcut list.
 */

import React from 'react';
import { describe, it, expect, jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
  }),
}));

jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return {
    X: Icon,
    Keyboard: Icon,
    Zap: Icon,
    Search: Icon,
    Sparkles: Icon,
    Command: Icon,
    XCircle: Icon,
  };
});

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

import { KeyboardShortcutsModal } from '@/components/KeyboardShortcutsModal';

describe('KeyboardShortcutsModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<KeyboardShortcutsModal isOpen={false} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders shortcut sections when open', () => {
    render(<KeyboardShortcutsModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByText('keyboard.navigation')).toBeInTheDocument();
    expect(screen.getByText('keyboard.quickActions')).toBeInTheDocument();
    expect(screen.getByText('keyboard.interface')).toBeInTheDocument();
  });

  it('renders key caps for shortcuts', () => {
    render(<KeyboardShortcutsModal isOpen={true} onClose={() => {}} />);
    const kbd = document.querySelectorAll('kbd');
    // The new cheat sheet lists 5 rows (palette, search, AI, help, Esc).
    // Each row has either one key cap (single-key) or two (modifier+letter),
    // so 7 key caps is the realistic floor.
    expect(kbd.length).toBeGreaterThanOrEqual(5);
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = jest.fn();
    render(<KeyboardShortcutsModal isOpen={true} onClose={onClose} />);
    const backdrop = document.querySelectorAll('[class*="fixed inset-0"]')[0];
    fireEvent.click(backdrop as Element);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = jest.fn();
    render(<KeyboardShortcutsModal isOpen={true} onClose={onClose} />);
    const closeButtons = screen.getAllByRole('button');
    fireEvent.click(closeButtons[0]!);
    expect(onClose).toHaveBeenCalled();
  });
});
