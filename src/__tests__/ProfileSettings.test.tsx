/**
 * Tests for ProfileSettings — the profile edit card.
 *
 * Mocks: react-i18next fallback-t, ui primitives (card, input, label),
 * AvatarUpload stub, sonner toast.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => (typeof fallback === 'string' ? fallback : key),
  }),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <h2>{children}</h2>,
  CardDescription: ({ children }: any) => <p>{children}</p>,
  CardContent: ({ children, className }: any) => <div className={className}>{children}</div>,
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

jest.mock('@/components/ui/label', () => ({
  Label: ({ children, htmlFor }: any) => <label htmlFor={htmlFor}>{children}</label>,
}));

const mockAvatarSuccess = jest.fn();
jest.mock('@/components/ui/avatar-upload', () => ({
  AvatarUpload: ({ userId, currentUrl, name, size, onSuccess }: any) => {
    mockAvatarSuccess.mockImplementation(onSuccess);
    return (
      <button
        type="button"
        data-testid="avatar-upload"
        data-user={userId}
        data-url={currentUrl ?? ''}
        data-name={name}
        data-size={size}
        onClick={onSuccess}
      >
        Upload
      </button>
    );
  },
}));

const mockToast = { success: jest.fn() };
jest.mock('sonner', () => ({
  toast: mockToast,
}));

jest.mock('lucide-react', () => ({
  Shield: (props: any) => <span data-testid="icon-shield" {...props} />,
}));

import { ProfileSettings } from '@/components/settings/ProfileSettings';

const USER = {
  id: 'u1',
  name: 'Alice',
  email: 'a@b.com',
  role: 'admin',
  department: 'Engineering',
  avatar: 'https://example.com/a.png',
};

describe('ProfileSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the profile information header', () => {
    render(
      <ProfileSettings
        user={USER as never}
        onNameChange={jest.fn()}
        onEmailChange={jest.fn()}
        name="Alice"
        email="a@b.com"
      />,
    );
    expect(screen.getByText('settingsProfile.profileInformation')).toBeInTheDocument();
    expect(screen.getByText('settingsProfile.updateDetails')).toBeInTheDocument();
  });

  it('renders name and email inputs with current values', () => {
    render(
      <ProfileSettings
        user={USER as never}
        onNameChange={jest.fn()}
        onEmailChange={jest.fn()}
        name="Alice"
        email="a@b.com"
      />,
    );
    const name = screen.getByLabelText('labels.fullName') as HTMLInputElement;
    const email = screen.getByLabelText('labels.emailAddress') as HTMLInputElement;
    expect(name.value).toBe('Alice');
    expect(email.value).toBe('a@b.com');
  });

  it('calls onNameChange and onEmailChange on input', () => {
    const onName = jest.fn();
    const onEmail = jest.fn();
    render(
      <ProfileSettings
        user={USER as never}
        onNameChange={onName}
        onEmailChange={onEmail}
        name="Alice"
        email="a@b.com"
      />,
    );
    fireEvent.change(screen.getByLabelText('labels.fullName'), { target: { value: 'Alicia' } });
    fireEvent.change(screen.getByLabelText('labels.emailAddress'), {
      target: { value: 'x@y.com' },
    });
    expect(onName).toHaveBeenCalledWith('Alicia');
    expect(onEmail).toHaveBeenCalledWith('x@y.com');
  });

  it('renders disabled role and department fields from the user', () => {
    render(
      <ProfileSettings
        user={USER as never}
        onNameChange={jest.fn()}
        onEmailChange={jest.fn()}
        name="Alice"
        email="a@b.com"
      />,
    );
    const role = screen.getByLabelText('labels.role') as HTMLInputElement;
    const dept = screen.getByLabelText('labels.department') as HTMLInputElement;
    expect(role.value).toBe('admin');
    expect(role.disabled).toBe(true);
    expect(dept.value).toBe('Engineering');
    expect(dept.disabled).toBe(true);
  });

  it('renders the avatar upload with user props', () => {
    render(
      <ProfileSettings
        user={USER as never}
        onNameChange={jest.fn()}
        onEmailChange={jest.fn()}
        name="Alice"
        email="a@b.com"
      />,
    );
    const upload = screen.getByTestId('avatar-upload');
    expect(upload.getAttribute('data-user')).toBe('u1');
    expect(upload.getAttribute('data-url')).toBe('https://example.com/a.png');
    expect(upload.getAttribute('data-name')).toBe('Alice');
    expect(upload.getAttribute('data-size')).toBe('lg');
  });

  it('toasts on successful avatar upload', () => {
    render(
      <ProfileSettings
        user={USER as never}
        onNameChange={jest.fn()}
        onEmailChange={jest.fn()}
        name="Alice"
        email="a@b.com"
      />,
    );
    fireEvent.click(screen.getByTestId('avatar-upload'));
    expect(mockToast.success).toHaveBeenCalledWith('settingsProfile.avatarUpdated');
  });

  it('handles a null user with fallbacks', () => {
    render(
      <ProfileSettings
        user={null}
        onNameChange={jest.fn()}
        onEmailChange={jest.fn()}
        name="Guest"
        email=""
      />,
    );
    const upload = screen.getByTestId('avatar-upload');
    expect(upload.getAttribute('data-user')).toBe('');
    expect(upload.getAttribute('data-name')).toBe('User');
    const role = screen.getByLabelText('labels.role') as HTMLInputElement;
    const dept = screen.getByLabelText('labels.department') as HTMLInputElement;
    expect(role.value).toBe('');
    expect(dept.value).toBe('settingsProfile.notAssigned');
  });
});
