/**
 * Tests for `@/lib/taskColors` — chip/dot/text classes for every status colour.
 */
import { describe, it, expect } from '@jest/globals';
import { TASK_COLOR_CLASSES, taskColorClasses, CHIP_BASE } from '@/lib/taskColors';

describe('TASK_COLOR_CLASSES', () => {
  const expectedColors = [
    'gray',
    'blue',
    'cyan',
    'green',
    'amber',
    'red',
    'pink',
    'violet',
    'purple',
  ] as const;

  it.each(expectedColors)('has chip, chipOutlined, text, dot for %s', (color) => {
    const cls = TASK_COLOR_CLASSES[color];
    expect(cls).toBeDefined();
    expect(cls.chip).toBeTruthy();
    expect(cls.chipOutlined).toContain('border');
    expect(cls.text).toBeTruthy();
    expect(cls.dot).toBeTruthy();
  });

  it('chip includes bg- and text- classes', () => {
    expect(TASK_COLOR_CLASSES.blue.chip).toContain('bg-');
    expect(TASK_COLOR_CLASSES.blue.chip).toContain('text-');
  });

  it('chipOutlined includes border class', () => {
    expect(TASK_COLOR_CLASSES.green.chipOutlined).toContain('border');
  });

  it('dot has a single background class', () => {
    expect(TASK_COLOR_CLASSES.red.dot).toMatch(/^bg-\(/);
  });
});

describe('taskColorClasses', () => {
  it('returns matching classes for a known color', () => {
    const cls = taskColorClasses('blue');
    expect(cls).toBe(TASK_COLOR_CLASSES.blue);
  });

  it('returns grey fallback for undefined', () => {
    const cls = taskColorClasses(undefined);
    expect(cls).toBe(TASK_COLOR_CLASSES.gray);
  });

  it('returns grey fallback for an unknown color string', () => {
    const cls = taskColorClasses('neonPink');
    expect(cls).toBe(TASK_COLOR_CLASSES.gray);
  });

  it('returns grey fallback for empty string', () => {
    const cls = taskColorClasses('');
    expect(cls).toBe(TASK_COLOR_CLASSES.gray);
  });
});

describe('CHIP_BASE', () => {
  it('is a non-empty string with Tailwind utility classes', () => {
    expect(CHIP_BASE).toBeTruthy();
    expect(CHIP_BASE).toContain('inline-flex');
    expect(CHIP_BASE).toContain('rounded-md');
    expect(CHIP_BASE).toContain('text-xs');
  });
});
