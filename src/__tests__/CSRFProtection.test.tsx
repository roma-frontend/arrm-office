/**
 * Tests for CSRFProtection — CSRFProvider, useCSRF, CSRFInput, useSecureFetch.
 *
 * Covers: token generation, sessionStorage hydration, refresh, hidden input,
 * secure fetch header injection.
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import {
  CSRFProvider,
  useCSRF,
  CSRFInput,
  useSecureFetch,
} from '@/components/security/CSRFProtection';

// Mock the generateCSRFToken utility
jest.mock('@/lib/security', () => ({
  generateCSRFToken: jest.fn(() => 'mock-csrf-token-123'),
}));

function TestConsumer() {
  const { token, refreshToken } = useCSRF();
  return (
    <div>
      <span data-testid="token">{token ?? 'null'}</span>
      <button onClick={refreshToken}>refresh</button>
    </div>
  );
}

function TestSecureFetch() {
  const secureFetch = useSecureFetch();
  const handleFetch = async () => {
    await secureFetch('/api/test', { method: 'POST' });
  };
  return <button onClick={handleFetch}>fetch</button>;
}

describe('CSRFProtection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('CSRFProvider + useCSRF', () => {
    it('generates a token on mount when no existing token', async () => {
      render(
        <CSRFProvider>
          <TestConsumer />
        </CSRFProvider>,
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(screen.getByTestId('token').textContent).toBe('mock-csrf-token-123');
    });

    it('uses existing token from sessionStorage', async () => {
      sessionStorage.setItem('csrf_token', 'existing-token-abc');

      render(
        <CSRFProvider>
          <TestConsumer />
        </CSRFProvider>,
      );

      // Should use the existing token, not generate a new one
      expect(screen.getByTestId('token').textContent).toBe('existing-token-abc');
    });

    it('refreshToken generates a new token', async () => {
      const generateCSRFToken = require('@/lib/security').generateCSRFToken;
      generateCSRFToken.mockReturnValueOnce('token-v1');

      render(
        <CSRFProvider>
          <TestConsumer />
        </CSRFProvider>,
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(screen.getByTestId('token').textContent).toBe('token-v1');

      generateCSRFToken.mockReturnValueOnce('token-v2');
      await act(async () => {
        screen.getByText('refresh').click();
      });

      expect(screen.getByTestId('token').textContent).toBe('token-v2');
    });

    it('saves token to sessionStorage on refresh', async () => {
      render(
        <CSRFProvider>
          <TestConsumer />
        </CSRFProvider>,
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(sessionStorage.getItem('csrf_token')).toBe('mock-csrf-token-123');
    });
  });

  describe('CSRFInput', () => {
    it('renders hidden input with token value', async () => {
      render(
        <CSRFProvider>
          <CSRFInput />
        </CSRFProvider>,
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      const { container } = render(
        <CSRFProvider>
          <CSRFInput />
        </CSRFProvider>,
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      const input = container.querySelector('input[name="_csrf"]') as HTMLInputElement;
      expect(input).not.toBeNull();
      expect(input.type).toBe('hidden');
      expect(input.name).toBe('_csrf');
      expect(input.value).toBe('mock-csrf-token-123');
    });

    it('renders null when no token', () => {
      // No provider = no token
      const { container } = render(<CSRFInput />);
      expect(container.querySelector('input')).toBeNull();
    });
  });

  describe('useSecureFetch', () => {
    it('adds X-CSRF-Token header to requests', async () => {
      const mockFetchFn = jest.fn().mockResolvedValue({ ok: true });
      global.fetch = mockFetchFn;

      render(
        <CSRFProvider>
          <TestSecureFetch />
        </CSRFProvider>,
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      await act(async () => {
        screen.getByText('fetch').click();
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(mockFetchFn).toHaveBeenCalled();
      const callArgs = mockFetchFn.mock.calls[0];
      expect(callArgs[0]).toBe('/api/test');

      const headers = callArgs[1].headers as Headers;
      expect(headers.get('X-CSRF-Token')).toBe('mock-csrf-token-123');
    });

    it('preserves existing headers', async () => {
      const mockFetchFn = jest.fn().mockResolvedValue({ ok: true });
      global.fetch = mockFetchFn;

      function TestWithHeaders() {
        const secureFetch = useSecureFetch();
        const handleFetch = async () => {
          await secureFetch('/api/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
        };
        return <button onClick={handleFetch}>fetch</button>;
      }

      render(
        <CSRFProvider>
          <TestWithHeaders />
        </CSRFProvider>,
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      await act(async () => {
        screen.getByText('fetch').click();
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      const headers = mockFetchFn.mock.calls[0][1].headers as Headers;
      expect(headers.get('Content-Type')).toBe('application/json');
      expect(headers.get('X-CSRF-Token')).toBe('mock-csrf-token-123');
    });
  });
});
