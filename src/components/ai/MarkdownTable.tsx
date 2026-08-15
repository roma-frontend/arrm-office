'use client';

import { useMemo } from 'react';

function parseMarkdownTable(tableText: string): { headers: string[]; rows: string[][] } | null {
  const lines = tableText
    .trim()
    .split('\n')
    .filter((line) => line.trim() && line.includes('|'));
  if (lines.length < 2) return null;

  const parseRow = (line: string): string[] => {
    return line
      .split('|')
      .slice(1, -1)
      .map((cell) =>
        cell
          .trim()
          .replace(/^[*_`]+|[*_`]+$/g, '')
          .replace(/^\s+|\s+$/g, ''),
      );
  };

  const headers = parseRow(lines[0] || '');

  const sepIdx = lines.findIndex((line) => line.includes('---') || line.match(/\|[\s\-:]+\|/));

  const dataLines = sepIdx >= 0 ? lines.slice(sepIdx + 1) : lines.slice(1);
  const rows = dataLines
    .map(parseRow)
    .filter((row) => row.length > 0 && row.some((cell) => cell && cell !== '-'));

  if (headers.length === 0) return null;

  return { headers, rows };
}

function extractFirstTable(
  content: string,
): { before: string; table: string; after: string } | null {
  const lines = content.split('\n');
  let tableStart = -1;
  let tableEnd = -1;
  let separatorIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || '';
    const pipes = (line.match(/\|/g) || []).length;

    if (pipes >= 3 && tableStart === -1) {
      tableStart = i;
    }

    if (
      tableStart >= 0 &&
      separatorIdx === -1 &&
      (line.includes('---') || line.match(/\|[\s\-:]+\|/))
    ) {
      separatorIdx = i;
    }

    if (tableStart >= 0 && separatorIdx >= 0 && pipes >= 3 && i > separatorIdx) {
      tableEnd = i;
    }
  }

  if (tableStart === -1 || separatorIdx === -1) return null;

  const before = lines.slice(0, tableStart).join('\n');
  const table = lines.slice(tableStart, tableEnd + 1).join('\n');
  const after = lines.slice(tableEnd + 1).join('\n');

  return { before, table, after };
}

export function MarkdownTable({ content }: { content: string }) {
  const table = useMemo(() => parseMarkdownTable(content), [content]);

  if (!table)
    return (
      <pre className="whitespace-pre-wrap text-sm font-mono bg-(--sunken) p-3 rounded-lg">
        {content}
      </pre>
    );

  // Calculate column widths
  const colWidths = (table.headers ?? []).map((_, colIdx) => {
    const maxWidth = Math.max(
      (table.headers?.[colIdx] ?? '').length,
      ...(table.rows ?? []).map((row) => (row?.[colIdx] || '').length),
    );
    return Math.min(Math.max(maxWidth + 2, 8), 40); // Min 8, max 40 chars
  });

  return (
    <div className="my-4 rounded-xl overflow-hidden shadow-lg border border-(--border-default)">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-gradient-to-r bg-(--surface-3) bg-(--surface-3) bg-(--surface-3)">
            {table.headers.map((header, idx) => (
              <th
                key={idx}
                className="px-4 py-3 text-left text-white font-semibold text-sm tracking-wide border-r border-(--border-strong) last:border-r-0"
                style={{ minWidth: `${colWidths[idx]}ch` }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIdx) => (
            <tr
              key={rowIdx}
              className={`${rowIdx % 2 === 0 ? 'bg-(--surface-1)' : 'bg-(--surface-2)'} transition-colors duration-140 ease-spark hover:bg-(--brand-quiet)`}
            >
              {row.map((cell, cellIdx) => (
                <td
                  key={cellIdx}
                  className="px-4 py-2.5 text-(--text-2) text-sm border-r border-(--border-default) last:border-r-0"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function formatMessageContent(content: string): React.ReactNode {
  const tableData = extractFirstTable(content);

  if (!tableData) {
    return (
      <div className="whitespace-pre-wrap">
        {content.split('\n').map((line, idx) =>
          line.trim() ? (
            <span key={idx}>
              {line}
              <br />
            </span>
          ) : (
            <br key={idx} />
          ),
        )}
      </div>
    );
  }

  return (
    <>
      {tableData.before && (
        <div className="whitespace-pre-wrap">
          {tableData.before.split('\n').map((line, idx) =>
            line.trim() ? (
              <span key={idx}>
                {line}
                <br />
              </span>
            ) : (
              <br key={idx} />
            ),
          )}
        </div>
      )}
      <MarkdownTable content={tableData.table} />
      {tableData.after && (
        <div className="whitespace-pre-wrap">
          {tableData.after.split('\n').map((line, idx) =>
            line.trim() ? (
              <span key={idx}>
                {line}
                <br />
              </span>
            ) : (
              <br key={idx} />
            ),
          )}
        </div>
      )}
    </>
  );
}
