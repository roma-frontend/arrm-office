/**
 * Tests for AssistantExtras — chat-widget cards and artifact renderer.
 *
 * Covers SourcesChips, GeneratedImageCard (CSRF + /api/chat/image fetch),
 * WebSearchCard (CSRF + /api/chat/web-search fetch) and ArtifactCanvas
 * (html/react/code previews, toggle, copy). fetch is mocked by URL prefix;
 * navigator.clipboard is stubbed.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

jest.mock('lucide-react', () => ({
  BookOpen: () => <span>book</span>,
  Globe: () => <span>globe</span>,
  Copy: () => <span>copy-icon</span>,
  Check: () => <span>check-icon</span>,
  Code: () => <span>code-icon</span>,
  Eye: () => <span>eye-icon</span>,
  ImageIcon: () => <span>image-icon</span>,
  Loader2: () => <span>loader-icon</span>,
}));

import {
  SourcesChips,
  GeneratedImageCard,
  WebSearchCard,
  ArtifactCanvas,
} from '@/components/ai/AssistantExtras';

let clipboardWrite: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  clipboardWrite = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: clipboardWrite },
    configurable: true,
  });
  global.fetch = jest.fn() as unknown as typeof fetch;
});

afterEach(() => {
  delete (global as { fetch?: typeof fetch }).fetch;
});

function mockCsrfOk() {
  (global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (String(url).includes('csrf-token')) {
      return Promise.resolve({ ok: true, json: async () => ({ token: 'tok', signature: 'sig' }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

describe('SourcesChips', () => {
  it('renders nothing without sources', () => {
    const { container } = render(<SourcesChips sources={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a chip per source', () => {
    render(<SourcesChips sources={['docs/convex.md', 'handbook.pdf']} />);
    expect(screen.getByText('docs/convex.md')).toBeInTheDocument();
    expect(screen.getByText('handbook.pdf')).toBeInTheDocument();
    expect(screen.getByText('book')).toBeInTheDocument();
  });
});

describe('GeneratedImageCard', () => {
  it('shows the generating state while the image loads', async () => {
    let resolveImage: (v: unknown) => void = () => {};
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (String(url).includes('csrf-token')) {
        return Promise.resolve({ ok: true, json: async () => ({ token: 't', signature: 's' }) });
      }
      return new Promise((res) => {
        resolveImage = res;
      });
    });
    render(<GeneratedImageCard prompt="a cat" />);
    expect(screen.getByText('Generating image…')).toBeInTheDocument();
    expect(screen.getByText('loader-icon')).toBeInTheDocument();
    // Settle the dangling fetch promise to avoid open-handle warnings.
    await act(async () => {
      resolveImage({ ok: true, json: async () => ({ imageUrl: 'x' }) });
      await new Promise((r) => setTimeout(r, 0));
    });
  });

  it('renders the image when generation succeeds', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (String(url).includes('csrf-token')) {
        return Promise.resolve({ ok: true, json: async () => ({ token: 't', signature: 's' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ imageUrl: 'https://img/a.png' }) });
    });
    render(<GeneratedImageCard prompt="a cat" />);
    const img = await screen.findByAltText('a cat');
    expect(img).toHaveAttribute('src', 'https://img/a.png');
    expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe('/api/chat/image');
    const [, init] = (global.fetch as jest.Mock).mock.calls[1];
    expect((init as RequestInit).headers).toMatchObject({
      'X-CSRF-Token': 't',
      'X-CSRF-Token-Signature': 's',
    });
  });

  it('sends no CSRF headers when the token fetch rejects', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (String(url).includes('csrf-token')) {
        return Promise.reject(new Error('net'));
      }
      return Promise.resolve({ ok: true, json: async () => ({ imageUrl: 'https://img/a.png' }) });
    });
    render(<GeneratedImageCard prompt="a cat" />);
    const img = await screen.findByAltText('a cat');
    expect(img).toBeInTheDocument();
    const [, init] = (global.fetch as jest.Mock).mock.calls[1];
    expect((init as RequestInit).headers).not.toHaveProperty('X-CSRF-Token');
  });

  it('sends no CSRF headers when the token fetch fails', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (String(url).includes('csrf-token')) {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ imageUrl: 'https://img/a.png' }) });
    });
    render(<GeneratedImageCard prompt="a cat" />);
    const img = await screen.findByAltText('a cat');
    expect(img).toBeInTheDocument();
    const [, init] = (global.fetch as jest.Mock).mock.calls[1];
    expect((init as RequestInit).headers).not.toHaveProperty('X-CSRF-Token');
  });

  it('returns null when the image request fails with a non-OK status', async () => {
    mockCsrfOk();
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (String(url).includes('csrf-token')) {
        return Promise.resolve({ ok: true, json: async () => ({ token: 't', signature: 's' }) });
      }
      return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
    });
    render(<GeneratedImageCard prompt="a cat" />);
    await waitFor(() => {
      expect(screen.queryByText('Generating image…')).toBeNull();
    });
    expect(screen.queryByText('loader-icon')).toBeNull();
  });

  it('returns null when the image request rejects', async () => {
    mockCsrfOk();
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (String(url).includes('csrf-token')) {
        return Promise.resolve({ ok: true, json: async () => ({ token: 't', signature: 's' }) });
      }
      return Promise.reject(new Error('net'));
    });
    render(<GeneratedImageCard prompt="a cat" />);
    await waitFor(() => {
      expect(screen.queryByText('Generating image…')).toBeNull();
    });
    expect(screen.queryByText('loader-icon')).toBeNull();
  });

  it('does not set state after unmount', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (String(url).includes('csrf-token')) {
        return Promise.resolve({ ok: true, json: async () => ({ token: 't', signature: 's' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ imageUrl: 'https://img/a.png' }) });
    });
    const { unmount } = render(<GeneratedImageCard prompt="a cat" />);
    unmount();
    // Flush the pending effect promise without state updates crashing.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it('skips setFailed when unmounted before the image request rejects', async () => {
    let rejectImage: (v: unknown) => void = () => {};
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (String(url).includes('csrf-token')) {
        return Promise.resolve({ ok: true, json: async () => ({ token: 't', signature: 's' }) });
      }
      return new Promise((_, rej) => {
        rejectImage = rej;
      });
    });
    const { unmount } = render(<GeneratedImageCard prompt="a cat" />);
    // Flush the csrf await so the image fetch has actually started.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    unmount();
    await act(async () => {
      rejectImage(new Error('late net'));
      await Promise.resolve();
      await Promise.resolve();
    });
  });
});

describe('WebSearchCard', () => {
  it('shows searching while the query is pending', async () => {
    let resolveSearch: (v: unknown) => void = () => {};
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (String(url).includes('csrf-token')) {
        return Promise.resolve({ ok: true, json: async () => ({ token: 't', signature: 's' }) });
      }
      return new Promise((res) => {
        resolveSearch = res;
      });
    });
    render(<WebSearchCard query="convex docs" />);
    expect(screen.getByText('Searching…')).toBeInTheDocument();
    // Settle the dangling fetch promise to avoid open-handle warnings.
    await act(async () => {
      resolveSearch({ ok: true, json: async () => ({ results: [] }) });
      await new Promise((r) => setTimeout(r, 0));
    });
  });

  it('renders up to 4 search results', async () => {
    const results = Array.from({ length: 6 }, (_, i) => ({
      url: `https://example.com/${i}`,
      title: `Title ${i}`,
      snippet: `Snippet ${i}`,
      source: `Source ${i}`,
    }));
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (String(url).includes('csrf-token')) {
        return Promise.resolve({ ok: true, json: async () => ({ token: 't', signature: 's' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ results }) });
    });
    render(<WebSearchCard query="convex docs" />);
    expect(await screen.findByText('Title 0')).toBeInTheDocument();
    expect(screen.getByText('Title 3')).toBeInTheDocument();
    expect(screen.queryByText('Title 4')).toBeNull();
    expect(screen.getByText('Snippet 2')).toBeInTheDocument();
    expect(screen.getByText('Source 1')).toBeInTheDocument();
    const [, init] = (global.fetch as jest.Mock).mock.calls[1];
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      query: 'convex docs',
    });
  });

  it('shows no-results when the search returns an empty list', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (String(url).includes('csrf-token')) {
        return Promise.resolve({ ok: true, json: async () => ({ token: 't', signature: 's' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ results: [] }) });
    });
    render(<WebSearchCard query="nothing" />);
    expect(await screen.findByText('No results found.')).toBeInTheDocument();
  });

  it('shows no-results when the search endpoint responds with HTTP 500', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (String(url).includes('csrf-token')) {
        return Promise.resolve({ ok: true, json: async () => ({ token: 't', signature: 's' }) });
      }
      return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
    });
    render(<WebSearchCard query="nothing" />);
    expect(await screen.findByText('No results found.')).toBeInTheDocument();
  });

  it('shows no-results when the search request fails', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (String(url).includes('csrf-token')) {
        return Promise.resolve({ ok: true, json: async () => ({ token: 't', signature: 's' }) });
      }
      return Promise.reject(new Error('net'));
    });
    render(<WebSearchCard query="nothing" />);
    expect(await screen.findByText('No results found.')).toBeInTheDocument();
  });

  it('proceeds without CSRF headers when the token fetch fails', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (String(url).includes('csrf-token')) {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ results: [] }) });
    });
    render(<WebSearchCard query="nothing" />);
    expect(await screen.findByText('No results found.')).toBeInTheDocument();
    const [, init] = (global.fetch as jest.Mock).mock.calls[1];
    expect((init as RequestInit).headers).not.toHaveProperty('X-CSRF-Token');
  });

  it('does not set results after unmount', async () => {
    let resolveSearch: (v: unknown) => void = () => {};
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (String(url).includes('csrf-token')) {
        return Promise.resolve({ ok: true, json: async () => ({ token: 't', signature: 's' }) });
      }
      return new Promise((res) => {
        resolveSearch = res;
      });
    });
    const { unmount } = render(<WebSearchCard query="x" />);
    // Unmount first: the cleanup sets cancelled = true while the async chain
    // is still awaiting the csrf token.
    await act(async () => {
      unmount();
    });
    // Let the async chain continue past the csrf await so the search fetch
    // starts (and captures resolveSearch) after unmount.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    // Resolving now must hit the cancelled guard and skip setResults.
    await act(async () => {
      resolveSearch({ ok: true, json: async () => ({ results: [] }) });
      await new Promise((r) => setTimeout(r, 0));
    });
  });

  it('skips the empty-results fallback when unmounted before the search rejects', async () => {
    let rejectSearch: (v: unknown) => void = () => {};
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (String(url).includes('csrf-token')) {
        return Promise.resolve({ ok: true, json: async () => ({ token: 't', signature: 's' }) });
      }
      return new Promise((_, rej) => {
        rejectSearch = rej;
      });
    });
    const { unmount } = render(<WebSearchCard query="x" />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    unmount();
    await act(async () => {
      rejectSearch(new Error('late net'));
      await new Promise((r) => setTimeout(r, 0));
    });
  });
});

describe('ArtifactCanvas', () => {
  const htmlArtifact = { type: 'html', content: '<h1>Hello</h1>' };
  const reactArtifact = { type: 'react', content: 'function App(){return null}' };
  const codeArtifact = { type: 'code', content: 'const x = 1;' };
  const markdownArtifact = { type: 'markdown', content: '# Doc' };

  it('previews an html artifact in a sandboxed iframe', () => {
    render(<ArtifactCanvas artifact={htmlArtifact as never} />);
    expect(screen.getByText('HTML')).toBeInTheDocument();
    const iframe = document.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe).not.toBeNull();
    expect(iframe.getAttribute('srcdoc')).toBe('<h1>Hello</h1>');
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts');
  });

  it('toggles an html artifact to code view', () => {
    render(<ArtifactCanvas artifact={htmlArtifact as never} />);
    fireEvent.click(screen.getByTitle('Code'));
    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.getByText('<h1>Hello</h1>')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Preview'));
    expect(document.querySelector('iframe')).not.toBeNull();
  });

  it('builds a react bootstrap srcDoc for react artifacts', () => {
    render(<ArtifactCanvas artifact={reactArtifact as never} />);
    expect(screen.getByText('React')).toBeInTheDocument();
    const iframe = document.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe.getAttribute('srcdoc')).toContain('unpkg.com/react@18');
    expect(iframe.getAttribute('srcdoc')).toContain('function App(){return null}');
  });

  it('renders code artifacts directly without preview buttons', () => {
    render(<ArtifactCanvas artifact={codeArtifact as never} />);
    expect(screen.getByText('code')).toBeInTheDocument();
    expect(screen.getByText('const x = 1;')).toBeInTheDocument();
    expect(screen.queryByTitle('Preview')).toBeNull();
    expect(screen.queryByTitle('Code')).toBeNull();
    expect(screen.getByTitle('Copy')).toBeInTheDocument();
  });

  it('renders markdown artifacts as code', () => {
    render(<ArtifactCanvas artifact={markdownArtifact as never} />);
    expect(screen.getByText('markdown')).toBeInTheDocument();
    expect(screen.getByText('# Doc')).toBeInTheDocument();
  });

  it('copies the artifact content and shows the check for 2s', () => {
    jest.useFakeTimers();
    render(<ArtifactCanvas artifact={codeArtifact as never} />);
    fireEvent.click(screen.getByTitle('Copy'));
    expect(clipboardWrite).toHaveBeenCalledWith('const x = 1;');
    expect(screen.getByText('check-icon')).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getByText('copy-icon')).toBeInTheDocument();
    jest.useRealTimers();
  });
});
