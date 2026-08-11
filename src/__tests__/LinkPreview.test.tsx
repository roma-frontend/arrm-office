/**
 * Tests for src/components/chat/LinkPreview.tsx — the async link-card preview
 * and the extractUrl helper.
 */

import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';

jest.mock('lucide-react', () => ({
  ExternalLink: (props: any) => <span data-testid="external-link" {...props} />,
}));

import { LinkPreview, extractUrl } from '@/components/chat/LinkPreview';

const originalFetch = global.fetch;

function mockFetchOnce(payload: unknown, ok = true) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    json: async () => payload,
  }) as unknown as typeof fetch;
}

afterEach(() => {
  global.fetch = originalFetch;
});

describe('LinkPreview', () => {
  beforeEach(() => {
    mockFetchOnce({ url: 'https://example.com', title: 'Example', description: 'Desc' });
  });

  it('renders nothing while loading or on error', async () => {
    mockFetchOnce(null);
    const { container } = render(<LinkPreview url="https://example.com" isOwn={false} />);
    expect(container.firstChild).toBeNull();

    mockFetchOnce(null);
    const { container: errorContainer } = render(
      <LinkPreview url="https://error.example.com" isOwn={false} />,
    );
    await waitFor(() => expect(errorContainer.firstChild).toBeNull());
  });

  it('renders the fetched preview with title, description and site name', async () => {
    mockFetchOnce({
      url: 'https://example.com',
      title: 'Example title',
      description: 'Example description',
      siteName: 'Example Site',
      image: 'https://example.com/img.png',
    });
    render(<LinkPreview url="https://example.com" isOwn={false} />);

    expect(await screen.findByText('Example title')).toBeInTheDocument();
    expect(screen.getByText('Example description')).toBeInTheDocument();
    expect(screen.getByText('Example Site')).toBeInTheDocument();
    expect(screen.getByTestId('external-link')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.com');
    expect(screen.getByRole('link')).toHaveAttribute('target', '_blank');
  });

  it('stays hidden when the preview has neither title nor image', async () => {
    mockFetchOnce({ url: 'https://example.com', description: 'No title or image' });
    const { container } = render(<LinkPreview url="https://example.com" isOwn={false} />);
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it('hides the image when it fails to load', async () => {
    mockFetchOnce({ url: 'https://example.com', title: 'T', image: 'https://example.com/img.png' });
    render(<LinkPreview url="https://example.com" isOwn={false} />);

    const img = (await screen.findByAltText('T')) as HTMLImageElement;
    expect(img).toBeInTheDocument();
    fireEvent.error(img);
    expect(img.style.display).toBe('none');
  });

  it('renders nothing when the fetch rejects', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    const { container } = render(<LinkPreview url="https://error.example.com" isOwn={false} />);
    // The initial render is null because of loading, so flush the rejected
    // fetch's catch chain (setError(true) → error state) before asserting.
    await act(async () => {});
    await new Promise((r) => setTimeout(r, 0));
    expect(container.firstChild).toBeNull();
  });

  it('renders a title-only preview without image, site name or description', async () => {
    mockFetchOnce({ url: 'https://example.com', title: 'Just a title' });
    render(<LinkPreview url="https://example.com" isOwn={false} />);

    expect(await screen.findByText('Just a title')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByTestId('external-link')).toBeNull();
    expect(screen.queryByText('Example description')).toBeNull();
  });

  it('renders an image-only preview with an empty alt', async () => {
    mockFetchOnce({ url: 'https://example.com', image: 'https://example.com/img.png' });
    render(<LinkPreview url="https://example.com" isOwn={false} />);

    const img = (await screen.findByAltText('')) as HTMLImageElement;
    expect(img).toBeInTheDocument();
    // No title / description block below the image.
    expect(screen.queryByText('Just a title')).toBeNull();
  });

  it('renders own-message styling when isOwn is true', async () => {
    mockFetchOnce({
      url: 'https://example.com',
      title: 'Own title',
      description: 'Own desc',
      siteName: 'Own Site',
      image: 'https://example.com/own.png',
    });
    render(<LinkPreview url="https://example.com" isOwn={true} />);

    expect(await screen.findByText('Own title')).toBeInTheDocument();
    expect(screen.getByText('Own desc')).toBeInTheDocument();
    expect(screen.getByText('Own Site')).toBeInTheDocument();
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('ignores a late response after unmount', async () => {
    let resolveFetch!: (v: unknown) => void;
    global.fetch = jest
      .fn()
      .mockImplementation(() => new Promise((r) => (resolveFetch = r))) as unknown as typeof fetch;
    const { unmount } = render(<LinkPreview url="https://example.com" isOwn={false} />);

    unmount();
    resolveFetch({ ok: true, json: async () => ({ url: 'https://example.com', title: 'Late' }) });
    await act(async () => {});
    await new Promise((r) => setTimeout(r, 0));
    // No crash and no state update after unmount (cancelled guard).
    expect(screen.queryByText('Late')).toBeNull();
  });

  it('ignores a rejected response after unmount', async () => {
    let rejectFetch!: (v: unknown) => void;
    global.fetch = jest
      .fn()
      .mockImplementation(
        () => new Promise((_, rej) => (rejectFetch = rej)),
      ) as unknown as typeof fetch;
    const { unmount } = render(<LinkPreview url="https://example.com" isOwn={false} />);

    unmount();
    rejectFetch(new Error('late failure'));
    await act(async () => {});
    await new Promise((r) => setTimeout(r, 0));
    // The cancelled guard swallowed the error without a state update.
    expect(screen.queryByText('Late')).toBeNull();
  });

  it('requests the preview endpoint with the encoded URL', async () => {
    render(<LinkPreview url="https://example.com?a=1&b=2" isOwn={true} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/chat/link-preview?url=${encodeURIComponent('https://example.com?a=1&b=2')}`,
    );
  });
});

describe('extractUrl', () => {
  it('returns the first http(s) URL from text', () => {
    expect(extractUrl('see https://example.com/path now')).toBe('https://example.com/path');
    expect(extractUrl('plain http://a.b')).toBe('http://a.b');
  });

  it('returns null when no URL is present', () => {
    expect(extractUrl('no links here')).toBeNull();
    expect(extractUrl('')).toBeNull();
  });
});
