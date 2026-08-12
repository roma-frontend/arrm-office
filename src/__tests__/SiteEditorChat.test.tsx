/**
 * Tests for SiteEditorChat — the AI site editor chat: usage stats card for
 * starter plans, professional/enterprise plan badges, send-message flow with
 * the full state machine (placeholder thinking message, success, applied files
 * toast, limit-reached redirect, generic errors), rollback via applied-files
 * and the backups panel, plus the recent session history list.
 *
 * Mocks: convex/react, api, react-i18next, usePlanFeatures (mutable plan +
 * features), next/navigation, sonner, logger, ErrorBoundary, UI primitives,
 * ShieldLoader, lucide, date-format.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: any) => (typeof fallback === 'object' ? key : (fallback ?? key)),
    i18n: { language: 'en' },
  }),
}));

let queryResults: Record<string, unknown> = {};

jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    aiSiteEditor: {
      getCurrentMonthUsage: { _name: 'getCurrentMonthUsage' },
      getHistory: { _name: 'getHistory' },
    },
  },
}));

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

let mockPlan: string = 'starter';
let mockFeatures: Record<string, any> = {};
jest.mock('@/hooks/usePlanFeatures', () => ({
  usePlanFeatures: () => ({ features: mockFeatures, plan: mockPlan }),
}));

jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn(), info: jest.fn() },
}));

jest.mock('@/lib/date-format', () => ({
  formatDateTime: (ts: number, lang: string) => `DT(${ts},${lang})`,
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() },
}));

jest.mock('@/components/error/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: any) => <div data-testid="error-boundary">{children}</div>,
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, variant, size, className }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      data-variant={variant}
      data-size={size}
      className={className}
    >
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/textarea', () => ({
  Textarea: (props: any) => <textarea {...props} />,
}));

jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children, ...props }: any) => (
    <div data-testid="scroll-area" ref={props.ref} {...props}>
      {children}
    </div>
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: any) => <span>{children}</span>,
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <div data-testid="shield-loader" />,
}));

jest.mock('lucide-react', () => {
  const icons = [
    'Send',
    'Sparkles',
    'Code2',
    'Palette',
    'Layout',
    'Zap',
    'History',
    'AlertCircle',
    'Crown',
    'Undo2',
    'CheckCircle2',
    'FileCode2',
    'RefreshCw',
  ];
  const mocks: Record<string, any> = {};
  for (const name of icons)
    mocks[name] = (props: any) => <span data-testid={`icon-${name}`} {...props} />;
  return mocks;
});

import { SiteEditorChat } from '@/components/ai/SiteEditorChat';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

const PROPS = { userId: 'u-1', organizationId: 'org-1' };

function sendButton() {
  return screen.getByTestId('icon-Send').closest('button')!;
}

function sendMessage(text: string) {
  fireEvent.change(screen.getByPlaceholderText('aiSiteEditor.inputPlaceholder'), {
    target: { value: text },
  });
  fireEvent.click(sendButton());
}

const USAGE = {
  designChanges: 2,
  contentChanges: 5,
  layoutChanges: 1,
};

const BACKUPS = [
  { originalPath: 'src/app/page.tsx', timestamp: 1700000000000, description: 'Hero text' },
  { originalPath: 'src/app/about.tsx', timestamp: 1700000001000, description: 'Colors' },
];

const HISTORY = [
  {
    _id: 'h-1',
    editType: 'design',
    userMessage: 'Make the hero blue',
    status: 'completed',
  },
  {
    _id: 'h-2',
    editType: 'content',
    userMessage:
      'Update the about page with a very long description that exceeds sixty characters for sure',
    status: 'pending',
  },
  {
    _id: 'h-3',
    editType: 'layout',
    userMessage: 'Reorganize the sidebar',
    status: 'completed',
  },
  {
    _id: 'h-4',
    editType: 'logic',
    userMessage: 'Fix the form validation',
    status: 'completed',
  },
  {
    _id: 'h-5',
    editType: 'full_control',
    userMessage: 'Rewrite the header component',
    status: 'completed',
  },
];

describe('SiteEditorChat', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPush.mockClear();
    mockPlan = 'starter';
    mockFeatures = {
      aiSiteEditorDesignChanges: 5,
      aiSiteEditorContentChanges: 10,
      aiSiteEditorLayoutChanges: 2,
    };
    queryResults = {
      getCurrentMonthUsage: USAGE,
      getHistory: HISTORY,
    };
    // URL-dispatched fetch: /api/csrf-token supplies the CSRF pair (the
    // component now fetches it before every POST/DELETE),
    // /api/ai-site-editor/apply returns backups on mount, and
    // /api/ai-site-editor returns assistant text without file changes by default.
    global.fetch = jest.fn((url: string) => {
      if (url === '/api/csrf-token') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ token: 't', signature: 's' }),
        });
      }
      if (url === '/api/ai-site-editor/apply') {
        return Promise.resolve({ ok: true, json: async () => ({ backups: [] }) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ response: 'Done!', editType: 'design' }),
      });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the greeting and disables the send button while empty', () => {
    render(<SiteEditorChat {...PROPS} />);
    expect(screen.getByText('aiSiteEditor.greeting')).toBeInTheDocument();
    expect(sendButton()).toBeDisabled();
  });

  it('shows the usage stats card for starter plans', () => {
    render(<SiteEditorChat {...PROPS} />);
    expect(screen.getByText('aiSiteEditor.usageThisMonth')).toBeInTheDocument();
    expect(screen.getByText('2 / 5')).toBeInTheDocument();
    expect(screen.getByText('5 / 10')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByText('aiSiteEditor.upgradeForUnlimited')).toBeInTheDocument();
  });

  it('navigates to billing from the upgrade button', () => {
    render(<SiteEditorChat {...PROPS} />);
    fireEvent.click(screen.getByText('aiSiteEditor.upgradeForUnlimited'));
    expect(mockPush).toHaveBeenCalledWith('/settings?tab=billing');
  });

  it('shows the professional plan badge without usage stats', () => {
    mockPlan = 'professional';
    render(<SiteEditorChat {...PROPS} />);
    expect(screen.getByText('aiSiteEditor.professionalPlan')).toBeInTheDocument();
    expect(screen.getByText(/aiSiteEditor.unlimited/)).toBeInTheDocument();
    expect(screen.queryByText('aiSiteEditor.usageThisMonth')).toBeNull();
  });

  it('shows the enterprise plan badge', () => {
    mockPlan = 'enterprise';
    render(<SiteEditorChat {...PROPS} />);
    expect(screen.getByText('aiSiteEditor.enterprisePlan')).toBeInTheDocument();
  });

  it('hides the usage card while the usage query is loading', () => {
    queryResults.getCurrentMonthUsage = undefined;
    render(<SiteEditorChat {...PROPS} />);
    expect(screen.queryByText('aiSiteEditor.usageThisMonth')).toBeNull();
  });

  it('sends a message and renders the assistant reply', async () => {
    render(<SiteEditorChat {...PROPS} />);
    sendMessage('Make it green');

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/ai-site-editor',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    const sendCall = (global.fetch as jest.Mock).mock.calls.find(
      (c: any[]) => c[0] === '/api/ai-site-editor',
    );
    const body = JSON.parse(sendCall[1].body) as {
      message: string;
      userId: string;
      organizationId: string;
      plan: string;
    };
    expect(body).toEqual({
      message: 'Make it green',
      userId: 'u-1',
      organizationId: 'org-1',
      plan: 'starter',
    });

    await waitFor(() => expect(screen.getByText('Done!')).toBeInTheDocument());
    // Thinking placeholder gone after the reply arrives.
    expect(screen.queryByText(/AI читает код и применяет изменения/)).toBeNull();
  });

  it('sends a message with the Enter key', async () => {
    render(<SiteEditorChat {...PROPS} />);
    fireEvent.change(screen.getByPlaceholderText('aiSiteEditor.inputPlaceholder'), {
      target: { value: 'Shift this' },
    });
    fireEvent.keyDown(screen.getByPlaceholderText('aiSiteEditor.inputPlaceholder'), {
      key: 'Enter',
    });
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  });

  it('sends a message via the send button', async () => {
    render(<SiteEditorChat {...PROPS} />);
    sendMessage('Button send');
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  });

  it('does not send on Shift+Enter', () => {
    render(<SiteEditorChat {...PROPS} />);
    fireEvent.change(screen.getByPlaceholderText('aiSiteEditor.inputPlaceholder'), {
      target: { value: 'Keep newline' },
    });
    fireEvent.keyDown(screen.getByPlaceholderText('aiSiteEditor.inputPlaceholder'), {
      key: 'Enter',
      shiftKey: true,
    });
    // Only the mount-time backups fetch ran; no message POST.
    expect(global.fetch).not.toHaveBeenCalledWith(
      '/api/ai-site-editor',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('shows the applied-files toast when files were changed', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/ai-site-editor/apply') {
        return Promise.resolve({ ok: true, json: async () => ({ backups: [] }) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          response: 'Patched',
          appliedFiles: [
            { filePath: 'src/app/page.tsx', timestamp: 1700000000000, description: 'Hero' },
          ],
        }),
      });
    }) as unknown as typeof fetch;

    render(<SiteEditorChat {...PROPS} />);
    sendMessage('Apply it');

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringContaining('Применено 1 изменений'),
        expect.objectContaining({ duration: 5000 }),
      ),
    );
    expect(screen.getByText('Patched')).toBeInTheDocument();
  });

  it('shows an info toast when the AI replies without file changes', async () => {
    render(<SiteEditorChat {...PROPS} />);
    sendMessage('Just explain');
    await waitFor(() =>
      expect(toast.info).toHaveBeenCalledWith(
        expect.stringContaining('не были изменены'),
        expect.objectContaining({ duration: 3000 }),
      ),
    );
  });

  it('handles the limit-reached response with an upgrade action', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/ai-site-editor/apply') {
        return Promise.resolve({ ok: true, json: async () => ({ backups: [] }) });
      }
      return Promise.resolve({
        ok: false,
        json: async () => ({ limitReached: true, error: 'Monthly limit' }),
      });
    }) as unknown as typeof fetch;
    render(<SiteEditorChat {...PROPS} />);
    sendMessage('One more');

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Monthly limit',
        expect.objectContaining({ action: expect.any(Object) }),
      );
    });
    expect(screen.getByText(/⚠️ Monthly limit/)).toBeInTheDocument();

    // Trigger the toast action → upgrade redirect.
    const actionArg = (toast.error as jest.Mock).mock.calls[0][1].action;
    actionArg.onClick();
    expect(mockPush).toHaveBeenCalledWith('/settings?tab=billing');
  });

  it('shows a system error message when the request fails', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/ai-site-editor/apply') {
        return Promise.resolve({ ok: true, json: async () => ({ backups: [] }) });
      }
      return Promise.resolve({
        ok: false,
        json: async () => ({ error: 'Server exploded' }),
      });
    }) as unknown as typeof fetch;
    render(<SiteEditorChat {...PROPS} />);
    sendMessage('Broken');

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('aiSiteEditor.error'));
    expect(screen.getByText(/❌ aiSiteEditor.error/)).toBeInTheDocument();
    expect(logger.error).toHaveBeenCalled();
  });

  it('handles a network failure gracefully', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/ai-site-editor/apply') {
        return Promise.resolve({ ok: true, json: async () => ({ backups: [] }) });
      }
      return Promise.reject(new Error('network down'));
    }) as unknown as typeof fetch;
    render(<SiteEditorChat {...PROPS} />);
    sendMessage('Net');

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('aiSiteEditor.error'));
    expect(screen.getByText(/❌ aiSiteEditor.error/)).toBeInTheDocument();
  });

  it('shows the backups panel and toggles the list', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/ai-site-editor/apply') {
        return Promise.resolve({ ok: true, json: async () => ({ backups: BACKUPS }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ response: 'x' }) });
    }) as unknown as typeof fetch;
    render(<SiteEditorChat {...PROPS} />);

    await waitFor(() => expect(screen.getByText(/История изменений/)).toBeInTheDocument());
    expect(screen.queryByText('src/app/page.tsx')).toBeNull();

    fireEvent.click(screen.getByText('Показать'));
    expect(screen.getByText('src/app/page.tsx')).toBeInTheDocument();
    expect(screen.getByText('src/app/about.tsx')).toBeInTheDocument();
    expect(screen.getByText(/DT\(1700000000000,en\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Скрыть'));
    expect(screen.queryByText('src/app/page.tsx')).toBeNull();
  });

  it('rolls back a backup from the panel', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/ai-site-editor/apply') {
        return Promise.resolve({ ok: true, json: async () => ({ backups: BACKUPS }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ response: 'x' }) });
    }) as unknown as typeof fetch;
    render(<SiteEditorChat {...PROPS} />);
    await waitFor(() => expect(screen.getByText('Показать')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Показать'));

    (global.fetch as jest.Mock).mockImplementation((url: string, init?: any) => {
      if (url === '/api/ai-site-editor/apply' && init?.method === 'DELETE') {
        return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ backups: BACKUPS }) });
    }) as unknown as typeof fetch;
    fireEvent.click(screen.getAllByText('Откат')[0]);

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/ai-site-editor/apply',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Откат выполнен')),
    );
    expect(screen.getByText(/Откат выполнен для файла/)).toBeInTheDocument();
  });

  it('shows an error toast when a rollback fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ backups: BACKUPS }),
    });
    render(<SiteEditorChat {...PROPS} />);
    await waitFor(() => expect(screen.getByText('Показать')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Показать'));

    (global.fetch as jest.Mock).mockImplementation((url: string, init?: any) => {
      if (url === '/api/ai-site-editor/apply' && init?.method === 'DELETE') {
        return Promise.resolve({ ok: false, json: async () => ({ error: 'No permission' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ backups: BACKUPS }) });
    }) as unknown as typeof fetch;
    fireEvent.click(screen.getAllByText('Откат')[0]);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Ошибка отката')),
    );
  });

  it('falls back to a generic error text when the API omits the message', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/csrf-token') {
        return Promise.resolve({ ok: true, json: async () => ({ token: 't', signature: 's' }) });
      }
      if (url === '/api/ai-site-editor/apply') {
        return Promise.resolve({ ok: true, json: async () => ({ backups: [] }) });
      }
      return Promise.resolve({ ok: false, json: async () => ({ limitReached: true }) });
    }) as unknown as typeof fetch;
    render(<SiteEditorChat {...PROPS} />);
    sendMessage('One more');

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Server error',
        expect.objectContaining({ action: expect.any(Object) }),
      );
    });
    // The in-chat system message falls back to an empty error text.
    expect(screen.getByText(/⚠️/)).toBeInTheDocument();
  });

  it('renders an empty assistant message when the response lacks text', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/csrf-token') {
        return Promise.resolve({ ok: true, json: async () => ({ token: 't', signature: 's' }) });
      }
      if (url === '/api/ai-site-editor/apply') {
        return Promise.resolve({ ok: true, json: async () => ({ backups: [] }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }) as unknown as typeof fetch;
    render(<SiteEditorChat {...PROPS} />);
    sendMessage('Empty reply');

    // No file changes → info toast; the empty text renders without crashing.
    await waitFor(() =>
      expect(toast.info).toHaveBeenCalledWith(
        expect.stringContaining('не были изменены'),
        expect.objectContaining({ duration: 3000 }),
      ),
    );
    expect(screen.queryByText(/AI читает код/)).toBeNull();
  });

  it('keeps the backups list empty when the backups response is not ok', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/csrf-token') {
        return Promise.resolve({ ok: true, json: async () => ({ token: 't', signature: 's' }) });
      }
      if (url === '/api/ai-site-editor/apply') {
        return Promise.resolve({ ok: false, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ response: 'x' }) });
    }) as unknown as typeof fetch;
    render(<SiteEditorChat {...PROPS} />);
    // The backups fetch failed → no history panel heading.
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/ai-site-editor/apply'));
    expect(screen.queryByText(/История изменений/)).toBeNull();
  });

  it('keeps the backups list empty when the response omits the backups field', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/csrf-token') {
        return Promise.resolve({ ok: true, json: async () => ({ token: 't', signature: 's' }) });
      }
      if (url === '/api/ai-site-editor/apply') {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ response: 'x' }) });
    }) as unknown as typeof fetch;
    render(<SiteEditorChat {...PROPS} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/ai-site-editor/apply'));
    expect(screen.queryByText(/История изменений/)).toBeNull();
  });

  it('rolls back without CSRF headers and falls back to the generic error', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string, init?: any) => {
      if (url === '/api/csrf-token') {
        return Promise.resolve({ ok: false, json: async () => ({}) });
      }
      if (url === '/api/ai-site-editor/apply' && init?.method === 'DELETE') {
        return Promise.resolve({ ok: false, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ backups: BACKUPS }) });
    }) as unknown as typeof fetch;
    render(<SiteEditorChat {...PROPS} />);
    await waitFor(() => expect(screen.getByText('Показать')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Показать'));
    fireEvent.click(screen.getAllByText('Откат')[0]);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Ошибка отката: Неизвестная ошибка'),
    );
  });

  it('renders the thinking placeholder while waiting for the reply', async () => {
    let resolveFetch: (v: any) => void = () => {};
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/csrf-token') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ token: 't', signature: 's' }),
        });
      }
      if (url === '/api/ai-site-editor/apply') {
        return Promise.resolve({ ok: true, json: async () => ({ backups: [] }) });
      }
      return new Promise((resolve) => {
        resolveFetch = resolve;
      });
    }) as unknown as typeof fetch;

    render(<SiteEditorChat {...PROPS} />);
    sendMessage('Slow one');

    await waitFor(() =>
      expect(screen.getByText(/AI читает код и применяет изменения/)).toBeInTheDocument(),
    );

    resolveFetch({ ok: true, json: async () => ({ response: 'Landed' }) });
    await waitFor(() => expect(screen.getByText('Landed')).toBeInTheDocument());
  });

  it('shows a generic error toast when the rollback request itself fails', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string, init?: any) => {
      if (url === '/api/ai-site-editor/apply' && init?.method === 'DELETE') {
        return Promise.reject(new Error('boom'));
      }
      return Promise.resolve({ ok: true, json: async () => ({ backups: BACKUPS }) });
    }) as unknown as typeof fetch;
    render(<SiteEditorChat {...PROPS} />);
    await waitFor(() => expect(screen.getByText('Показать')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Показать'));
    fireEvent.click(screen.getAllByText('Откат')[0]);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Ошибка при выполнении отката'));
  });

  it('renders the recent session history with icons', () => {
    render(<SiteEditorChat {...PROPS} />);
    expect(screen.getByText('aiSiteEditor.recentChanges')).toBeInTheDocument();
    expect(screen.getByText('Make the hero blue')).toBeInTheDocument();
    expect(screen.getByTestId('icon-Palette')).toBeInTheDocument();
    expect(screen.getByTestId('icon-Code2')).toBeInTheDocument();
    // Completed sessions show the check icon.
    expect(screen.getAllByTestId('icon-CheckCircle2').length).toBeGreaterThan(0);
    // Long messages are truncated.
    expect(screen.getByText(/…$/)).toBeInTheDocument();
  });

  it('renders edit-type badges on assistant messages', async () => {
    render(<SiteEditorChat {...PROPS} />);
    sendMessage('Design it');
    await waitFor(() => expect(screen.getByText('Done!')).toBeInTheDocument());
    // One in the usage card, one on the message badge.
    expect(screen.getAllByText('aiSiteEditor.design').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('icon-Palette').length).toBeGreaterThan(0);
  });

  it('renders icons for every edit type in the history', () => {
    render(<SiteEditorChat {...PROPS} />);
    expect(screen.getAllByTestId('icon-Layout').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('icon-Zap').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('icon-Crown').length).toBeGreaterThan(0);
    expect(screen.getByText('Reorganize the sidebar')).toBeInTheDocument();
    expect(screen.getByText('Fix the form validation')).toBeInTheDocument();
    expect(screen.getByText('Rewrite the header component')).toBeInTheDocument();
  });

  it('renders badges for every edit type on replies', async () => {
    let idx = 0;
    const types = ['layout', 'logic', 'full_control', 'content', 'weird'];
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/csrf-token') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ token: 't', signature: 's' }),
        });
      }
      if (url === '/api/ai-site-editor/apply') {
        return Promise.resolve({ ok: true, json: async () => ({ backups: [] }) });
      }
      const editType = types[idx++];
      return Promise.resolve({
        ok: true,
        json: async () => ({ response: `reply-${editType}`, editType }),
      });
    }) as unknown as typeof fetch;

    render(<SiteEditorChat {...PROPS} />);
    sendMessage('first');
    await waitFor(() => expect(screen.getByText('reply-layout')).toBeInTheDocument());
    expect(screen.getAllByText('aiSiteEditor.layout').length).toBeGreaterThan(0);

    sendMessage('second');
    await waitFor(() => expect(screen.getByText('reply-logic')).toBeInTheDocument());

    sendMessage('third');
    await waitFor(() => expect(screen.getByText('reply-full_control')).toBeInTheDocument());

    sendMessage('fourth');
    await waitFor(() => expect(screen.getByText('reply-content')).toBeInTheDocument());

    // Unknown type: the bubble renders but with no badge label.
    sendMessage('fifth');
    await waitFor(() => expect(screen.getByText('reply-weird')).toBeInTheDocument());
    // Content div → bubble wrapper; no badge span with a label inside.
    const bubble = screen.getByText('reply-weird').parentElement!.parentElement!;
    const label = bubble.querySelector('span')?.textContent ?? '';
    expect(label.trim()).not.toMatch(/aiSiteEditor\.(design|content|layout|logic|fullControl)/);
  });

  it('hides the history card when there is no history', () => {
    queryResults.getHistory = [];
    render(<SiteEditorChat {...PROPS} />);
    expect(screen.queryByText('aiSiteEditor.recentChanges')).toBeNull();
  });
});
