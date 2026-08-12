/**
 * Tests for PasswordStrengthIndicator — password strength bar, feedback
 * messages, requirements checklist and smart suggestions.
 *
 * Mocks: validatePassword/getStrengthColor from @/lib/passwordValidation
 * (controllable), cssMotion, lucide icons, i18n.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';

const validatePasswordMock = jest.fn();
const getStrengthColorMock = jest.fn().mockReturnValue('#ef4444');
jest.mock('@/lib/passwordValidation', () => ({
  validatePassword: (...args: unknown[]) => validatePasswordMock(...args),
  getStrengthColor: (...args: unknown[]) => getStrengthColorMock(...args),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
  }),
}));

jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, animate, ...props }: any) => (
      <div data-animate={animate ? JSON.stringify(animate) : undefined} {...props}>
        {children}
      </div>
    ),
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
    li: ({ children, ...props }: any) => <li {...props}>{children}</li>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return { Check: Icon, Sparkles: Icon };
});

import { PasswordStrengthIndicator } from '@/components/auth/PasswordStrengthIndicator';

const baseValidation = {
  strength: 'weak' as const,
  score: 30,
  feedback: [] as { type: string; icon: string; message: string }[],
  requirements: [] as { id: string; label: string; met: boolean; required: boolean }[],
  suggestions: [] as string[],
};

describe('PasswordStrengthIndicator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getStrengthColorMock.mockReturnValue('#ef4444');
    validatePasswordMock.mockReturnValue({ ...baseValidation });
  });

  it('renders nothing for an empty password', () => {
    const { container } = render(<PasswordStrengthIndicator password="" />);
    expect(container).toBeEmptyDOMElement();
    // validatePassword runs before the empty check, but nothing is rendered.
    expect(validatePasswordMock).toHaveBeenCalledWith('', expect.any(Function));
  });

  it('renders the strength label and percentage width', () => {
    validatePasswordMock.mockReturnValue({
      ...baseValidation,
      strength: 'strong',
      score: 80,
    });
    getStrengthColorMock.mockReturnValue('#22c55e');
    render(<PasswordStrengthIndicator password="abcdefgh" />);
    expect(screen.getByText('Надежность пароля')).toBeInTheDocument();
    expect(screen.getByText('Надежный')).toBeInTheDocument();
    const bar = document.querySelector('.h-full');
    // The animated width lives in the motion `animate` prop (mapped to a data
    // attribute by the mock) and the color in the style attribute.
    expect(bar?.getAttribute('data-animate')).toContain('80%');
    expect(bar?.getAttribute('style')).toContain('rgb(34, 197, 94)');
  });

  it('renders feedback messages with success and error types', () => {
    validatePasswordMock.mockReturnValue({
      ...baseValidation,
      feedback: [
        { type: 'success', icon: '✓', message: 'Contains a number' },
        { type: 'error', icon: '✗', message: 'Too short' },
      ],
    });
    render(<PasswordStrengthIndicator password="abc" />);
    expect(screen.getByText('Contains a number')).toBeInTheDocument();
    expect(screen.getByText('Too short')).toBeInTheDocument();
  });

  it('renders feedback messages with warning and info types', () => {
    validatePasswordMock.mockReturnValue({
      ...baseValidation,
      feedback: [
        { type: 'warning', icon: '!', message: 'Common password' },
        { type: 'info', icon: 'i', message: 'Consider adding symbols' },
      ],
    });
    render(<PasswordStrengthIndicator password="abc" />);
    expect(screen.getByText('Common password')).toBeInTheDocument();
    expect(screen.getByText('Consider adding symbols')).toBeInTheDocument();
  });

  it('renders the requirements checklist with met and unmet states', () => {
    validatePasswordMock.mockReturnValue({
      ...baseValidation,
      requirements: [
        { id: 'len', label: '8+ characters', met: true, required: true },
        { id: 'num', label: 'Number', met: false, required: true },
        { id: 'opt', label: 'Special char', met: false, required: false },
      ],
    });
    render(<PasswordStrengthIndicator password="abcdefgh" />);
    expect(screen.getByText('8+ characters')).toBeInTheDocument();
    expect(screen.getByText('Number')).toBeInTheDocument();
    expect(screen.getByText('Special char')).toBeInTheDocument();
    // Required marker on required items.
    expect(screen.getAllByText('*').length).toBe(2);
  });

  it('hides the requirements checklist when showRequirements is false', () => {
    validatePasswordMock.mockReturnValue({
      ...baseValidation,
      requirements: [{ id: 'len', label: '8+ characters', met: false, required: true }],
    });
    render(<PasswordStrengthIndicator password="abc" showRequirements={false} />);
    expect(screen.queryByText('8+ characters')).toBeNull();
  });

  it('renders smart suggestions', () => {
    validatePasswordMock.mockReturnValue({
      ...baseValidation,
      suggestions: ['Add uppercase letters', 'Add a number'],
    });
    render(<PasswordStrengthIndicator password="abc" />);
    expect(screen.getByText('Рекомендации:')).toBeInTheDocument();
    expect(screen.getByText('Add uppercase letters')).toBeInTheDocument();
    expect(screen.getByText('Add a number')).toBeInTheDocument();
  });

  it('hides suggestions when showSuggestions is false', () => {
    validatePasswordMock.mockReturnValue({
      ...baseValidation,
      suggestions: ['Add uppercase letters'],
    });
    render(<PasswordStrengthIndicator password="abc" showSuggestions={false} />);
    expect(screen.queryByText('Add uppercase letters')).toBeNull();
  });

  it('passes a working translate adapter to validatePassword', () => {
    render(<PasswordStrengthIndicator password="abc" />);
    const translate = validatePasswordMock.mock.calls[0]?.[1] as (
      key: string,
      defaultValue?: string,
    ) => string;
    expect(typeof translate).toBe('function');
    // With a default value → the fallback is used; without → the key itself.
    expect(translate('key', 'fallback')).toBe('fallback');
    expect(translate('key2')).toBe('key2');
  });
});
