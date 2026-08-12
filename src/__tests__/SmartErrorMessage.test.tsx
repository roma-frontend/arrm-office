/**
 * Tests for SmartErrorMessage — animated error alert with suggestions and
 * actions, plus the parseAuthError API-error-to-message parser.
 *
 * Mocks: cssMotion, lucide icons. parseAuthError is covered exhaustively
 * across all error categories including the org-frozen reason extraction.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    p: ({ children, ...props }: any) => <p {...props}>{children}</p>,
    button: ({ children, onClick, ...props }: any) => (
      <button onClick={onClick} {...props}>
        {children}
      </button>
    ),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return {
    AlertCircle: Icon,
    Info: Icon,
    CheckCircle: Icon,
    XCircle: Icon,
    Lightbulb: Icon,
    ArrowRight: Icon,
  };
});

import {
  SmartErrorMessage,
  parseAuthError,
  type SmartError,
} from '@/components/auth/SmartErrorMessage';

const stringToType = (error: SmartError) => error.type;

describe('SmartErrorMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when error is null', () => {
    const { container } = render(<SmartErrorMessage error={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('converts a plain string to an error object', () => {
    render(<SmartErrorMessage error="Something went wrong" />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders the message for an error object', () => {
    render(<SmartErrorMessage error={{ type: 'error', message: 'Boom' }} />);
    expect(screen.getByText('Boom')).toBeInTheDocument();
  });

  it('renders all four type variants', () => {
    const { rerender } = render(<SmartErrorMessage error={{ type: 'error', message: 'E' }} />);
    expect(screen.getByText('E')).toBeInTheDocument();
    rerender(<SmartErrorMessage error={{ type: 'warning', message: 'W' }} />);
    expect(screen.getByText('W')).toBeInTheDocument();
    rerender(<SmartErrorMessage error={{ type: 'info', message: 'I' }} />);
    expect(screen.getByText('I')).toBeInTheDocument();
    rerender(<SmartErrorMessage error={{ type: 'success', message: 'S' }} />);
    expect(screen.getByText('S')).toBeInTheDocument();
  });

  it('renders the suggestion when present', () => {
    render(
      <SmartErrorMessage error={{ type: 'warning', message: 'M', suggestion: 'Try again' }} />,
    );
    expect(screen.getByText('Try again')).toBeInTheDocument();
  });

  it('omits the suggestion when absent', () => {
    render(<SmartErrorMessage error={{ type: 'error', message: 'M' }} />);
    expect(screen.queryByText('Try again')).toBeNull();
  });

  it('invokes the action onClick and renders its label', () => {
    const onClick = jest.fn();
    render(
      <SmartErrorMessage
        error={{ type: 'error', message: 'M', action: { label: 'Fix it', onClick } }}
      />,
    );
    fireEvent.click(screen.getByText('Fix it'));
    expect(onClick).toHaveBeenCalled();
  });

  it('omits the action button when absent', () => {
    render(<SmartErrorMessage error={{ type: 'error', message: 'M' }} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('applies the className to the container', () => {
    const { container } = render(
      <SmartErrorMessage error={{ type: 'error', message: 'M' }} className="extra-class" />,
    );
    expect(container.querySelector('.extra-class')).toBeTruthy();
  });
});

describe('parseAuthError', () => {
  it('maps an org-frozen error with a reason after the pipe', () => {
    const error = parseAuthError('Organization is org_frozen | Billing overdue');
    expect(stringToType(error)).toBe('warning');
    expect(error.message).toContain('Работа организации временно приостановлена');
    expect(error.message).toContain('Billing overdue');
  });

  it('maps an org-frozen error without a reason', () => {
    const error = parseAuthError('org_frozen');
    expect(stringToType(error)).toBe('warning');
    expect(error.message).not.toContain(':');
  });

  it('maps invalid credentials', () => {
    const error = parseAuthError('Invalid credentials');
    expect(stringToType(error)).toBe('error');
    expect(error.action?.label).toBe('Забыли пароль?');
    // Invoke the redirect action (jsdom logs "not implemented" navigation but
    // the statement still executes, covering the redirect line).
    expect(() => error.action?.onClick?.()).not.toThrow();
  });

  it('maps wrong password', () => {
    expect(stringToType(parseAuthError('wrong password'))).toBe('error');
  });

  it('maps incorrect password', () => {
    expect(stringToType(parseAuthError('incorrect password given'))).toBe('error');
  });

  it('maps user not found', () => {
    const error = parseAuthError('User not found');
    expect(stringToType(error)).toBe('error');
    expect(error.action?.label).toBe('Создать аккаунт');
    expect(() => error.action?.onClick?.()).not.toThrow();
  });

  it('maps no user', () => {
    expect(stringToType(parseAuthError('no user exists'))).toBe('error');
  });

  it('maps does not exist', () => {
    expect(stringToType(parseAuthError('account does not exist'))).toBe('error');
  });

  it('maps email already exists', () => {
    const error = parseAuthError('Email already exists');
    expect(stringToType(error)).toBe('error');
    expect(error.action?.label).toBe('Перейти к входу');
    expect(() => error.action?.onClick?.()).not.toThrow();
  });

  it('maps already registered', () => {
    expect(stringToType(parseAuthError('already registered'))).toBe('error');
  });

  it('maps email taken', () => {
    expect(stringToType(parseAuthError('email taken'))).toBe('error');
  });

  it('maps weak password', () => {
    const error = parseAuthError('Weak password');
    expect(stringToType(error)).toBe('warning');
  });

  it('maps password too short', () => {
    expect(stringToType(parseAuthError('password too short'))).toBe('warning');
  });

  it('maps password must be', () => {
    expect(stringToType(parseAuthError('password must be longer'))).toBe('warning');
  });

  it('maps network errors', () => {
    const error = parseAuthError('Network request failed');
    expect(stringToType(error)).toBe('warning');
    expect(error.message).toContain('Проблема с подключением');
  });

  it('maps fetch errors', () => {
    expect(stringToType(parseAuthError('fetch error'))).toBe('warning');
  });

  it('maps connection errors', () => {
    expect(stringToType(parseAuthError('connection lost'))).toBe('warning');
  });

  it('maps 500 server errors', () => {
    const error = parseAuthError('HTTP 500');
    expect(stringToType(error)).toBe('error');
    expect(error.message).toContain('Ошибка сервера');
  });

  it('maps server error', () => {
    expect(stringToType(parseAuthError('server error'))).toBe('error');
  });

  it('maps internal error', () => {
    expect(stringToType(parseAuthError('internal error'))).toBe('error');
  });

  it('maps too many attempts', () => {
    const error = parseAuthError('Too many attempts');
    expect(stringToType(error)).toBe('warning');
    expect(error.message).toContain('Слишком много попыток');
  });

  it('maps rate limit', () => {
    expect(stringToType(parseAuthError('rate limit exceeded'))).toBe('warning');
  });

  it('maps blocked as too many attempts (blocked matches earlier)', () => {
    const error = parseAuthError('You are blocked');
    expect(stringToType(error)).toBe('warning');
  });

  it('maps suspended accounts', () => {
    const error = parseAuthError('Account suspended');
    expect(stringToType(error)).toBe('error');
    expect(error.message).toContain('Аккаунт заблокирован');
  });

  it('maps disabled accounts', () => {
    expect(stringToType(parseAuthError('account disabled'))).toBe('error');
  });

  it('maps verify email errors', () => {
    const error = parseAuthError('Please verify your email');
    expect(stringToType(error)).toBe('warning');
    expect(error.message).toContain('Email не подтвержден');
  });

  it('maps not verified', () => {
    expect(stringToType(parseAuthError('email not verified'))).toBe('warning');
  });

  it('maps confirm email', () => {
    expect(stringToType(parseAuthError('confirm email first'))).toBe('warning');
  });

  it('maps session expired', () => {
    const error = parseAuthError('Session expired');
    expect(stringToType(error)).toBe('info');
    expect(error.message).toContain('Сессия истекла');
  });

  it('maps timeout', () => {
    expect(stringToType(parseAuthError('timeout occurred'))).toBe('info');
  });

  it('falls back to the default for unknown errors', () => {
    const error = parseAuthError('Something weird');
    expect(stringToType(error)).toBe('error');
    expect(error.message).toBe('Something weird');
  });

  it('falls back to a generic message for an empty error', () => {
    const error = parseAuthError('');
    expect(stringToType(error)).toBe('error');
    expect(error.message).toBe('Произошла ошибка');
  });
});
