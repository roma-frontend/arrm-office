/**
 * Exporting the task board — CSV for spreadsheets, Markdown for a message.
 *
 * "Share" offers both because the two answer different questions: a colleague
 * who wants to work the list wants a link, a manager who wants to paste today's
 * state into a status update wants text, and finance wants a spreadsheet. All
 * three come from the same already-filtered rows the user is looking at, so what
 * leaves the page is exactly what the page shows.
 *
 * Pure functions, no DOM: the download itself lives in the component.
 */

export interface ExportTaskRow {
  title: string;
  /** Already localized — this module never maps a status to a label. */
  status: string;
  priority: string;
  /**
   * Whether the checkbox is ticked in the Markdown checklist. Separate from
   * `status` on purpose: `status` is a translated label, so comparing it to
   * `'completed'` would only ever work in English.
   */
  done?: boolean;
  /** Already formatted for the user's locale — this module never guesses a format. */
  deadline?: string;
  assignee?: string;
  project?: string;
  tags?: string[];
}

export interface ExportSection {
  label: string;
  tasks: ExportTaskRow[];
}

export interface CsvColumnLabels {
  title: string;
  status: string;
  priority: string;
  deadline: string;
  assignee: string;
  project: string;
  tags: string;
}

/**
 * A leading `=`, `+`, `-`, `@`, tab or CR makes Excel and Sheets treat a cell as
 * a formula — a task titled `=HYPERLINK(...)` would execute on open. Prefixing
 * with an apostrophe keeps the text visible and inert.
 */
function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function csvCell(value: string | undefined): string {
  const raw = neutralizeFormula((value ?? '').replace(/\r\n|\r|\n/g, ' ').trim());
  return `"${raw.replace(/"/g, '""')}"`;
}

/**
 * RFC 4180 CSV with CRLF line endings and a UTF-8 BOM: without the BOM, Excel on
 * Windows opens Cyrillic and Armenian task titles as mojibake.
 */
export function tasksToCsv(rows: readonly ExportTaskRow[], labels: CsvColumnLabels): string {
  const header = [
    labels.title,
    labels.status,
    labels.priority,
    labels.deadline,
    labels.assignee,
    labels.project,
    labels.tags,
  ]
    .map(csvCell)
    .join(',');

  const body = rows.map((row) =>
    [
      row.title,
      row.status,
      row.priority,
      row.deadline,
      row.assignee,
      row.project,
      row.tags?.join(' '),
    ]
      .map(csvCell)
      .join(','),
  );

  return `\uFEFF${[header, ...body].join('\r\n')}\r\n`;
}

/** Escapes the few characters that would otherwise restyle a pasted line. */
function mdText(value: string): string {
  return value.replace(/([[\]*_`|])/g, '\\$1');
}

/**
 * Markdown checklist, grouped the way the board is grouped, so pasting into a
 * chat or a doc reproduces the structure the user set up rather than a flat dump.
 */
export function tasksToMarkdown(
  sections: readonly ExportSection[],
  options: { title: string; url?: string; emptyLabel: string },
): string {
  const lines: string[] = [`# ${mdText(options.title)}`, ''];

  const populated = sections.filter((section) => section.tasks.length > 0);
  if (populated.length === 0) {
    lines.push(`_${mdText(options.emptyLabel)}_`, '');
  }

  for (const section of populated) {
    lines.push(`## ${mdText(section.label)} (${section.tasks.length})`, '');
    for (const task of section.tasks) {
      // Status is included only when the board is not already grouped by it,
      // otherwise every line in the section would repeat its own heading.
      const meta = [task.assignee, task.deadline, task.priority, task.status].filter(
        (part): part is string => !!part && part.trim() !== '' && part !== section.label,
      );
      const suffix = meta.length > 0 ? ` — ${mdText(meta.join(' · '))}` : '';
      lines.push(`- [${task.done ? 'x' : ' '}] ${mdText(task.title)}${suffix}`);
    }
    lines.push('');
  }

  if (options.url) lines.push(`[${mdText(options.title)}](${options.url})`, '');

  return lines.join('\n');
}

/** Filename stem shared by the CSV download and any future export format. */
export function exportFileStem(prefix: string, date: Date): string {
  const iso = date.toISOString().slice(0, 10);
  const slug = prefix
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    // Punctuation at either end would leave `board--2026-08-22`.
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return slug === '' ? `export-${iso}` : `${slug}-${iso}`;
}
