/**
 * Tests for src/components/ui/ShieldLoader.tsx — the animated brand loader:
 * default vs inline variants, all five sizes, and the optional message.
 */

import React from 'react';
import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';

jest.mock('lucide-react', () => ({
  Shield: ({ size, ...rest }: any) => <svg data-testid="shield" data-size={size} {...rest} />,
}));

import { ShieldLoader } from '@/components/ui/ShieldLoader';

describe('ShieldLoader', () => {
  it('renders the default variant with the HR badge and three dots', () => {
    const { container } = render(<ShieldLoader />);
    expect(screen.getByTestId('shield')).toBeInTheDocument();
    expect(screen.getByText('HR')).toBeInTheDocument();
    expect(container.querySelectorAll('.animate-pulse-dot')).toHaveLength(3);
  });

  it('renders the optional message', () => {
    render(<ShieldLoader message="Загрузка…" />);
    expect(screen.getByText('Загрузка…')).toBeInTheDocument();
  });

  it('omits the message paragraph when none is given', () => {
    render(<ShieldLoader />);
    expect(screen.queryByRole('paragraph')).not.toBeInTheDocument();
  });

  it('renders the inline variant without the loading dots', () => {
    const { container } = render(<ShieldLoader variant="inline" />);
    expect(screen.getByTestId('shield')).toBeInTheDocument();
    expect(container.querySelectorAll('.animate-pulse-dot')).toHaveLength(0);
  });

  it('maps every size to a shield size', () => {
    const sizes: Array<[string, number]> = [
      ['xs', 16],
      ['sm', 24],
      ['md', 48],
      ['lg', 80],
      ['xl', 120],
    ];
    for (const [size, shieldSize] of sizes) {
      const { unmount } = render(<ShieldLoader size={size as any} />);
      expect(screen.getByTestId('shield')).toHaveAttribute('data-size', String(shieldSize));
      unmount();
    }
  });

  it('applies an extra className', () => {
    const { container } = render(<ShieldLoader className="extra-class" />);
    expect(container.firstChild).toHaveClass('extra-class');
  });
});
