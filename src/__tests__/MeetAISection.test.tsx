/**
 * Tests for the landing MeetAISection — the live AI chat demo window.
 * Verifies the seeded welcome exchange renders, prompt chips fill the input,
 * and sending a message hits /api/landing-demo and appends the reply.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ── i18n mock ────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: {
      language: 'en',
      getFixedT: () => (key: string, fallback?: string) => fallback ?? key,
    },
  }),
}));

jest.mock('@/i18n/config', () => ({}));

let mockFetch: jest.Mock;
beforeEach(() => {
  mockFetch = jest.fn(async () => ({
    json: async () => ({ reply: 'Mock AI reply' }),
  })) as unknown as jest.Mock;
  global.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  jest.clearAllMocks();
});

import MeetAISection from '@/components/landing/MeetAISection';

describe('MeetAISection', () => {
  it('renders the seeded welcome exchange after mount', async () => {
    render(<MeetAISection />);
    // After the mount effect the seeded messages appear (keys as fallbacks).
    await waitFor(() => {
      expect(screen.getByText('landing.meetAiWelcome')).toBeInTheDocument();
    });
    expect(screen.getByText('landing.demoUserAsk')).toBeInTheDocument();
    expect(screen.getByText('landing.demoAiAnswer')).toBeInTheDocument();
  });

  it('renders prompt chips and the composer', async () => {
    render(<MeetAISection />);
    await waitFor(() => {
      expect(screen.getByText('landing.meetAiChip1')).toBeInTheDocument();
    });
    expect(screen.getByText('landing.meetAiChip2')).toBeInTheDocument();
    expect(screen.getByText('landing.meetAiChip3')).toBeInTheDocument();
    expect(screen.getByLabelText('landing.demoComposer')).toBeInTheDocument();
  });

  it('sending a message calls the demo API and appends the reply', async () => {
    render(<MeetAISection />);
    await waitFor(() => {
      expect(screen.getByText('landing.meetAiWelcome')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('landing.demoComposer');
    fireEvent.change(input, { target: { value: 'What is Strata?' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/landing-demo',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string) as {
      prompt: string;
    };
    expect(body.prompt).toBe('What is Strata?');

    await waitFor(() => {
      expect(screen.getByText('Mock AI reply')).toBeInTheDocument();
    });
  });

  it('a prompt chip click sends that chip as the message', async () => {
    render(<MeetAISection />);
    await waitFor(() => {
      expect(screen.getByText('landing.meetAiChip1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('landing.meetAiChip1'));
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string) as {
      prompt: string;
    };
    expect(body.prompt).toBe('landing.meetAiChip1');
  });

  it('shows a graceful error message when the API fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'));
    render(<MeetAISection />);
    await waitFor(() => {
      expect(screen.getByText('landing.meetAiWelcome')).toBeInTheDocument();
    });
    const input = screen.getByLabelText('landing.demoComposer');
    fireEvent.change(input, { target: { value: 'hi' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    await waitFor(() => {
      expect(screen.getByText('landing.meetAiError')).toBeInTheDocument();
    });
  });
});
