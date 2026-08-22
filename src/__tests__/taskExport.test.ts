/**
 * Tests for `@/lib/taskExport`.
 *
 * The CSV branch is mostly about the things that go wrong outside the browser:
 * Excel treating a task title as a formula, Cyrillic arriving as mojibake
 * without a BOM, and embedded quotes or newlines shifting every later column.
 */

import { describe, it, expect } from '@jest/globals';
import {
  exportFileStem,
  tasksToCsv,
  tasksToMarkdown,
  type CsvColumnLabels,
  type ExportTaskRow,
} from '@/lib/taskExport';

const LABELS: CsvColumnLabels = {
  title: 'Name',
  status: 'Status',
  priority: 'Priority',
  deadline: 'Due date',
  assignee: 'Assignee',
  project: 'Project',
  tags: 'Tags',
};

const row = (patch: Partial<ExportTaskRow> = {}): ExportTaskRow => ({
  title: 'Write the handbook',
  status: 'Pending',
  priority: 'High',
  ...patch,
});

/** CSV without the BOM, split into lines — what a parser would see. */
function lines(csv: string): string[] {
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  return csv.slice(1).replace(/\r\n$/, '').split('\r\n');
}

describe('tasksToCsv', () => {
  it('starts with a UTF-8 BOM so Excel reads non-Latin titles correctly', () => {
    const csv = tasksToCsv([row({ title: 'Отчёт по зарплате' })], LABELS);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('Отчёт по зарплате');
  });

  it('uses CRLF line endings and ends with one', () => {
    const csv = tasksToCsv([row()], LABELS);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv.slice(1).split('\r\n').filter(Boolean)).toHaveLength(2);
  });

  it('writes the header from the supplied labels', () => {
    expect(lines(tasksToCsv([], LABELS))[0]).toBe(
      '"Name","Status","Priority","Due date","Assignee","Project","Tags"',
    );
  });

  it('quotes every cell and doubles embedded quotes', () => {
    const [, body] = lines(tasksToCsv([row({ title: 'Ship "v2"' })], LABELS));
    expect(body).toContain('"Ship ""v2"""');
  });

  it('flattens newlines inside a cell so the row count stays honest', () => {
    const csv = tasksToCsv([row({ title: 'Line one\nline two\r\nline three' })], LABELS);
    expect(lines(csv)).toHaveLength(2);
    expect(lines(csv)[1]).toContain('"Line one line two line three"');
  });

  it('neutralises cells a spreadsheet would run as a formula', () => {
    const dangerous = ['=1+1', '+cmd', '-2', '@SUM(A1)'];
    for (const title of dangerous) {
      expect(lines(tasksToCsv([row({ title })], LABELS))[1]).toContain(`"'${title}"`);
    }
  });

  it('leaves an ordinary title untouched', () => {
    expect(lines(tasksToCsv([row({ title: 'Q3 review' })], LABELS))[1]).toContain('"Q3 review"');
  });

  it('renders missing optional fields as empty cells, not "undefined"', () => {
    const body = lines(tasksToCsv([row()], LABELS))[1];
    expect(body).toBe('"Write the handbook","Pending","High","","","",""');
  });

  it('joins tags with a space', () => {
    const body = lines(tasksToCsv([row({ tags: ['hr', 'urgent'] })], LABELS))[1];
    expect(body.endsWith('"hr urgent"')).toBe(true);
  });

  it('emits header only for an empty board', () => {
    expect(lines(tasksToCsv([], LABELS))).toHaveLength(1);
  });
});

describe('tasksToMarkdown', () => {
  it('titles the document and links back to the view', () => {
    const md = tasksToMarkdown([{ label: 'Pending', tasks: [row()] }], {
      title: 'My tasks',
      url: 'https://hr.example.com/tasks?view=kanban',
      emptyLabel: 'No tasks found',
    });
    expect(md.startsWith('# My tasks')).toBe(true);
    expect(md).toContain('[My tasks](https://hr.example.com/tasks?view=kanban)');
  });

  it('omits the link when there is none', () => {
    const md = tasksToMarkdown([{ label: 'Pending', tasks: [row()] }], {
      title: 'My tasks',
      emptyLabel: 'No tasks found',
    });
    expect(md).not.toContain('](');
  });

  it('keeps the board grouping, with per-section counts', () => {
    const md = tasksToMarkdown(
      [
        { label: 'Pending', tasks: [row({ title: 'A' }), row({ title: 'B' })] },
        { label: 'Completed', tasks: [row({ title: 'C', done: true, status: 'Completed' })] },
      ],
      { title: 'Board', emptyLabel: 'empty' },
    );
    expect(md).toContain('## Pending (2)');
    expect(md).toContain('## Completed (1)');
  });

  it('ticks the checkbox from `done`, not from a translated status label', () => {
    const md = tasksToMarkdown(
      [
        {
          label: 'Завершено',
          tasks: [row({ title: 'Готово', status: 'Завершено', done: true })],
        },
      ],
      { title: 'Board', emptyLabel: 'empty' },
    );
    expect(md).toContain('- [x] Готово');
  });

  it('leaves the checkbox empty for open work', () => {
    const md = tasksToMarkdown([{ label: 'Pending', tasks: [row()] }], {
      title: 'Board',
      emptyLabel: 'empty',
    });
    expect(md).toContain('- [ ] Write the handbook');
  });

  it('appends assignee, deadline, priority and status as the line meta', () => {
    const md = tasksToMarkdown(
      [{ label: 'Alice', tasks: [row({ assignee: 'Alice', deadline: '01/02/2026' })] }],
      { title: 'Board', emptyLabel: 'empty' },
    );
    expect(md).toContain('- [ ] Write the handbook — 01/02/2026 · High · Pending');
  });

  it('does not repeat the section heading in each line', () => {
    const md = tasksToMarkdown([{ label: 'Pending', tasks: [row({ status: 'Pending' })] }], {
      title: 'Board',
      emptyLabel: 'empty',
    });
    expect(md).toContain('- [ ] Write the handbook — High');
    expect(md).not.toContain('· Pending');
  });

  it('escapes Markdown control characters in user text', () => {
    const md = tasksToMarkdown([{ label: 'Pending', tasks: [row({ title: '*bold* [link]' })] }], {
      title: 'Board',
      emptyLabel: 'empty',
    });
    expect(md).toContain('\\*bold\\* \\[link\\]');
  });

  it('skips empty sections and says so when the whole board is empty', () => {
    const md = tasksToMarkdown(
      [
        { label: 'Pending', tasks: [] },
        { label: 'Completed', tasks: [] },
      ],
      { title: 'Board', emptyLabel: 'No tasks found' },
    );
    expect(md).not.toContain('## Pending');
    expect(md).toContain('_No tasks found_');
  });
});

describe('exportFileStem', () => {
  it('slugs the prefix and appends an ISO date', () => {
    expect(exportFileStem('My Tasks', new Date('2026-08-22T10:00:00Z'))).toBe(
      'my-tasks-2026-08-22',
    );
  });

  it('collapses runs of punctuation and never leaves a double hyphen', () => {
    expect(exportFileStem('Q3 / 2026 — board!!', new Date('2026-01-05T00:00:00Z'))).toBe(
      'q3-2026-board-2026-01-05',
    );
  });

  it('falls back to a generic stem when the name is all punctuation', () => {
    expect(exportFileStem('«»!!', new Date('2026-01-05T00:00:00Z'))).toBe('export-2026-01-05');
  });

  it('keeps a name that is already safe', () => {
    expect(exportFileStem('tasks', new Date('2026-12-31T23:00:00Z'))).toBe('tasks-2026-12-31');
  });
});
