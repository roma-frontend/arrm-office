/**
 * Tests for CustomSelect — portal-based dropdown with above/below positioning,
 * click-outside close, disabled options, full-width mode and resize/scroll
 * listener lifecycle.
 *
 * Mocks: lucide-react (ChevronDown).
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('lucide-react', () => ({
  ChevronDown: (props: any) => <span data-testid="icon-ChevronDown" {...props} />,
}));

import { CustomSelect } from '@/components/ui/CustomSelect';

const OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Russian' },
  { value: 'hy', label: 'Armenian', disabled: true },
];

const rect = (overrides: Record<string, unknown> = {}): any => ({
  left: 100,
  top: 100,
  right: 300,
  bottom: 140,
  width: 200,
  height: 40,
  x: 100,
  y: 100,
  toJSON: () => ({}),
  ...overrides,
});

describe('CustomSelect', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the label of the selected value', () => {
    render(<CustomSelect value="en" onChange={() => {}} options={OPTIONS} />);
    expect(screen.getByText('English')).toBeInTheDocument();
  });

  it('falls back to the placeholder when the value has no matching option', () => {
    render(
      <CustomSelect
        value="xx"
        onChange={() => {}}
        options={OPTIONS}
        placeholder="Pick a language"
      />,
    );
    expect(screen.getByText('Pick a language')).toBeInTheDocument();
  });

  it('renders an empty trigger when nothing matches and no placeholder is set', () => {
    render(<CustomSelect value="xx" onChange={() => {}} options={OPTIONS} />);
    expect(screen.getByRole('button').textContent).toBe('');
  });

  it('opens the dropdown in a portal and lists all options', () => {
    render(<CustomSelect value="en" onChange={() => {}} options={OPTIONS} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Russian')).toBeInTheDocument();
    expect(screen.getByText('Armenian')).toBeInTheDocument();
    // trigger + 3 options
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });

  it('selects an option: calls onChange and closes', () => {
    const onChange = jest.fn();
    render(<CustomSelect value="en" onChange={onChange} options={OPTIONS} />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('Russian'));
    expect(onChange).toHaveBeenCalledWith('ru');
    expect(screen.queryByText('Armenian')).not.toBeInTheDocument();
  });

  it('does not call onChange for a disabled option', () => {
    const onChange = jest.fn();
    render(<CustomSelect value="en" onChange={onChange} options={OPTIONS} />);
    fireEvent.click(screen.getByRole('button'));
    const disabledBtn = screen.getByText('Armenian').closest('button') as HTMLButtonElement;
    expect(disabledBtn.disabled).toBe(true);
    fireEvent.click(disabledBtn);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('Russian')).toBeInTheDocument(); // still open
  });

  it('does not open when disabled', () => {
    render(<CustomSelect value="en" onChange={() => {}} options={OPTIONS} disabled />);
    const trigger = screen.getByRole('button') as HTMLButtonElement;
    expect(trigger.disabled).toBe(true);
    fireEvent.click(trigger);
    expect(screen.queryByText('Russian')).not.toBeInTheDocument();
  });

  it('closes when clicking outside the dropdown', () => {
    render(<CustomSelect value="en" onChange={() => {}} options={OPTIONS} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Russian')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText('Russian')).not.toBeInTheDocument();
  });

  it('stays open when clicking inside the dropdown', () => {
    render(<CustomSelect value="en" onChange={() => {}} options={OPTIONS} />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.mouseDown(screen.getByText('Russian'));
    expect(screen.getByText('Russian')).toBeInTheDocument();
  });

  it('positions the dropdown below the trigger when there is room', () => {
    render(<CustomSelect value="en" onChange={() => {}} options={OPTIONS} />);
    const trigger = screen.getByRole('button');
    jest.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(rect());
    fireEvent.click(trigger);
    const dropdown = screen.getByText('Russian').closest('div[style]') as HTMLElement;
    // rect.bottom (140) + 4
    expect(dropdown.style.top).toBe('144px');
  });

  it('positions the dropdown above the trigger when space below is tight', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
    render(<CustomSelect value="en" onChange={() => {}} options={OPTIONS} />);
    const trigger = screen.getByRole('button');
    jest.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(rect({ top: 100, bottom: 760 }));
    fireEvent.click(trigger);
    const dropdown = screen.getByText('Russian').closest('div[style]') as HTMLElement;
    // innerHeight (768) - rect.top (100) + 4
    expect(dropdown.style.bottom).toBe('672px');
    expect(dropdown.style.top).toBe('');
  });

  it('adds and removes resize and scroll listeners while open', () => {
    const addSpy = jest.spyOn(window, 'addEventListener');
    const removeSpy = jest.spyOn(window, 'removeEventListener');
    const { unmount } = render(<CustomSelect value="en" onChange={() => {}} options={OPTIONS} />);
    fireEvent.click(screen.getByRole('button'));
    expect(addSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('scroll', expect.any(Function), true);
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('scroll', expect.any(Function), true);
  });

  it('stops pointerdown propagation inside the dropdown (capture phase)', () => {
    const docAddSpy = jest.spyOn(document, 'addEventListener');
    const docRemoveSpy = jest.spyOn(document, 'removeEventListener');
    const { unmount } = render(<CustomSelect value="en" onChange={() => {}} options={OPTIONS} />);
    fireEvent.click(screen.getByRole('button'));
    expect(docAddSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function), true);
    unmount();
    expect(docRemoveSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function), true);
  });

  it('keeps the dropdown open when a pointerdown lands inside it', () => {
    render(<CustomSelect value="en" onChange={() => {}} options={OPTIONS} />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.pointerDown(screen.getByText('Russian'));
    expect(screen.getByText('Russian')).toBeInTheDocument();
  });

  it('highlights a hovered option on mouse enter and resets on leave', () => {
    render(<CustomSelect value="en" onChange={() => {}} options={OPTIONS} />);
    fireEvent.click(screen.getByRole('button'));

    const option = screen.getByText('Russian') as HTMLElement;
    fireEvent.mouseEnter(option);
    expect(option.style.background).toBe('var(--landing-card-border, #e5e7eb)');
    fireEvent.mouseLeave(option);
    expect(option.style.background).toBe('transparent');
  });

  it('does not recolor the selected or disabled options on hover', () => {
    render(<CustomSelect value="en" onChange={() => {}} options={OPTIONS} />);
    fireEvent.click(screen.getByRole('button'));

    // the trigger label also says 'English' — pick the option inside the portal
    // the selected option keeps its inline primary background — hover must not change it.
    // The trigger label also says 'English'; the portal option is the one that is
    // not the trigger (i.e. it has the inline-styled dropdown ancestor).
    const selected = screen
      .getAllByRole('button', { name: 'English' })
      .find((el) => el.closest('div[style]')) as HTMLButtonElement;
    expect(selected.style.background).toBe('var(--primary)');
    fireEvent.mouseEnter(selected);
    expect(selected.style.background).toBe('var(--primary)');
    fireEvent.mouseLeave(selected);
    expect(selected.style.background).toBe('var(--primary)');

    const disabled = screen.getByText('Armenian') as HTMLElement;
    expect(disabled.style.background).toBe('transparent');
    fireEvent.mouseEnter(disabled);
    expect(disabled.style.background).toBe('transparent');
  });

  it('applies fullWidth and rotates the chevron when open', () => {
    render(<CustomSelect value="en" onChange={() => {}} options={OPTIONS} fullWidth />);
    const wrapper = screen.getByRole('button').parentElement as HTMLElement;
    expect(wrapper.className).toContain('w-full');

    const chevron = screen.getByTestId('icon-ChevronDown');
    expect(chevron.className).not.toContain('rotate-180');
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByTestId('icon-ChevronDown').className).toContain('rotate-180');
  });
});
