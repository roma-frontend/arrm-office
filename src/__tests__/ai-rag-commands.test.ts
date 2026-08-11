/**
 * Tests for the assistant RAG (src/lib/ai/rag.ts), slash commands / quick
 * actions (src/lib/ai/commands.ts) and prompt extensions
 * (src/lib/ai/promptExtensions.ts).
 */

import {
  tokenize,
  stemWord,
  searchChunks,
  retrieveDocs,
  formatKnowledgeSection,
  sourceLabels,
  getDocIndex,
  type DocChunk,
} from '@/lib/ai/rag';
import {
  buildSlashCommands,
  parseSlashQuery,
  filterCommands,
  quickActionPrompt,
  pushInputHistory,
} from '@/lib/ai/commands';
import { buildPromptExtensions } from '@/lib/ai/promptExtensions';

describe('tokenize', () => {
  it('lowercases, splits and drops stopwords', () => {
    expect(tokenize('How do I book a leave?')).toEqual(['book', 'leave']);
  });

  it('handles cyrillic text', () => {
    expect(tokenize('как взять отпуск')).toEqual(['взять', 'отпуск']);
  });

  it('returns [] for empty input', () => {
    expect(tokenize('')).toEqual([]);
  });
});

describe('stemWord', () => {
  it('strips inflectional endings', () => {
    expect(stemWord('отпуска')).toBe('отпуск');
    expect(stemWord('drivers')).toBe('driver');
  });

  it('keeps short words intact', () => {
    expect(stemWord('я')).toBe('я');
    expect(stemWord('days')).toBe('day');
  });
});

describe('searchChunks', () => {
  const chunks: DocChunk[] = [
    {
      docId: 'a',
      docTitle: 'Leave policy',
      section: 'Leave policy',
      text: 'Employees can book paid leave with a balance check.',
      keywords: 'отпуск leave vacation баланс',
      roles: ['employee'],
    },
    {
      docId: 'b',
      docTitle: 'Billing',
      section: 'Billing',
      text: 'Stripe plans and MRR.',
      keywords: 'billing stripe тариф',
      roles: ['superadmin'],
    },
  ];

  it('ranks keyword hits above body hits', () => {
    const hits = searchChunks(chunks, 'отпуск баланс');
    expect(hits[0]?.docId).toBe('a');
  });

  it('returns [] below the relevance floor', () => {
    expect(searchChunks(chunks, 'zzz qqq')).toEqual([]);
  });
});

describe('retrieveDocs (role-gated)', () => {
  it('finds leave policy for employees', () => {
    const hits = retrieveDocs('сколько у меня осталось дней отпуска', 'employee');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.roles.includes('employee'))).toBe(true);
  });

  it('never returns superadmin-only billing knowledge to employees', () => {
    const hits = retrieveDocs('тарифы stripe mrr billing план цена', 'employee');
    expect(hits.every((h) => !h.docTitle.toLowerCase().includes('billing'))).toBe(true);
  });

  it('returns billing knowledge to superadmin', () => {
    const hits = retrieveDocs('какие тарифы и цены на планы stripe', 'superadmin');
    expect(hits.some((h) => h.docId === 'platform-billing')).toBe(true);
  });

  it('covers the whole index with role metadata', () => {
    for (const chunk of getDocIndex()) {
      expect(chunk.roles.length).toBeGreaterThan(0);
      expect(chunk.text.length).toBeGreaterThan(0);
    }
  });
});

describe('formatKnowledgeSection / sourceLabels', () => {
  it('builds a numbered knowledge block', () => {
    const hits = retrieveDocs('как оформить отпуск', 'employee');
    const section = formatKnowledgeSection(hits);
    expect(section).toContain('KNOWLEDGE BASE');
    expect(section).toContain('[1] SOURCE:');
  });

  it('returns empty string without hits', () => {
    expect(formatKnowledgeSection([])).toBe('');
  });

  it('dedupes citation labels', () => {
    const hits = retrieveDocs('отпуск отпуск отпуск', 'employee');
    const labels = sourceLabels(hits);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('slash commands', () => {
  const labels = {
    routes: { '/leaves': 'Мои отпуска', '/calendar': 'Календарь' } as Record<string, string>,
    newChat: 'Новый чат',
    clearChat: 'Очистить чат',
    memory: 'Память',
    openVerb: 'Открыть',
  };

  it('builds role-scoped commands (an employee gets no management routes)', () => {
    const cmds = buildSlashCommands('employee', labels);
    expect(cmds.some((c) => c.value === '/leaves')).toBe(true);
    // The employee directory is visible to every role in this product, so it is
    // offered; payroll and analytics are not.
    expect(cmds.some((c) => c.value === '/employees')).toBe(true);
    expect(cmds.some((c) => c.value === '/payroll')).toBe(false);
    expect(cmds.some((c) => c.value === '/analytics')).toBe(false);
    expect(cmds.some((c) => c.kind === 'new')).toBe(true);
    expect(cmds.some((c) => c.kind === 'memory')).toBe(true);
  });

  it('a driver gets the driver console as a command', () => {
    const cmds = buildSlashCommands('driver', labels);
    expect(cmds.some((c) => c.value === '/drivers')).toBe(true);
    expect(cmds.some((c) => c.value === '/analytics')).toBe(false);
  });

  it('admin gets admin routes as commands', () => {
    const cmds = buildSlashCommands('admin', labels);
    expect(cmds.some((c) => c.value === '/recruitment')).toBe(true);
  });

  it('parseSlashQuery is active only for a single /token', () => {
    expect(parseSlashQuery('/lea')).toEqual({ active: true, query: 'lea' });
    expect(parseSlashQuery('/')).toEqual({ active: true, query: '' });
    expect(parseSlashQuery('/leaves now')).toEqual({ active: false, query: '' });
    expect(parseSlashQuery('hello')).toEqual({ active: false, query: '' });
  });

  it('filterCommands fuzzy-matches every token', () => {
    const cmds = buildSlashCommands('employee', labels);
    const filtered = filterCommands(cmds, 'календарь');
    expect(filtered.some((c) => c.value === '/calendar')).toBe(true);
    expect(filterCommands(cmds, 'zzz')).toEqual([]);
  });
});

describe('quickActionPrompt', () => {
  it('returns locale-specific prompts', () => {
    expect(quickActionPrompt('shorter', 'ru')).toContain('Сократи');
    expect(quickActionPrompt('shorter', 'en')).toContain('shorter');
    expect(quickActionPrompt('translate', 'ru')).toContain('английский');
    expect(quickActionPrompt('translate', 'en')).toContain('Russian');
  });

  it('covers every action in every locale', () => {
    for (const locale of ['en', 'ru', 'hy'] as const) {
      for (const action of ['shorter', 'longer', 'simplify', 'translate', 'continue'] as const) {
        expect(quickActionPrompt(action, locale).length).toBeGreaterThan(5);
      }
    }
  });
});

describe('pushInputHistory', () => {
  it('dedupes and caps the ring', () => {
    let history: string[] = [];
    history = pushInputHistory(history, 'a');
    history = pushInputHistory(history, 'b');
    history = pushInputHistory(history, 'a');
    expect(history).toEqual(['b', 'a']);
    expect(pushInputHistory([], '  ')).toEqual([]);
    const capped = Array.from({ length: 60 }, (_, i) => `m${i}`).reduce(
      (acc, m) => pushInputHistory(acc, m),
      [] as string[],
    );
    expect(capped).toHaveLength(50);
  });
});

describe('buildPromptExtensions', () => {
  it('injects memories and knowledge', () => {
    const out = buildPromptExtensions({
      role: 'employee',
      memories: ['Prefers short answers'],
      knowledge: 'KNOWLEDGE BASE\n[1] SOURCE: X',
    });
    expect(out).toContain('WHAT YOU KNOW ABOUT THIS USER');
    expect(out).toContain('Prefers short answers');
    expect(out).toContain('KNOWLEDGE BASE');
  });

  it('includes the role NAVIGATE allow-list', () => {
    const employee = buildPromptExtensions({ role: 'employee', memories: [], knowledge: '' });
    expect(employee).toContain('/leaves');
    expect(employee).not.toContain('/superadmin');
    const superadmin = buildPromptExtensions({ role: 'superadmin', memories: [], knowledge: '' });
    expect(superadmin).toContain('/superadmin');
  });

  it('documents the tag protocol', () => {
    const out = buildPromptExtensions({ role: 'employee', memories: [], knowledge: '' });
    expect(out).toContain('<REMEMBER>');
    expect(out).toContain('<SUGGEST>');
    expect(out).toContain('<IMAGE>');
    expect(out).toContain('<WEB_SEARCH>');
    expect(out).toContain('<ARTIFACT');
  });

  it('omits generative instructions when disabled', () => {
    const out = buildPromptExtensions({
      role: 'employee',
      memories: [],
      knowledge: '',
      allowGenerative: false,
    });
    expect(out).not.toContain('<IMAGE>');
    expect(out).toContain('<REMEMBER>');
  });
});
