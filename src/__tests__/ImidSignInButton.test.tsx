/**
 * Tests for ImidSignInButton — "Login with imID" button on the login page.
 *
 * Mocks: convex/react useQuery keyed by ref name, react-i18next
 * (fallback-string t), generated api, UI primitives (ShieldLoader/Button),
 * a controllable Dialog mock, and global fetch for the
 * /api/mutation bridge. window.location.href assignment does NOT throw in
 * jsdom (it only logs a "Not implemented" navigation warning), so the
 * redirect branch is observed through the button staying in the loading
 * state (setIsLoading(false) is never reached on success).
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) =>
      typeof fallback === 'string' ? fallback : key,
  }),
}));

let queryResults: Record<string, unknown> = {};
jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
}));

jest.mock('../../convex/_generated/api', () => ({
  api: {
    integrations: {
      imidListEnabledOrgs: { _name: 'imidListEnabledOrgs' },
    },
  },
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <span data-testid="loader" />,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn() },
}));

// ── Controllable Dialog mock ────────────────────────────────────────────────
let mockDialogOpen = false;
let mockSetDialogOpen: (v: boolean) => void = () => {};
jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open, onOpenChange }: any) => {
    mockDialogOpen = open;
    mockSetDialogOpen = onOpenChange;
    return open ? <div data-testid="dialog">{children}</div> : null;
  },
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <div>{children}</div>,
}));

import { ImidSignInButton } from '@/components/auth/ImidSignInButton';
import { logger } from '@/lib/logger';

const fetchMock = jest.fn();
const originalFetch = global.fetch;

const ORG_A = { id: 'org-a', name: 'Alpha Org', slug: 'alpha' };
const ORG_B = { id: 'org-b', name: 'Beta Org', slug: 'beta' };

const okMutationResponse = (url: string) =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: async () => ({ value: { url } }),
  }) as unknown as Response;

describe('ImidSignInButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryResults = {};
    mockDialogOpen = false;
    mockSetDialogOpen = () => {};
    process.env.NEXT_PUBLIC_CONVEX_URL = 'https://convex.example';
    global.fetch = fetchMock;
    fetchMock.mockResolvedValue(okMutationResponse('https://imid.example/auth'));
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
    global.fetch = originalFetch;
  });

  // ── Hidden states ───────────────────────────────────────────────────────

  it('renders nothing while the enabled-orgs query is loading', () => {
    render(<ImidSignInButton />);
    expect(document.body.textContent).toBe('');
  });

  it('renders nothing when no org has imID enabled', () => {
    queryResults.imidListEnabledOrgs = [];
    render(<ImidSignInButton />);
    expect(document.body.textContent).toBe('');
  });

  it('renders nothing when the query returns null', () => {
    queryResults.imidListEnabledOrgs = null;
    render(<ImidSignInButton />);
    expect(document.body.textContent).toBe('');
  });

  // ── Single org: direct login ────────────────────────────────────────────

  it('renders the button with the org name for a single enabled org', () => {
    queryResults.imidListEnabledOrgs = [ORG_A];
    render(<ImidSignInButton />);
    expect(screen.getByText('Login with imID')).toBeInTheDocument();
    expect(screen.getByText('Alpha Org')).toBeInTheDocument();
  });

  it('redirects through the mutation bridge for a single org', async () => {
    queryResults.imidListEnabledOrgs = [ORG_A];
    render(<ImidSignInButton />);

    fireEvent.click(screen.getByText('Login with imID'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'https://convex.example/api/mutation',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({
      path: 'integrations:imidGetAuthorizationUrl',
      args: { organizationId: 'org-a' },
      format: 'json',
    });

    // On success the redirect happens and isLoading is never reset — the
    // button must stay in the loading state.
    await waitFor(() => {
      expect(screen.getByText('Signing in...')).toBeInTheDocument();
    });
    const btn = screen.getByText('Signing in...').closest('button');
    expect(btn?.disabled).toBe(true);
  });

  it('does not open the picker for a single org', async () => {
    queryResults.imidListEnabledOrgs = [ORG_A];
    render(<ImidSignInButton />);
    fireEvent.click(screen.getByText('Login with imID'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  // ── Multiple orgs: picker ───────────────────────────────────────────────

  it('opens the org picker for multiple enabled orgs', () => {
    queryResults.imidListEnabledOrgs = [ORG_A, ORG_B];
    render(<ImidSignInButton />);

    // with multiple orgs the org names live inside the picker, not the button
    expect(screen.getByText('Login with imID')).toBeInTheDocument();
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Login with imID'));
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
    expect(screen.getByText('Select your organization')).toBeInTheDocument();
    expect(screen.getByText('Alpha Org')).toBeInTheDocument();
    expect(screen.getByText('Beta Org')).toBeInTheDocument();
    expect(screen.getByText('@alpha')).toBeInTheDocument();
    expect(screen.getByText('@beta')).toBeInTheDocument();
  });

  it('logs in with the selected org from the picker', async () => {
    queryResults.imidListEnabledOrgs = [ORG_A, ORG_B];
    render(<ImidSignInButton />);

    fireEvent.click(screen.getByText('Login with imID'));
    fireEvent.click(screen.getByText('Beta Org'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'https://convex.example/api/mutation',
        expect.anything(),
      );
    });
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body).args).toEqual({ organizationId: 'org-b' });

    await waitFor(() => {
      expect(screen.getByText('Signing in...')).toBeInTheDocument();
    });
    // picker closes on selection
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('closes the picker via onOpenChange', async () => {
    queryResults.imidListEnabledOrgs = [ORG_A, ORG_B];
    render(<ImidSignInButton />);
    fireEvent.click(screen.getByText('Login with imID'));
    expect(mockDialogOpen).toBe(true);

    // the captured onOpenChange is the component's setShowPicker — calling it
    // re-renders the Dialog mock with open={false}
    act(() => mockSetDialogOpen(false));
    await waitFor(() => expect(mockDialogOpen).toBe(false));
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  // ── Error paths ─────────────────────────────────────────────────────────

  it('shows an error and logs it when the mutation returns a non-OK response', async () => {
    queryResults.imidListEnabledOrgs = [ORG_A];
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ errorMessage: 'imID is down' }),
    } as unknown as Response);

    render(<ImidSignInButton />);
    fireEvent.click(screen.getByText('Login with imID'));

    await waitFor(() => {
      expect(screen.getByText('imID is down')).toBeInTheDocument();
    });
    expect(logger.error).toHaveBeenCalled();
    // loading is reset so the user can retry
    const btn = screen.getByText('Login with imID').closest('button');
    expect(btn?.disabled).toBe(false);
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    queryResults.imidListEnabledOrgs = [ORG_A];
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
    } as unknown as Response);

    render(<ImidSignInButton />);
    fireEvent.click(screen.getByText('Login with imID'));

    await waitFor(() => {
      expect(screen.getByText('Failed to initiate imID login')).toBeInTheDocument();
    });
  });

  it('falls back to a generic message when the error response has no message', async () => {
    queryResults.imidListEnabledOrgs = [ORG_A];
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as unknown as Response);

    render(<ImidSignInButton />);
    fireEvent.click(screen.getByText('Login with imID'));

    await waitFor(() => {
      expect(screen.getByText('Failed to initiate imID login')).toBeInTheDocument();
    });
  });

  it('shows an error when the mutation returns no authorization URL', async () => {
    queryResults.imidListEnabledOrgs = [ORG_A];
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ value: {} }),
    } as unknown as Response);

    render(<ImidSignInButton />);
    fireEvent.click(screen.getByText('Login with imID'));

    await waitFor(() => {
      expect(screen.getByText('No authorization URL returned')).toBeInTheDocument();
    });
  });

  it('shows an error when the Convex URL is not configured', async () => {
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
    queryResults.imidListEnabledOrgs = [ORG_A];

    render(<ImidSignInButton />);
    fireEvent.click(screen.getByText('Login with imID'));

    await waitFor(() => {
      expect(screen.getByText('Convex URL not configured')).toBeInTheDocument();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reopens the picker when the org has no resolvable id', async () => {
    // Defensive guard: if a single enabled org lacks an id, resolvedOrgId is
    // undefined and the code falls back to showing the picker again.
    queryResults.imidListEnabledOrgs = [{ name: 'No Id Org', slug: 'no-id' }];
    render(<ImidSignInButton />);

    fireEvent.click(screen.getByText('Login with imID'));

    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    // loading is reset so the user is not stuck
    const btn = screen.getByText('Login with imID').closest('button');
    expect(btn?.disabled).toBe(false);
  });

  it('shows a generic error when fetch rejects with a non-Error', async () => {
    queryResults.imidListEnabledOrgs = [ORG_A];
    fetchMock.mockRejectedValue('boom');

    render(<ImidSignInButton />);
    fireEvent.click(screen.getByText('Login with imID'));

    await waitFor(() => {
      expect(screen.getByText('Failed to connect to imID')).toBeInTheDocument();
    });
    expect(logger.error).toHaveBeenCalledWith('imID login error:', 'boom');
  });

  it('clears a previous error on a new attempt', async () => {
    queryResults.imidListEnabledOrgs = [ORG_A];
    fetchMock
      .mockRejectedValueOnce(new Error('first failure'))
      .mockResolvedValueOnce(okMutationResponse('https://imid.example/auth'));

    render(<ImidSignInButton />);
    const button = screen.getByText('Login with imID');
    fireEvent.click(button);
    await waitFor(() => {
      expect(screen.getByText('first failure')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Login with imID'));
    await waitFor(() => {
      expect(screen.getByText('Signing in...')).toBeInTheDocument();
    });
    expect(screen.queryByText('first failure')).not.toBeInTheDocument();
  });
});
