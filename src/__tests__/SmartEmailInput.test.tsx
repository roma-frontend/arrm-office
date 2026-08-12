/**
 * Tests for SmartEmailInput — email input with debounced validation,
 * status icons, feedback messages and typo suggestions.
 *
 * Mocks: validateEmail from @/lib/passwordValidation (controllable result),
 * cssMotion, UI primitives (Input/Label), lucide icons. Fake timers drive the
 * 300 ms validation debounce. A controlled Wrapper mirrors how a real parent
 * updates `value` via onChange so the debounce effect re-runs.
 */

import React, { useState } from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, act } from '@testing-library/react';

const validateEmailMock = jest.fn();
jest.mock('@/lib/passwordValidation', () => ({
  validateEmail: (...args: unknown[]) => validateEmailMock(...args),
}));

jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, onClick, ...props }: any) => (
      <button onClick={onClick} {...props}>
        {children}
      </button>
    ),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

jest.mock('@/components/ui/label', () => ({
  Label: ({ children, htmlFor }: any) => <label htmlFor={htmlFor}>{children}</label>,
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return { Mail: Icon, Check: Icon, AlertCircle: Icon, Sparkles: Icon };
});

import { SmartEmailInput } from '@/components/auth/SmartEmailInput';

const Wrapper = ({ onChange, ...rest }: any) => {
  const [value, setValue] = useState('');
  return (
    <SmartEmailInput
      value={value}
      onChange={(v) => {
        onChange(v);
        setValue(v);
      }}
      {...rest}
    />
  );
};

const renderInput = (props: Partial<React.ComponentProps<typeof SmartEmailInput>> = {}) => {
  const onChange = jest.fn();
  const utils = render(<Wrapper onChange={onChange} {...props} />);
  return { ...utils, onChange };
};

const type = (input: HTMLElement, value: string) => {
  fireEvent.change(input, { target: { value } });
  // Advance past the 300 ms debounce (with margin to avoid boundary drift).
  act(() => {
    jest.advanceTimersByTime(400);
  });
};

describe('SmartEmailInput', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    validateEmailMock.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the label, required marker and email input', () => {
    const { onChange } = renderInput({ label: 'Work email', placeholder: 'a@b.com' });
    expect(screen.getByText('Work email')).toBeInTheDocument();
    expect(screen.getByText('*')).toBeInTheDocument();
    expect(screen.getByLabelText(/Work email/)).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText(/Work email/)).toHaveAttribute('placeholder', 'a@b.com');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('omits the required marker when required is false', () => {
    renderInput({ label: 'Email', required: false });
    expect(screen.queryByText('*')).toBeNull();
  });

  it('auto-focuses the input when autoFocus is set', () => {
    renderInput({ autoFocus: true });
    expect(screen.getByLabelText(/Email/)).toHaveFocus();
  });

  it('does not validate an empty value', () => {
    renderInput();
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(validateEmailMock).not.toHaveBeenCalled();
  });

  it('validates a value after the debounce and shows a valid state', () => {
    validateEmailMock.mockReturnValue({
      isValid: true,
      feedback: { type: 'success', message: 'Looks good' },
    });
    const { onChange } = renderInput();
    type(screen.getByLabelText(/Email/), 'a@b.com');
    // The component passes the translator as the second arg for localized messages.
    expect(validateEmailMock).toHaveBeenCalledWith('a@b.com', expect.any(Function));
    expect(onChange).toHaveBeenCalledWith('a@b.com');
    expect(screen.getByText('Looks good')).toBeInTheDocument();
  });

  it('shows an error feedback and red border for an invalid email', () => {
    validateEmailMock.mockReturnValue({
      isValid: false,
      feedback: { type: 'error', message: 'Bad format' },
      suggestion: 'user@example.com',
    });
    renderInput();
    const input = screen.getByLabelText(/Email/);
    type(input, 'bad');
    expect(screen.getByText('Bad format')).toBeInTheDocument();
    expect(input.className).toContain('border-red-500');
    expect(screen.getByText('user@example.com')).toBeInTheDocument();
  });

  it('shows a warning feedback style', () => {
    validateEmailMock.mockReturnValue({
      isValid: false,
      feedback: { type: 'warning', message: 'Heads up' },
    });
    renderInput();
    type(screen.getByLabelText(/Email/), 'x@');
    expect(screen.getByText('Heads up')).toBeInTheDocument();
  });

  it('shows an info feedback style', () => {
    validateEmailMock.mockReturnValue({
      isValid: false,
      feedback: { type: 'info', message: 'Info note' },
    });
    renderInput();
    type(screen.getByLabelText(/Email/), 'x@');
    expect(screen.getByText('Info note')).toBeInTheDocument();
  });

  it('applies the success border only for a valid value', () => {
    validateEmailMock.mockReturnValue({
      isValid: true,
      feedback: { type: 'success', message: 'OK' },
    });
    renderInput();
    const input = screen.getByLabelText(/Email/);
    type(input, 'a@b.com');
    expect(input.className).toContain('border-green-500');
  });

  it('applies the red border for an invalid value without feedback', () => {
    validateEmailMock.mockReturnValue({ isValid: false });
    renderInput();
    const input = screen.getByLabelText(/Email/);
    type(input, 'x');
    expect(input.className).toContain('border-red-500');
    expect(input.className).not.toContain('border-green-500');
  });

  it('applies the suggestion on click and clears it', () => {
    validateEmailMock.mockReturnValue({
      isValid: false,
      feedback: { type: 'error', message: 'Typo' },
      suggestion: 'user@gmail.com',
    });
    const { onChange } = renderInput();
    type(screen.getByLabelText(/Email/), 'user@gmial.com');
    fireEvent.click(screen.getByText('user@gmail.com'));
    expect(onChange).toHaveBeenCalledWith('user@gmail.com');
    // Suggestion is dismissed immediately. NB: applying changes the value, which
    // schedules a fresh debounce that would re-validate against the mock — so
    // this assertion is valid only for the immediate post-click state.
    expect(screen.queryByText('user@gmail.com')).toBeNull();
  });

  it('clears validation and the suggestion when the field is emptied', () => {
    validateEmailMock.mockReturnValue({
      isValid: false,
      feedback: { type: 'error', message: 'Bad format' },
      suggestion: 'user@example.com',
    });
    renderInput();
    const input = screen.getByLabelText(/Email/);
    type(input, 'bad');
    expect(screen.getByText('Bad format')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.queryByText('Bad format')).toBeNull();
    expect(screen.queryByText('user@example.com')).toBeNull();
    expect(validateEmailMock).toHaveBeenCalledTimes(1);
  });

  it('cleans up the debounce timer on unmount', () => {
    validateEmailMock.mockReturnValue({
      isValid: false,
      feedback: { type: 'error', message: 'x' },
    });
    const { unmount } = renderInput();
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'a@b' } });
    unmount();
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(validateEmailMock).not.toHaveBeenCalled();
  });
});
