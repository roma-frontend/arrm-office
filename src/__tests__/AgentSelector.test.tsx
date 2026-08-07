/**
 * Tests for AgentSelector — dropdown to switch between AI agents.
 */

import React from 'react';
import { describe, it, expect, jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
  }),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: any) => <div data-testid="dropdown-menu">{children}</div>,
  DropdownMenuTrigger: ({ children }: any) => <div data-testid="trigger">{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div data-testid="content">{children}</div>,
  DropdownMenuItem: ({ children, onClick }: any) => (
    <button data-testid="menu-item" onClick={onClick}>
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children }: any) => <div data-testid="label">{children}</div>,
  DropdownMenuSeparator: () => <hr data-testid="separator" />,
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return { ChevronDown: Icon, Check: Icon };
});

import AgentSelector from '@/components/ai/AgentSelector';

describe('AgentSelector', () => {
  it('renders the selected agent short name', () => {
    render(<AgentSelector selectedAgent="recruitment" onSelect={() => {}} />);
    expect(screen.getAllByText('Recruitment').length).toBeGreaterThanOrEqual(1);
  });

  it('falls back to the general agent for an unknown id', () => {
    render(<AgentSelector selectedAgent={'nope' as any} onSelect={() => {}} />);
    expect(screen.getAllByText('General').length).toBeGreaterThanOrEqual(1);
  });

  it('renders every agent as a menu item', () => {
    render(<AgentSelector selectedAgent="policy" onSelect={() => {}} />);
    const items = screen.getAllByTestId('menu-item');
    expect(items.length).toBe(5);
  });

  it('calls onSelect when a menu item is clicked', () => {
    const onSelect = jest.fn();
    render(<AgentSelector selectedAgent="policy" onSelect={onSelect} />);
    const items = screen.getAllByTestId('menu-item');
    // Find the analytics item and click it
    fireEvent.click(items.find((i) => i.textContent?.includes('Analytics'))!);
    expect(onSelect).toHaveBeenCalledWith('analytics');
  });

  it('disables the trigger button when disabled is true', () => {
    render(<AgentSelector selectedAgent="general" onSelect={() => {}} disabled />);
    // Menu items are also rendered as buttons — find the only disabled one
    const disabledButtons = screen.getAllByRole('button').filter((b) => b.hasAttribute('disabled'));
    expect(disabledButtons).toHaveLength(1);
  });

  it('shows a color dot for non-general agents', () => {
    const { container } = render(<AgentSelector selectedAgent="kpi" onSelect={() => {}} />);
    expect(container.querySelector('[style*="background-color"]')).toBeInTheDocument();
  });
});
