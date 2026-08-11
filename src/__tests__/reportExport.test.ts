/**
 * Tests for src/components/analytics/reportExport.ts — CSV export building
 * (RFC 4180 escaping, section layout, sanitized filename) and the imperative
 * report-series fetch used by CSV export.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

jest.mock('@/convex/_generated/api', () => ({
  api: { analytics: { getReportData: 'analytics/getReportData' } },
}));

import { fetchReportSeries, downloadReportCSV } from '@/components/analytics/reportExport';

describe('fetchReportSeries', () => {
  it('passes the metric/groupBy through with optional org and range', async () => {
    const query = jest.fn().mockResolvedValue({ series: [], total: 0, unit: 'count' });
    const convex = { query } as any;

    const result = await fetchReportSeries(convex, {
      organizationId: 'org-1' as any,
      metric: 'leaves',
      groupBy: 'department',
      rangeDays: 90,
    });

    expect(result).toEqual({ series: [], total: 0, unit: 'count' });
    expect(query).toHaveBeenCalledWith('analytics/getReportData', {
      organizationId: 'org-1',
      metric: 'leaves',
      groupBy: 'department',
      rangeDays: 90,
    });
  });

  it('omits organizationId and rangeDays when not provided', async () => {
    const query = jest.fn().mockResolvedValue({ series: [], total: 0, unit: 'count' });
    await fetchReportSeries({ query } as any, { metric: 'tasks', groupBy: 'none' });
    expect(query).toHaveBeenCalledWith('analytics/getReportData', {
      metric: 'tasks',
      groupBy: 'none',
    });
  });
});

describe('downloadReportCSV', () => {
  let originalCreateObjectURL: typeof URL.createObjectURL;
  let originalRevokeObjectURL: typeof URL.revokeObjectURL;
  let originalBlob: typeof Blob;
  // jsdom's Blob lacks .text(), so capture the parts passed to the constructor.
  const blobParts: string[] = [];

  beforeEach(() => {
    blobParts.length = 0;
    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;
    originalBlob = global.Blob;
    URL.createObjectURL = jest.fn(() => 'blob:mock') as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = jest.fn() as unknown as typeof URL.revokeObjectURL;
    global.Blob = jest.fn((parts: BlobPart[], options?: BlobPropertyBag) => {
      for (const p of parts) blobParts.push(String(p));
      return new originalBlob(parts, options);
    }) as unknown as typeof Blob;
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    global.Blob = originalBlob;
  });

  const csvText = () => blobParts[0] ?? '';

  it('builds titled CSV sections and triggers a download', async () => {
    const click = jest.fn();
    const originalCreateElement = document.createElement.bind(document);
    document.createElement = jest.fn().mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === 'a') {
        el.click = click;
        (el as HTMLAnchorElement).download = '';
      }
      return el;
    }) as unknown as typeof document.createElement;

    downloadReportCSV('August Report', [
      {
        title: 'Leaves by dept',
        metric: 'leaves',
        groupBy: 'department',
        result: { series: [{ label: 'Eng', value: 3 }], total: 3, unit: 'count' },
      },
    ]);

    expect(blobParts).toHaveLength(1);
    const csv = csvText();
    // BOM + section header + meta row + header row + data + total
    expect(csv).toContain('\uFEFF');
    expect(csv).toContain('Leaves by dept');
    expect(csv).toContain('group,department,metric,leaves');
    expect(csv).toContain('Group,Value');
    expect(csv).toContain('Eng,3');
    expect(csv).toContain('Total,3');
    expect(click).toHaveBeenCalled();
  });

  it('escapes cells containing commas, quotes and newlines (RFC 4180)', async () => {
    const originalCreateElement = document.createElement.bind(document);
    document.createElement = jest.fn().mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === 'a') el.click = jest.fn();
      return el;
    }) as unknown as typeof document.createElement;

    downloadReportCSV('Report', [
      {
        title: 'Quoted, title',
        metric: 'tasks',
        groupBy: 'team',
        result: {
          series: [
            { label: 'Team "A"', value: 2 },
            { label: 'Line\nbreak', value: 1 },
          ],
          total: 3,
          unit: 'count',
        },
      },
    ]);

    const csv = csvText();
    expect(csv).toContain('"Quoted, title"');
    expect(csv).toContain('"Team ""A"""');
    expect(csv).toContain('"Line\nbreak"');
  });

  it('sanitizes the report name for the download attribute', () => {
    let captured: HTMLAnchorElement | null = null;
    const originalCreateElement = document.createElement.bind(document);
    document.createElement = jest.fn().mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === 'a') {
        el.click = jest.fn();
        captured = el as HTMLAnchorElement;
      }
      return el;
    }) as unknown as typeof document.createElement;

    downloadReportCSV('Отчёт 2026!!', []);
    // Non-ASCII letters are sanitized to underscores by the component.
    expect(captured?.download).toBe('______2026__.csv');

    downloadReportCSV('???', []);
    expect(captured?.download).toBe('___.csv');
  });
});
