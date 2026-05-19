'use client';

import { useState, useEffect, useCallback } from 'react';
import { Volume2, Copy, ThumbsUp, ThumbsDown, Pin, Check } from 'lucide-react';

// === TYPING STAGES ===
export function TypingStages() {
  const stages = ['Analyzing...', 'Thinking...', 'Generating...'];
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setIdx((i) => (i + 1) % stages.length), 2000);
    return () => clearInterval(timer);
  }, []);

  return (
    <span className="text-xs text-(--text-muted) transition-opacity duration-300">
      {stages[idx]}
    </span>
  );
}

// === MOOD GREETING ===
export function getMoodGreeting(name: string): string {
  const hour = new Date().getHours();
  if (hour < 6) return `🌙 Still up, ${name}? Let me help you finish faster!`;
  if (hour < 12) return `☀️ Good morning, ${name}! How can I help today?`;
  if (hour < 17) return `👋 Hey ${name}! What can I do for you?`;
  if (hour < 21) return `🌆 Good evening, ${name}! Need anything before wrapping up?`;
  return `🌙 Working late, ${name}? Let's make it quick!`;
}

// === CONTEXT-AWARE SUGGESTIONS ===
export function getContextSuggestions(pathname: string): string[] {
  if (pathname.includes('/leaves'))
    return ['📋 My leave balance', '📆 Book time off', '👥 Who is on leave?'];
  if (pathname.includes('/employees'))
    return ['🔍 Find employee', '➕ Add employee', '📊 Team stats'];
  if (pathname.includes('/attendance'))
    return ['⏰ My attendance today', '📊 Monthly report', '🔍 Check anomalies'];
  if (pathname.includes('/tasks')) return ['📋 My open tasks', '➕ Create task', '📊 Task stats'];
  if (pathname.includes('/analytics'))
    return ['📈 Show trends', '👥 Headcount', '📊 Leave patterns'];
  if (pathname.includes('/drivers'))
    return ['🚗 Book a driver', '📅 Available drivers', '🗺️ My trips'];
  if (pathname.includes('/chat'))
    return ['💬 Unread messages', '👥 Online colleagues', '📎 Shared files'];
  if (pathname.includes('/settings'))
    return ['🔒 Security settings', '🌐 Change language', '🔔 Notifications'];
  if (pathname.includes('/payroll')) return ['💰 My salary', '📊 Payroll report', '📅 Next payday'];
  return [];
}

// === SLASH COMMANDS ===
export interface SlashCommand {
  command: string;
  label: string;
  icon: string;
  description: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { command: '/leave', label: 'Leave', icon: '📆', description: 'Request time off' },
  { command: '/balance', label: 'Balance', icon: '📋', description: 'Check leave balance' },
  { command: '/team', label: 'Team', icon: '👥', description: 'Who is on leave' },
  { command: '/tasks', label: 'Tasks', icon: '✅', description: 'My open tasks' },
  { command: '/attendance', label: 'Attendance', icon: '⏰', description: "Today's status" },
  { command: '/driver', label: 'Driver', icon: '🚗', description: 'Book a driver' },
  { command: '/help', label: 'Help', icon: '❓', description: 'Show all commands' },
  { command: '/clear', label: 'Clear', icon: '🗑️', description: 'Clear chat history' },
];

export function filterSlashCommands(input: string): SlashCommand[] {
  if (!input.startsWith('/')) return [];
  const query = input.slice(1).toLowerCase();
  if (!query) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter(
    (c) => c.command.slice(1).startsWith(query) || c.label.toLowerCase().startsWith(query),
  );
}

// === MESSAGE REACTIONS & COPY ===
export function MessageActions({
  content,
  onPin,
  isPinned,
}: {
  content: string;
  onPin: () => void;
  isPinned?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [reaction, setReaction] = useState<'up' | 'down' | null>(null);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  return (
    <div className="flex items-center gap-0.5 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        onClick={() => setReaction(reaction === 'up' ? null : 'up')}
        className={`p-1 rounded hover:bg-(--background-subtle) ${reaction === 'up' ? 'text-green-500' : 'text-(--text-muted)'}`}
        title="Helpful"
      >
        <ThumbsUp className="w-3 h-3" />
      </button>
      <button
        onClick={() => setReaction(reaction === 'down' ? null : 'down')}
        className={`p-1 rounded hover:bg-(--background-subtle) ${reaction === 'down' ? 'text-red-500' : 'text-(--text-muted)'}`}
        title="Not helpful"
      >
        <ThumbsDown className="w-3 h-3" />
      </button>
      <button
        onClick={handleCopy}
        className="p-1 rounded hover:bg-(--background-subtle) text-(--text-muted)"
        title="Copy"
      >
        {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
      </button>
      <button
        onClick={onPin}
        className={`p-1 rounded hover:bg-(--background-subtle) ${isPinned ? 'text-[#2563eb]' : 'text-(--text-muted)'}`}
        title="Pin"
      >
        <Pin className="w-3 h-3" />
      </button>
      <TTSButton content={content} />
    </div>
  );
}

// === TEXT-TO-SPEECH ===
function TTSButton({ content }: { content: string }) {
  const [speaking, setSpeaking] = useState(false);

  const handleTTS = useCallback(() => {
    if (speaking) {
      speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(
      content.replace(/<[^>]*>/g, '').replace(/[*_#`]/g, ''),
    );
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    speechSynthesis.speak(utterance);
    setSpeaking(true);
  }, [content, speaking]);

  return (
    <button
      onClick={handleTTS}
      className={`p-1 rounded hover:bg-(--background-subtle) ${speaking ? 'text-[#2563eb] animate-pulse' : 'text-(--text-muted)'}`}
      title="Read aloud"
    >
      <Volume2 className="w-3 h-3" />
    </button>
  );
}

// === SLASH COMMAND DROPDOWN ===
export function SlashCommandDropdown({
  commands,
  onSelect,
}: {
  commands: SlashCommand[];
  onSelect: (cmd: string) => void;
}) {
  if (commands.length === 0) return null;
  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 rounded-xl border border-(--border) bg-(--card) shadow-lg overflow-hidden max-h-48 overflow-y-auto z-50">
      {commands.map((cmd) => (
        <button
          key={cmd.command}
          onClick={() => onSelect(cmd.command)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-(--background-subtle) transition-colors"
        >
          <span className="text-sm">{cmd.icon}</span>
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium text-(--text-primary)">{cmd.command}</span>
            <span className="text-[10px] text-(--text-muted) ml-2">{cmd.description}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

// === PINNED RESPONSES ===
const PINNED_KEY = 'hr-chat-pinned';

export function getPinnedMessages(): { id: string; content: string; pinnedAt: number }[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(PINNED_KEY) || '[]');
  } catch {
    return [];
  }
}

export function togglePinMessage(id: string, content: string): boolean {
  const pinned = getPinnedMessages();
  const exists = pinned.find((p) => p.id === id);
  if (exists) {
    localStorage.setItem(PINNED_KEY, JSON.stringify(pinned.filter((p) => p.id !== id)));
    return false;
  }
  pinned.push({ id, content, pinnedAt: Date.now() });
  localStorage.setItem(PINNED_KEY, JSON.stringify(pinned.slice(-20))); // max 20
  return true;
}
