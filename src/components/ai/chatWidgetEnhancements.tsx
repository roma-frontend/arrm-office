'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Volume2, Copy, ThumbsUp, ThumbsDown, Pin, Check } from 'lucide-react';

// === TYPING STAGES ===
export function TypingStages() {
  const { t } = useTranslation();
  const stages = [
    t('chatWidget.thinking', { defaultValue: 'Analyzing...' }),
    t('chatWidget.stageThinking', { defaultValue: 'Thinking...' }),
    t('chatWidget.stageGenerating', { defaultValue: 'Generating...' }),
  ];
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setIdx((i) => (i + 1) % stages.length), 2000);
    return () => clearInterval(timer);
  }, [stages.length]);

  return (
    <span className="text-xs text-(--text-muted) transition-opacity duration-300">
      {stages[idx]}
    </span>
  );
}

// === MOOD GREETING ===
export function getMoodGreeting(
  name: string,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const hour = new Date().getHours();
  if (hour < 6)
    return t('chatWidget.moodNight', {
      name,
      defaultValue: `🌙 Still up, ${name}? Let me help you finish faster!`,
    });
  if (hour < 12)
    return t('chatWidget.moodMorning', {
      name,
      defaultValue: `☀️ Good morning, ${name}! How can I help today?`,
    });
  if (hour < 17)
    return t('chatWidget.moodDay', {
      name,
      defaultValue: `👋 Hey ${name}! What can I do for you?`,
    });
  if (hour < 21)
    return t('chatWidget.moodEvening', {
      name,
      defaultValue: `🌆 Good evening, ${name}! Need anything before wrapping up?`,
    });
  return t('chatWidget.moodLate', {
    name,
    defaultValue: `🌙 Working late, ${name}? Let's make it quick!`,
  });
}

// === CONTEXT-AWARE SUGGESTIONS ===
export function getContextSuggestions(
  pathname: string,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string[] {
  if (pathname.includes('/leaves'))
    return [
      t('chatWidget.ctx.leaveBalance', { defaultValue: '📋 My leave balance' }),
      t('chatWidget.ctx.bookTimeOff', { defaultValue: '📆 Book time off' }),
      t('chatWidget.ctx.whoOnLeave', { defaultValue: '👥 Who is on leave?' }),
    ];
  if (pathname.includes('/employees'))
    return [
      t('chatWidget.ctx.findEmployee', { defaultValue: '🔍 Find employee' }),
      t('chatWidget.ctx.addEmployee', { defaultValue: '➕ Add employee' }),
      t('chatWidget.ctx.teamStats', { defaultValue: '📊 Team stats' }),
    ];
  if (pathname.includes('/attendance'))
    return [
      t('chatWidget.ctx.myAttendance', { defaultValue: '⏰ My attendance today' }),
      t('chatWidget.ctx.monthlyReport', { defaultValue: '📊 Monthly report' }),
      t('chatWidget.ctx.checkAnomalies', { defaultValue: '🔍 Check anomalies' }),
    ];
  if (pathname.includes('/tasks'))
    return [
      t('chatWidget.ctx.myTasks', { defaultValue: '📋 My open tasks' }),
      t('chatWidget.ctx.createTask', { defaultValue: '➕ Create task' }),
      t('chatWidget.ctx.taskStats', { defaultValue: '📊 Task stats' }),
    ];
  if (pathname.includes('/analytics'))
    return [
      t('chatWidget.ctx.showTrends', { defaultValue: '📈 Show trends' }),
      t('chatWidget.ctx.headcount', { defaultValue: '👥 Headcount' }),
      t('chatWidget.ctx.leavePatterns', { defaultValue: '📊 Leave patterns' }),
    ];
  if (pathname.includes('/drivers'))
    return [
      t('chatWidget.ctx.bookDriver', { defaultValue: '🚗 Book a driver' }),
      t('chatWidget.ctx.availableDrivers', { defaultValue: '📅 Available drivers' }),
      t('chatWidget.ctx.myTrips', { defaultValue: '🗺️ My trips' }),
    ];
  if (pathname.includes('/payroll'))
    return [
      t('chatWidget.ctx.mySalary', { defaultValue: '💰 My salary' }),
      t('chatWidget.ctx.payrollReport', { defaultValue: '📊 Payroll report' }),
      t('chatWidget.ctx.nextPayday', { defaultValue: '📅 Next payday' }),
    ];
  return [];
}

// === SLASH COMMANDS ===
export interface SlashCommand {
  command: string;
  label: string;
  icon: string;
  description: string;
}

export function getSlashCommands(
  t: (key: string, opts?: Record<string, unknown>) => string,
): SlashCommand[] {
  return [
    {
      command: '/leave',
      label: 'Leave',
      icon: '📆',
      description: t('chatWidget.slash.leave', { defaultValue: 'Request time off' }),
    },
    {
      command: '/balance',
      label: 'Balance',
      icon: '📋',
      description: t('chatWidget.slash.balance', { defaultValue: 'Check leave balance' }),
    },
    {
      command: '/team',
      label: 'Team',
      icon: '👥',
      description: t('chatWidget.slash.team', { defaultValue: 'Who is on leave' }),
    },
    {
      command: '/tasks',
      label: 'Tasks',
      icon: '✅',
      description: t('chatWidget.slash.tasks', { defaultValue: 'My open tasks' }),
    },
    {
      command: '/attendance',
      label: 'Attendance',
      icon: '⏰',
      description: t('chatWidget.slash.attendance', { defaultValue: "Today's status" }),
    },
    {
      command: '/driver',
      label: 'Driver',
      icon: '🚗',
      description: t('chatWidget.slash.driver', { defaultValue: 'Book a driver' }),
    },
    {
      command: '/help',
      label: 'Help',
      icon: '❓',
      description: t('chatWidget.slash.help', { defaultValue: 'Show all commands' }),
    },
    {
      command: '/clear',
      label: 'Clear',
      icon: '🗑️',
      description: t('chatWidget.slash.clear', { defaultValue: 'Clear chat history' }),
    },
  ];
}

export function filterSlashCommands(
  input: string,
  t: (key: string, opts?: Record<string, unknown>) => string,
): SlashCommand[] {
  if (!input.startsWith('/')) return [];
  const commands = getSlashCommands(t);
  const query = input.slice(1).toLowerCase();
  if (!query) return commands;
  return commands.filter(
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
