/**
 * Tests for EmojiPicker — the emoji grid with outside-click dismissal.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';

import EmojiPicker from '@/components/chat/EmojiPicker';

describe('EmojiPicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all emoji groups with their labels', () => {
    render(<EmojiPicker onSelect={jest.fn()} onClose={jest.fn()} />);
    expect(screen.getByText('Smileys')).toBeInTheDocument();
    expect(screen.getByText('Gestures')).toBeInTheDocument();
    expect(screen.getByText('People')).toBeInTheDocument();
    expect(screen.getByText('Hearts')).toBeInTheDocument();
    expect(screen.getByText('Nature')).toBeInTheDocument();
    expect(screen.getByText('Food')).toBeInTheDocument();
    expect(screen.getByText('Activity')).toBeInTheDocument();
    expect(screen.getByText('Objects')).toBeInTheDocument();
  });

  it('calls onSelect with the clicked emoji', () => {
    const onSelect = jest.fn();
    render(<EmojiPicker onSelect={onSelect} onClose={jest.fn()} />);
    // '😀' appears exactly once in the Smileys group.
    const smile = screen.getByText('😀');
    fireEvent.click(smile);
    expect(onSelect).toHaveBeenCalledWith('😀');
  });

  it('calls onClose when clicking outside the picker', () => {
    const onClose = jest.fn();
    render(<EmojiPicker onSelect={jest.fn()} onClose={onClose} />);
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when clicking inside the picker', () => {
    const onClose = jest.fn();
    render(<EmojiPicker onSelect={jest.fn()} onClose={onClose} />);
    fireEvent.mouseDown(screen.getByText('😀'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('removes the outside-click listener on unmount', () => {
    const removeSpy = jest.spyOn(document, 'removeEventListener');
    try {
      const { unmount } = render(<EmojiPicker onSelect={jest.fn()} onClose={jest.fn()} />);
      unmount();
      expect(removeSpy).toHaveBeenCalledWith('mousedown', expect.any(Function));
    } finally {
      removeSpy.mockRestore();
    }
  });
});
