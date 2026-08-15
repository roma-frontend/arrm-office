'use client';

import { useEffect, useState, useCallback } from 'react';
import { BookOpen, Globe, Copy, Check, Code, Eye, ImageIcon, Loader2 } from 'lucide-react';
import type { WebSearchResult, MessageArtifact } from './chatWidgetTypes';

async function getCsrfPair(): Promise<{ token: string; signature: string } | null> {
  try {
    const r = await fetch('/api/csrf-token', { method: 'GET' });
    if (!r.ok) return null;
    return (await r.json()) as { token: string; signature: string };
  } catch {
    return null;
  }
}

/** RAG citation chips rendered under an assistant message. */
export function SourcesChips({ sources }: { sources: string[] }) {
  if (!sources.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2">
      <BookOpen className="w-3 h-3 text-(--text-muted) shrink-0" />
      {sources.map((label, i) => (
        <span
          key={`${label}-${i}`}
          className="px-2 py-0.5 rounded-full border border-(--border) bg-(--background-subtle) text-[10px] text-(--text-muted)"
          title={label}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

/** Generated image card: resolves the <IMAGE> prompt via /api/chat/image. */
export function GeneratedImageCard({ prompt }: { prompt: string }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const csrf = await getCsrfPair();
      try {
        const res = await fetch('/api/chat/image', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(csrf
              ? { 'X-CSRF-Token': csrf.token, 'X-CSRF-Token-Signature': csrf.signature }
              : {}),
          },
          body: JSON.stringify({ prompt }),
        });
        if (!res.ok) throw new Error('image failed');
        const data = (await res.json()) as { imageUrl: string };
        if (!cancelled) setImageUrl(data.imageUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prompt]);

  if (failed) return null;
  if (!imageUrl) {
    return (
      <div className="mt-2 rounded-xl border border-(--border) bg-(--background-subtle) p-4 flex items-center gap-2 text-xs text-(--text-muted)">
        <Loader2 className="w-4 h-4 animate-spin" />
        <ImageIcon className="w-4 h-4" />
        Generating image…
      </div>
    );
  }
  return (
    <div className="mt-2 rounded-xl overflow-hidden border border-(--border)">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt={prompt} className="w-full max-h-80 object-cover" loading="lazy" />
    </div>
  );
}

/** Web search card: resolves the <WEB_SEARCH> query via /api/chat/web-search. */
export function WebSearchCard({ query }: { query: string }) {
  const [results, setResults] = useState<WebSearchResult[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const csrf = await getCsrfPair();
      try {
        const res = await fetch('/api/chat/web-search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(csrf
              ? { 'X-CSRF-Token': csrf.token, 'X-CSRF-Token-Signature': csrf.signature }
              : {}),
          },
          body: JSON.stringify({ query }),
        });
        if (!res.ok) throw new Error('search failed');
        const data = (await res.json()) as { results: WebSearchResult[] };
        if (!cancelled) setResults(data.results);
      } catch {
        if (!cancelled) setResults([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query]);

  return (
    <div className="mt-2 rounded-xl border border-(--border) bg-(--background-subtle) p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium text-(--text-primary)">
        <Globe className="w-3.5 h-3.5 text-(--brand-text)" />
        {query}
      </div>
      {results === null ? (
        <div className="flex items-center gap-2 text-xs text-(--text-muted)">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching…
        </div>
      ) : results.length === 0 ? (
        <p className="text-xs text-(--text-muted)">No results found.</p>
      ) : (
        <div className="space-y-1.5">
          {results.slice(0, 4).map((r, i) => (
            <a
              key={`${r.url}-${i}`}
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg border border-(--border) bg-(--card) p-2 hover:border-(--brand)/40 transition-colors"
            >
              <p className="text-xs font-medium text-(--text-primary) truncate">{r.title}</p>
              <p className="text-[10px] text-(--text-muted) line-clamp-2">{r.snippet}</p>
              <p className="text-[10px] text-(--brand-text) truncate">{r.source}</p>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Artifact renderer: sandboxed iframe preview for html/react artifacts,
 * code view for code/markdown. Preview/code toggle + copy.
 */
export function ArtifactCanvas({ artifact }: { artifact: MessageArtifact }) {
  const [mode, setMode] = useState<'preview' | 'code'>(
    artifact.type === 'html' || artifact.type === 'react' ? 'preview' : 'code',
  );
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [artifact.content]);

  const srcDoc =
    artifact.type === 'html'
      ? artifact.content
      : artifact.type === 'react'
        ? `<!DOCTYPE html>
<html>
<head>
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<style>body{font-family:system-ui,sans-serif;margin:1rem}</style>
</head>
<body>
<div id="root"></div>
<script type="text/babel" data-presets="react">
${artifact.content}
const __C = typeof App !== 'undefined' ? App : typeof Component !== 'undefined' ? Component : null;
if (__C) ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(__C));
</script>
</body>
</html>`
        : '';

  const typeLabel =
    artifact.type === 'html' ? 'HTML' : artifact.type === 'react' ? 'React' : artifact.type;

  return (
    <div className="mt-2 rounded-xl border border-(--border) overflow-hidden">
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-(--border) bg-(--background-subtle)">
        <Code className="w-3 h-3 text-(--text-muted)" />
        <span className="text-[10px] font-medium text-(--text-muted) mr-auto">{typeLabel}</span>
        {(artifact.type === 'html' || artifact.type === 'react') && (
          <>
            <button
              onClick={() => setMode('preview')}
              className={`p-1 rounded ${mode === 'preview' ? 'text-(--brand-text) bg-(--brand)/10' : 'text-(--text-muted)'}`}
              title="Preview"
            >
              <Eye className="w-3 h-3" />
            </button>
            <button
              onClick={() => setMode('code')}
              className={`p-1 rounded ${mode === 'code' ? 'text-(--brand-text) bg-(--brand)/10' : 'text-(--text-muted)'}`}
              title="Code"
            >
              <Code className="w-3 h-3" />
            </button>
          </>
        )}
        <button onClick={copy} className="p-1 rounded text-(--text-muted)" title="Copy">
          {copied ? (
            <Check className="w-3 h-3 text-(--success-text)" />
          ) : (
            <Copy className="w-3 h-3" />
          )}
        </button>
      </div>
      {mode === 'preview' && srcDoc ? (
        <iframe
          srcDoc={srcDoc}
          sandbox="allow-scripts"
          className="w-full h-64 bg-white"
          title="Artifact preview"
        />
      ) : (
        <pre className="p-3 text-[11px] leading-relaxed overflow-auto max-h-64 bg-(--background) text-(--text-primary)">
          {artifact.content}
        </pre>
      )}
    </div>
  );
}
