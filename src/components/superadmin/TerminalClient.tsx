/**
 * Superadmin Terminal — the operator's command console, rendered with a
 * terminal look: dark surface, monospace font, green prompt, Tab
 * autocomplete, ↑/↓ history, colored output (green ok / yellow warning /
 * red error). Every command runs through the whitelisted registry on the
 * backend (`superadmin.terminal`) — nothing here ever executes arbitrary
 * code, so this is safe to ship in production.
 *
 * Read commands evaluate through a Convex query driven by a `pendingInput`
 * cell; write commands call the mutation directly. Layout: a panel in the hub
 * (own scroll) plus a fullscreen overlay for long sessions — same portal
 * pattern as the Data Browser.
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { Maximize2, Minimize2, TerminalSquare, X } from 'lucide-react';

import { api } from '@/convex/_generated/api';
import { cn } from '@/lib/utils';

interface OutputLine {
  text: string;
  /** 'ok' | 'warn' | 'err' | 'dim' | 'info' — drives the color. */
  tone: 'ok' | 'warn' | 'err' | 'dim' | 'info';
}

interface HistoryEntry {
  input: string;
  lines: OutputLine[];
  exitCode: 0 | 1 | 2;
}

const PROMPT = 'superadmin@strata:~$';

/** Turn a plain backend response into colored lines. */
function toLines(lines: string[], exitCode: 0 | 1 | 2): OutputLine[] {
  const base: OutputLine['tone'] = exitCode === 1 ? 'err' : exitCode === 2 ? 'warn' : 'ok';
  return lines.map((text) => {
    if (text === '') return { text, tone: 'dim' };
    if (text.startsWith('  ')) return { text, tone: 'dim' };
    if (text.length < 40 && /^[A-Z ]+$/.test(text)) return { text, tone: 'info' };
    return { text, tone: base };
  });
}

const WELCOME: HistoryEntry = {
  input: 'help',
  lines: [
    { text: 'Strata operator console', tone: 'info' },
    { text: 'Type "help" for commands. Tab autocompletes, ↑/↓ walks history.', tone: 'dim' },
    { text: 'Run "health" to check the platform, "tables" for the schema.', tone: 'dim' },
  ],
  exitCode: 0,
};

export function TerminalClient({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation();
  const commands = useQuery(api.superadmin.terminal.listCommands);
  const runCommand = useMutation(api.superadmin.terminal.runCommand);

  const [entries, setEntries] = useState<HistoryEntry[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the terminal scrolled to the latest output.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, fullscreen]);

  const commandNames = useMemo(() => (commands ?? []).map((c) => c.name), [commands]);

  /** Append an entry and push it into history. */
  const appendEntry = (input: string, lines: OutputLine[], exitCode: 0 | 1 | 2) => {
    setEntries((prev) => [...prev, { input, lines, exitCode }]);
    if (input) setHistory((prev) => [input, ...prev].slice(0, 100));
    setHistoryIdx(-1);
  };

  /** Evaluate a command — read via query, write via mutation. */
  const execute = async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const name = trimmed.split(/\s+/)[0] ?? '';

    if (name === 'clear') {
      setEntries([]);
      setInput('');
      return;
    }
    if (name === 'history') {
      appendEntry(
        'history',
        [
          ...(history.length === 0
            ? [{ text: 'No commands yet', tone: 'dim' as const }]
            : history.slice(0, 50).map((h, i) => ({
                text: `${String(history.length - i).padStart(3)}  ${h}`,
                tone: 'dim' as const,
              }))),
        ],
        0,
      );
      return;
    }

    setBusy(true);
    try {
      const result = await runCommand({ input: trimmed });
      appendEntry(trimmed, toLines(result.lines, result.exitCode), result.exitCode);
    } catch (error) {
      appendEntry(
        trimmed,
        [{ text: error instanceof Error ? error.message : String(error), tone: 'err' }],
        1,
      );
    } finally {
      setBusy(false);
      setInput('');
      setSuggestion(null);
    }
  };

  /** Tab autocomplete — complete the command word or list candidates. */
  const handleTab = () => {
    const parts = input.split(/\s+/);
    if (parts.length > 1) return; // only autocomplete the command word
    const partial = parts[0] ?? '';
    const matches = commandNames.filter((name) => name.startsWith(partial));
    if (matches.length === 1) {
      setInput(matches[0] ?? '');
      setSuggestion(null);
    } else if (matches.length > 1) {
      setEntries((prev) => [
        ...prev,
        {
          input: '',
          lines: matches.map((m) => ({ text: m, tone: 'dim' as const })),
          exitCode: 0,
        },
      ]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      handleTab();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      void execute(input);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const next = Math.min(historyIdx + 1, history.length - 1);
      setHistoryIdx(next);
      setInput(history[next] ?? '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx <= 0) {
        setHistoryIdx(-1);
        setInput('');
      } else {
        const next = historyIdx - 1;
        setHistoryIdx(next);
        setInput(history[next] ?? '');
      }
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      setEntries([]);
    }
  };

  const focusInput = () => inputRef.current?.focus();

  const panel = (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-(--border) bg-(--card)"
      onClick={focusInput}
    >
      {/* Terminal header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-(--border)/60 bg-(--surface-2) px-3 py-2">
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[11px] text-(--text-muted)">
          <TerminalSquare className="h-3.5 w-3.5" />
          {t('superadmin.terminal.title', 'Operator console')}
        </span>
        {!embedded && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setFullscreen((f) => !f);
            }}
            className="ml-auto rounded-md p-1 text-(--text-muted) transition-colors hover:bg-(--background-subtle) hover:text-(--text-primary)"
            aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {fullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>

      {/* Output */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-2 font-mono text-[12.5px] leading-relaxed"
      >
        {entries.map((entry, i) => (
          <div key={i}>
            <div className="flex items-center gap-2 text-(--success-text)">
              <span className="shrink-0 select-none">{PROMPT}</span>
              <span className="break-all text-(--text-primary)">{entry.input}</span>
            </div>
            {entry.lines.map((line, j) => (
              <div
                key={j}
                className={cn(
                  'whitespace-pre-wrap break-words',
                  line.tone === 'ok' && 'text-(--success-text)',
                  line.tone === 'warn' && 'text-(--warning-text)',
                  line.tone === 'err' && 'text-(--danger-text)',
                  line.tone === 'dim' && 'text-(--text-muted)',
                  line.tone === 'info' && 'text-(--brand-text)',
                )}
              >
                {line.text || '\u00A0'}
              </div>
            ))}
          </div>
        ))}
        {busy && (
          <div className="mt-1 flex items-center gap-1 text-(--text-muted)">
            <span className="inline-block size-2 animate-pulse rounded-full bg-(--brand-text)" />
            running…
          </div>
        )}
      </div>

      {/* Input line */}
      <div className="flex shrink-0 items-center gap-2 border-t border-(--border)/60 bg-(--surface-2) px-3 py-2">
        <span className="shrink-0 select-none font-mono text-[12.5px] text-(--success-text)">
          {PROMPT}
        </span>
        <div className="relative min-w-0 flex-1">
          {suggestion && (
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center font-mono text-[12.5px] text-(--text-muted)/40">
              {suggestion}
            </div>
          )}
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setSuggestion(null);
            }}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            className="w-full bg-transparent font-mono text-[12.5px] text-(--text-primary) caret-(--success-text) outline-none placeholder:text-(--text-muted)/40"
            placeholder={t('superadmin.terminal.placeholder', 'Type a command — try "help"')}
            aria-label="Terminal input"
          />
        </div>
      </div>
    </div>
  );

  if (fullscreen) {
    return createPortal(
      <div className="fixed inset-0 z-[200] flex flex-col overflow-hidden bg-(--background) p-3 sm:p-6">
        <div className="flex shrink-0 items-center justify-between pb-3">
          <div className="flex items-center gap-2 font-mono text-sm text-(--text-primary)">
            <TerminalSquare className="h-4 w-4 text-(--success-text)" />
            {t('superadmin.terminal.title', 'Operator console')}
          </div>
          <button
            type="button"
            onClick={() => setFullscreen(false)}
            className="rounded-lg border border-(--border) bg-(--background-subtle) p-2 text-(--text-muted) transition-colors hover:text-(--text-primary)"
            aria-label="Exit fullscreen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1">{panel}</div>
      </div>,
      document.body,
    );
  }

  return panel;
}

export default TerminalClient;
