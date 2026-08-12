/**
 * Tests for IdleTimeoutModal — idle session warning modal with countdown,
 * session extension and logout flows.
 *
 * Mocks: useIdleTimer (controllable state + captured callbacks), auth store,
 * next/navigation useRouter, Dialog, Button, sonner toast, lucide icons,
 * global fetch for logout/refresh endpoints.
 *
 * jsdom forbids redefining window.location (and its href), and a raw
 * `window.location.href = ...` assignment only logs a "Not implemented"
 * warning — so redirects are asserted via observable behavior (fetch calls,
 * auth store logout, modal close) instead, matching useAuthSync.test.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

let idleCallbacks: {
  onIdle?: () => void;
  onActive?: () => void;
  onLogout?: () => void;
} = {};
let mockShowWarning = false;
let mockCountdown = 0;
const extendSessionMock = jest.fn();
jest.mock('@/hooks/useIdleTimer', () => ({
  useIdleTimer: (opts: any) => {
    idleCallbacks = opts;
    return {
      showWarning: mockShowWarning,
      countdownSeconds: mockCountdown,
      extendSession: extendSessionMock,
    };
  },
}));

let mockUser: any = { id: 'u1', name: 'Anna Smith' };
const mockAuthLogout = jest.fn();
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ logout: mockAuthLogout, user: mockUser }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

let dialogOpenChange: ((open: boolean) => void) | undefined;
jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open, onOpenChange }: any) => {
    dialogOpenChange = onOpenChange;
    return open ? <div data-testid="dialog">{children}</div> : null;
  },
  DialogContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, variant, className, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return { Shield: Icon, Clock: Icon, LogOut: Icon, RefreshCw: Icon };
});

import { IdleTimeoutModal } from '@/components/auth/IdleTimeoutModal';

const originalFetch = global.fetch;

describe('IdleTimeoutModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    idleCallbacks = {};
    mockShowWarning = false;
    mockCountdown = 0;
    mockUser = { id: 'u1', name: 'Anna Smith' };
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('renders nothing while the modal is closed', () => {
    const { container } = render(<IdleTimeoutModal />);
    expect(container).toBeEmptyDOMElement();
  });

  it('opens on the idle callback with a countdown', () => {
    mockCountdown = 120;
    render(<IdleTimeoutModal />);
    act(() => {
      idleCallbacks.onIdle?.();
    });
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
    expect(screen.getByText('idleModal.sessionExpiring')).toBeInTheDocument();
    // 120s → 02:00
    expect(screen.getByText('02:00')).toBeInTheDocument();
    expect(screen.getByText('idleModal.extendSession')).toBeInTheDocument();
    expect(screen.getByText('idleModal.logoutNow')).toBeInTheDocument();
  });

  it('opens when showWarning becomes true', () => {
    mockShowWarning = true;
    render(<IdleTimeoutModal />);
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });

  it('closes on the active callback', () => {
    render(<IdleTimeoutModal />);
    act(() => {
      idleCallbacks.onIdle?.();
    });
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
    act(() => {
      idleCallbacks.onActive?.();
    });
    expect(screen.queryByTestId('dialog')).toBeNull();
  });

  it('shows the expired state with the welcome-back line when the countdown ends', () => {
    mockCountdown = 0;
    render(<IdleTimeoutModal />);
    act(() => {
      idleCallbacks.onIdle?.();
    });
    expect(screen.getByText('idleModal.sessionExpired')).toBeInTheDocument();
    expect(screen.getByText('idleModal.loginAgain')).toBeInTheDocument();
    expect(screen.getByText('idleModal.welcomeBack')).toBeInTheDocument();
  });

  it('omits the welcome-back line when the user has no name', () => {
    mockUser = { id: 'u1' };
    mockCountdown = 0;
    render(<IdleTimeoutModal />);
    act(() => {
      idleCallbacks.onIdle?.();
    });
    expect(screen.queryByText('idleModal.welcomeBack')).toBeNull();
  });

  it('shows the remaining countdown with minutes and seconds', () => {
    mockCountdown = 65;
    render(<IdleTimeoutModal />);
    act(() => {
      idleCallbacks.onIdle?.();
    });
    // 65s → 01:05
    expect(screen.getByText('01:05')).toBeInTheDocument();
  });

  it('calls extendSession from the extend button', () => {
    mockCountdown = 120;
    render(<IdleTimeoutModal />);
    act(() => {
      idleCallbacks.onIdle?.();
    });
    fireEvent.click(screen.getByText('idleModal.extendSession'));
    expect(extendSessionMock).toHaveBeenCalled();
    // NB: the button wires useIdleTimer's extendSession, not the (dead-code)
    // _handleExtendSession which would hit /api/auth/refresh-session.
  });

  it('logs out via the logout button', async () => {
    mockCountdown = 120;
    render(<IdleTimeoutModal />);
    act(() => {
      idleCallbacks.onIdle?.();
    });
    fireEvent.click(screen.getByText('idleModal.logoutNow'));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
    });
    expect(mockAuthLogout).toHaveBeenCalled();
  });

  it('skips the store clear when the logout API fails (redirect-only fallback)', async () => {
    mockCountdown = 120;
    (global.fetch as jest.Mock).mockRejectedValue(new Error('down'));
    render(<IdleTimeoutModal />);
    act(() => {
      idleCallbacks.onIdle?.();
    });
    fireEvent.click(screen.getByText('idleModal.logoutNow'));
    // The catch branch swallows the error; authLogout stays inside the try.
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
    });
    expect(mockAuthLogout).not.toHaveBeenCalled();
  });

  it('extends the session when the dialog is dismissed while not counting down', () => {
    mockCountdown = 0;
    render(<IdleTimeoutModal />);
    act(() => {
      idleCallbacks.onIdle?.();
    });
    act(() => {
      dialogOpenChange?.(false);
    });
    expect(extendSessionMock).toHaveBeenCalled();
  });

  it('does not extend when the dialog is dismissed while counting down', () => {
    mockCountdown = 120;
    render(<IdleTimeoutModal />);
    act(() => {
      idleCallbacks.onIdle?.();
    });
    act(() => {
      dialogOpenChange?.(false);
    });
    expect(extendSessionMock).not.toHaveBeenCalled();
  });

  it('closes the modal from the expired state button', () => {
    mockCountdown = 0;
    render(<IdleTimeoutModal />);
    act(() => {
      idleCallbacks.onIdle?.();
    });
    fireEvent.click(screen.getByText('idleModal.loginAgain'));
    // The redirect itself is a no-op in jsdom; the modal closes client-side.
    expect(screen.queryByTestId('dialog')).toBeNull();
  });
});
