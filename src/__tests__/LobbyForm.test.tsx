/**
 * Smoke test for the meeting registration form (lobby). Covers the validation
 * flow and the success state transition. The form has no server logic of its
 * own — Convex submission is exercised by the broader meeting tests — but
 * the rendering, field gating and required-field validation account for most
 * of its public surface.
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    // Real `t` accepts either a string fallback or an options object with
    // `defaultValue` and interpolation variables. Tests only care about the
    // returned string, so collapse both shapes to the fallback (or key).
    t: (key: string, fallbackOrOptions?: string | { defaultValue?: string }) => {
      if (typeof fallbackOrOptions === 'string') return fallbackOrOptions;
      if (fallbackOrOptions && typeof fallbackOrOptions === 'object') {
        return fallbackOrOptions.defaultValue ?? key;
      }
      return key;
    },
  }),
}));
jest.mock('@/i18n/config', () => ({ ensureAppNamespaces: jest.fn() }));
jest.mock('sonner', () => ({
  toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }),
}));

const mockSubmit = jest.fn(async (_args: unknown) => ({
  registrationId: 'reg_1',
  deduped: false,
}));
jest.mock('convex/react', () => ({
  useMutation: () => mockSubmit,
}));

import { LobbyForm } from '@/components/meetings/LobbyForm';

function renderForm(
  fields: Array<{ name: 'fullName' | 'email' | 'phone'; required: boolean }> = [
    { name: 'fullName', required: true },
    { name: 'email', required: true },
  ],
  waitingRoomEnabled = false,
) {
  return render(
    <LobbyForm
      roomName="room-1"
      title="Design sync"
      hostName="Ada Lovelace"
      fields={fields}
      waitingRoomEnabled={waitingRoomEnabled}
      onRegistered={jest.fn()}
      onCancel={jest.fn()}
    />,
  );
}

describe('LobbyForm', () => {
  beforeEach(() => {
    mockSubmit.mockClear();
    // jsdom does not provide sessionStorage before reset; make it write-through.
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: jest.fn(() => null),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        clear: jest.fn(),
        key: jest.fn(),
        length: 0,
      },
    });
  });

  it('shows the configured fields with the required indicator', () => {
    renderForm();
    // The LobbyForm calls `t('meetings.fieldFullName')` with no fallback, so the
    // mock returns the key. Use the key for the assertion.
    expect(screen.getByText('meetings.fieldFullName')).toBeInTheDocument();
    expect(screen.getByText('meetings.fieldEmail')).toBeInTheDocument();
    // Both are required → both rendered with their inputs.
    expect(screen.getByPlaceholderText('meetings.fieldFullNamePlaceholder')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('meetings.fieldEmailPlaceholder')).toBeInTheDocument();
  });

  it('hides fields that the host did not enable', () => {
    renderForm([{ name: 'fullName', required: true }]);
    expect(screen.getByText('meetings.fieldFullName')).toBeInTheDocument();
    expect(screen.queryByText('meetings.fieldEmail')).not.toBeInTheDocument();
  });

  it('blocks submit when a required field is empty', async () => {
    renderForm();
    fireEvent.click(screen.getByText('meetings.lobbySubmit'));
    await waitFor(() => {
      expect(mockSubmit).not.toHaveBeenCalled();
    });
  });

  it('blocks submit on a malformed email', async () => {
    renderForm();
    fireEvent.change(screen.getByPlaceholderText('meetings.fieldFullNamePlaceholder'), {
      target: { value: 'Bob' },
    });
    fireEvent.change(screen.getByPlaceholderText('meetings.fieldEmailPlaceholder'), {
      target: { value: 'not-an-email' },
    });
    fireEvent.click(screen.getByText('meetings.lobbySubmit'));
    await waitFor(() => {
      expect(mockSubmit).not.toHaveBeenCalled();
    });
  });

  it('submits a complete form and shows the success state', async () => {
    const onRegistered = jest.fn();
    render(
      <LobbyForm
        roomName="room-1"
        title="Design sync"
        hostName="Ada Lovelace"
        fields={[
          { name: 'fullName', required: true },
          { name: 'email', required: true },
        ]}
        waitingRoomEnabled={false}
        onRegistered={onRegistered}
        onCancel={jest.fn()}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText('meetings.fieldFullNamePlaceholder'), {
      target: { value: 'Bob Stone' },
    });
    fireEvent.change(screen.getByPlaceholderText('meetings.fieldEmailPlaceholder'), {
      target: { value: 'bob@example.com' },
    });
    fireEvent.click(screen.getByText('meetings.lobbySubmit'));
    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          roomName: 'room-1',
          fullName: 'Bob Stone',
          email: 'bob@example.com',
        }),
      );
    });
    // The registration-only success state offers a "Join the meeting" CTA.
    expect(screen.getByRole('button', { name: 'Join the meeting' })).toBeInTheDocument();
  });

  it('shows the wait-for-host state when the waiting room is on', async () => {
    renderForm(
      [
        { name: 'fullName', required: true },
        { name: 'email', required: true },
      ],
      true,
    );
    fireEvent.change(screen.getByPlaceholderText('meetings.fieldFullNamePlaceholder'), {
      target: { value: 'Bob Stone' },
    });
    fireEvent.change(screen.getByPlaceholderText('meetings.fieldEmailPlaceholder'), {
      target: { value: 'bob@example.com' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('meetings.lobbySubmit'));
    });
    await waitFor(() => {
      expect(screen.getByText('meetings.lobbySubmittedTitle')).toBeInTheDocument();
    });
  });
});
