'use client';

import React, { useState, useEffect } from 'react';
import { ExternalLink } from 'lucide-react';

interface Preview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

interface Props {
  url: string;
  isOwn: boolean;
}

export function LinkPreview({ url, isOwn }: Props) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/chat/link-preview?url=${encodeURIComponent(url)}`)
      .then((r) => r.json() as Promise<Preview>)
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (loading || error || (!preview?.title && !preview?.image)) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block mt-2 rounded-xl overflow-hidden border transition-all duration-200 hover:opacity-80 hover:scale-[1.01] w-full max-w-[200px] xs:max-w-[220px] sm:max-w-[240px]"
      style={{ borderColor: isOwn ? 'var(--chat-own-inset-border)' : 'var(--border)' }}
    >
      {preview?.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview.image}
          alt={preview.title ?? ''}
          className="w-full h-32 object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      )}
      <div
        className="px-3 py-2"
        style={{ background: isOwn ? 'var(--chat-own-inset)' : 'var(--background-subtle)' }}
      >
        {preview?.siteName && (
          <p
            className="sm:text-[9px] text-[10px] font-medium uppercase tracking-wide mb-0.5 flex items-center gap-1"
            style={{
              color: isOwn ? 'var(--chat-own-contrast)' : 'var(--text-disabled)',
              opacity: isOwn ? 0.6 : 1,
            }}
          >
            <ExternalLink className="sm:w-2.5 sm:h-2.5 w-3 h-3" />
            {preview.siteName}
          </p>
        )}
        {preview?.title && (
          <p
            className="sm:text-xs text-sm font-semibold line-clamp-2"
            style={{ color: isOwn ? 'var(--chat-own-contrast)' : 'var(--text-primary)' }}
          >
            {preview.title}
          </p>
        )}
        {preview?.description && (
          <p
            className="sm:text-[10px] text-xs mt-0.5 line-clamp-2 opacity-70"
            style={{ color: isOwn ? 'var(--chat-own-contrast)' : 'var(--text-muted)' }}
          >
            {preview.description}
          </p>
        )}
      </div>
    </a>
  );
}

// Extract first URL from text
export function extractUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s]+/);
  return match ? match[0] : null;
}
