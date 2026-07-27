import type { ConvexReactClient } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

type MetricField =
  | 'employees'
  | 'leaves'
  | 'attendance'
  | 'tasks'
  | 'payroll'
  | 'performance'
  | 'recruitment';
type GroupBy = 'department' | 'team' | 'role' | 'location' | 'none';

export interface ReportSeriesResult {
  series: Array<{ label: string; value: number }>;
  total: number;
  unit: 'count' | 'currency' | 'hours';
}

// Imperatively pull a single widget's aggregated series (used for CSV export).
export async function fetchReportSeries(
  convex: ConvexReactClient,
  params: {
    organizationId?: Id<'organizations'>;
    metric: MetricField;
    groupBy: GroupBy;
    rangeDays?: number;
  },
): Promise<ReportSeriesResult> {
  return convex.query(api.analytics.getReportData, {
    ...(params.organizationId ? { organizationId: params.organizationId } : {}),
    metric: params.metric,
    groupBy: params.groupBy,
    ...(params.rangeDays ? { rangeDays: params.rangeDays } : {}),
  });
}

// Escape a CSV cell per RFC 4180 (quote when it contains , " or newline).
function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Build a CSV string from one or more widget result blocks and trigger a
// browser download. Each block becomes a titled section.
export function downloadReportCSV(
  reportName: string,
  blocks: Array<{
    title: string;
    metric: string;
    groupBy: string;
    result: ReportSeriesResult;
  }>,
): void {
  const lines: string[] = [];
  for (const block of blocks) {
    lines.push(csvCell(block.title));
    lines.push(['group', block.groupBy, 'metric', block.metric].map(csvCell).join(','));
    lines.push(['Group', 'Value'].map(csvCell).join(','));
    for (const row of block.result.series) {
      lines.push([row.label, row.value].map(csvCell).join(','));
    }
    lines.push(['Total', block.result.total].map(csvCell).join(','));
    lines.push(''); // blank line between blocks
  }

  const csv = lines.join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${reportName.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'report'}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
