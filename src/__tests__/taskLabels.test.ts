/**
 * Tests for `@/lib/taskLabels` — status and priority label resolution.
 */
import { describe, it, expect } from '@jest/globals';
import {
  PRIORITY_META,
  TASK_PRIORITIES,
  isTaskPriority,
  priorityLabel,
  statusLabel,
  type TaskPriority,
} from '@/lib/taskLabels';
import { DEFAULT_STATUS_SET, type TaskStatusDef } from '../../convex/lib/taskStatus';

const t = ((key: string, fallback?: string) => {
  const translations: Record<string, string> = {
    'tasks.priority.low': 'Низкий',
    'tasks.priority.medium': 'Средний',
    'tasks.priority.high': 'Высокий',
    'tasks.priority.urgent': 'Срочный',
    'tasks.status.pending': 'Ожидает',
    'tasks.status.inProgress': 'В работе',
  };
  return translations[key] ?? fallback ?? key;
}) as any;

describe('PRIORITY_META', () => {
  it('has all 4 priorities', () => {
    expect(Object.keys(PRIORITY_META)).toHaveLength(4);
  });

  it.each(TASK_PRIORITIES)('has labelKey, fallback, color for %s', (p) => {
    const meta = PRIORITY_META[p];
    expect(meta.labelKey).toContain('tasks.priority.');
    expect(typeof meta.fallback).toBe('string');
    expect(typeof meta.color).toBe('string');
  });
});

describe('TASK_PRIORITIES', () => {
  it('is ordered low to high', () => {
    expect(TASK_PRIORITIES).toEqual(['low', 'medium', 'high', 'urgent']);
  });
});

describe('isTaskPriority', () => {
  it('accepts valid priorities', () => {
    expect(isTaskPriority('low')).toBe(true);
    expect(isTaskPriority('urgent')).toBe(true);
  });

  it('rejects invalid values', () => {
    expect(isTaskPriority('bogus')).toBe(false);
    expect(isTaskPriority('')).toBe(false);
    expect(isTaskPriority(42)).toBe(false);
  });
});

describe('priorityLabel', () => {
  it('translates known priority', () => {
    expect(priorityLabel(t, 'low')).toBe('Низкий');
    expect(priorityLabel(t, 'high')).toBe('Высокий');
  });

  it('falls back for unknown priority', () => {
    expect(priorityLabel(t, 'custom_level')).toBe('custom_level');
  });
});

describe('statusLabel', () => {
  it('translates status with labelKey', () => {
    const status = DEFAULT_STATUS_SET.find((s) => s.key === 'pending')!;
    expect(statusLabel(t, status)).toBe('Ожидает');
  });

  it('uses raw label for status without labelKey', () => {
    const custom: TaskStatusDef = {
      key: 'ready_to_pay',
      label: 'Ready to Pay',
      color: 'blue',
      type: 'active',
      order: 0,
    };
    expect(statusLabel(t, custom)).toBe('Ready to Pay');
  });
});
