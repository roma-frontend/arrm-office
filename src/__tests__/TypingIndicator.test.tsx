/**
 * Tests for TypingIndicator — the animated "X is typing…" bubble.
 */

import React from 'react';
import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';

import { TypingIndicator } from '@/components/chat/TypingIndicator';

describe('TypingIndicator', () => {
  it('shows the first name and "is typing" for a single user', () => {
    render(<TypingIndicator users={[{ userId: 'u1', name: 'Alice Smith' }]} />);
    expect(screen.getByText('Alice is typing…')).toBeInTheDocument();
  });

  it('joins first names and uses "are typing" for multiple users', () => {
    render(
      <TypingIndicator
        users={[
          { userId: 'u1', name: 'Alice Smith' },
          { userId: 'u2', name: 'Bob Brown' },
          { userId: 'u3', name: 'Carol' },
        ]}
      />,
    );
    expect(screen.getByText('Alice, Bob, Carol are typing…')).toBeInTheDocument();
  });

  it('renders three animated dots', () => {
    const { container } = render(<TypingIndicator users={[{ userId: 'u1', name: 'Alice' }]} />);
    expect(container.querySelectorAll('.animate-bounce')).toHaveLength(3);
  });
});
