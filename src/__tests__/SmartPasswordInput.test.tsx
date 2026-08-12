/**
 * Tests for SmartPasswordInput — password field with show/hide toggle,
 * copy-to-clipboard, secure-password generator and strength indicator.
 *
 * Mocks: generateSecurePassword from @/lib/passwordValidation,
 * PasswordStrengthIndicator, cssMotion, UI primitives (Input/Label),
 * navigator.clipboard, lucide icons. Fake timers drive the 2 s copied reset.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

const generatePasswordMock = jest.fn().mockReturnValue('Gen123!@#');
jest.mock('@/lib/passwordValidation', () => ({
  generateSecurePassword: (...args: unknown[]) => generatePasswordMock(...args),
}));

jest.mock('@/components/auth/PasswordStrengthIndicator', () => ({
  PasswordStrengthIndicator: ({ password }: any) => (
    <div data-testid="strength" data-password={password} />
  ),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
  }),
}));

jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, onClick, ...props }: any) => (
      <button onClick={onClick} type="button" {...props}>
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
  return { Eye: Icon, EyeOff: Icon, Lock: Icon, Copy: Icon, RefreshCw: Icon };
});

import { SmartPasswordInput } from '@/components/auth/SmartPasswordInput';

const writeTextMock = jest.fn().mockResolvedValue(undefined);

const renderInput = (props: Partial<React.ComponentProps<typeof SmartPasswordInput>> = {}) => {
  const onChange = jest.fn();
  const utils = render(<SmartPasswordInput value="" onChange={onChange} {...props} />);
  return { ...utils, onChange };
};

describe('SmartPasswordInput', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    generatePasswordMock.mockReturnValue('Gen123!@#');
    writeTextMock.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    // Restore so other suites don't see the stubbed clipboard.
    delete (navigator as Record<string, unknown>).clipboard;
  });

  it('renders the input as password type with the required marker', () => {
    const { onChange } = renderInput({ label: 'Password' });
    expect(screen.getByText('Password')).toBeInTheDocument();
    expect(screen.getByText('*')).toBeInTheDocument();
    const input = screen.getByLabelText(/Password/);
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveAttribute('placeholder', '••••••••');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('falls back to the localized label when none is supplied', () => {
    renderInput();
    expect(screen.getByText('Пароль')).toBeInTheDocument();
  });

  it('omits the required marker when required is false', () => {
    renderInput({ label: 'Password', required: false });
    expect(screen.queryByText('*')).toBeNull();
  });

  it('toggles the password visibility', () => {
    const { onChange } = renderInput({ label: 'Password', value: 'secret' });
    const input = screen.getByLabelText(/Password/);
    expect(input).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByTitle('Показать пароль'));
    expect(input).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByTitle('Скрыть пароль'));
    expect(input).toHaveAttribute('type', 'password');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('forwards input changes to onChange', () => {
    const { onChange } = renderInput({ label: 'Password' });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'abc' } });
    expect(onChange).toHaveBeenCalledWith('abc');
  });

  it('copies the password and shows the copied state for 2 seconds', async () => {
    renderInput({ label: 'Password', value: 'secret' });
    fireEvent.click(screen.getByTitle('Копировать пароль'));
    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith('secret');
    });
    // The copied flag is set after the awaited clipboard write flushes.
    await waitFor(() => {
      expect(screen.getByText('Пароль скопирован в буфер обмена!')).toBeInTheDocument();
    });
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.queryByText('Пароль скопирован в буфер обмена!')).toBeNull();
  });

  it('does nothing when copying an empty password', async () => {
    renderInput({ label: 'Password' });
    expect(screen.queryByTitle('Копировать пароль')).toBeNull();
    await act(async () => {});
    expect(writeTextMock).not.toHaveBeenCalled();
  });

  it('generates a secure password, applies it and copies it', async () => {
    const { onChange } = renderInput({ label: 'Password', showGenerator: true });
    fireEvent.click(screen.getByText('Сгенерировать'));
    expect(generatePasswordMock).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith('Gen123!@#');
    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith('Gen123!@#');
    });
    // Input switched to visible after generation.
    expect(screen.getByLabelText(/Password/)).toHaveAttribute('type', 'text');
    expect(screen.getByText('Пароль скопирован в буфер обмена!')).toBeInTheDocument();
    // The auto-copied state resets after 2 s.
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.queryByText('Пароль скопирован в буфер обмена!')).toBeNull();
  });

  it('hides the generator when forgotPasswordLink is present', () => {
    renderInput({
      label: 'Password',
      showGenerator: true,
      forgotPasswordLink: <a href="/forgot">Forgot?</a>,
    });
    expect(screen.getByText('Forgot?')).toBeInTheDocument();
    expect(screen.queryByText('Сгенерировать')).toBeNull();
  });

  it('hides the generator when showGenerator is false', () => {
    renderInput({ label: 'Password' });
    expect(screen.queryByText('Сгенерировать')).toBeNull();
  });

  it('shows the strength indicator only when showStrength and a value are present', () => {
    renderInput({ label: 'Password', showStrength: true, value: 'abc' });
    expect(screen.getByTestId('strength')).toHaveAttribute('data-password', 'abc');
  });

  it('hides the strength indicator when showStrength is false', () => {
    renderInput({ label: 'Password', showStrength: false, value: 'abc' });
    expect(screen.queryByTestId('strength')).toBeNull();
  });

  it('hides the strength indicator when the value is empty', () => {
    renderInput({ label: 'Password', showStrength: true });
    expect(screen.queryByTestId('strength')).toBeNull();
  });

  it('auto-focuses the input when autoFocus is set', () => {
    renderInput({ label: 'Password', autoFocus: true });
    expect(screen.getByLabelText(/Password/)).toHaveFocus();
  });
});
