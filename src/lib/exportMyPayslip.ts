/**
 * PDF export for an employee's own payslip / payroll summary.
 *
 * Re-uses the project's `loadPdfMakeWithFonts` helper (which loads pdfmake
 * dynamically and registers a Unicode-capable font so we can render any
 * Latin / Armenian / Cyrillic glyph) and writes a one-page PDF that mirrors
 * the on-screen hero card.
 *
 * The PDF is a **secondary view** — the official document is the row in
 * `payrollRecords`. The dialog in the UI explicitly tags a generated PDF
 * as "Official" or "Estimated" so the user can tell which one they are
 * looking at.
 */

import { formatCurrency } from '@/lib/payrollUtils';
import { loadPdfMakeWithFonts } from '@/lib/exportDocument';
import type { Id } from '@/convex/_generated/dataModel';

type SummaryMonth = {
  month: string;
  hasRecord: boolean;
  gross: number;
  net: number;
  bonus: number;
  overtimeHours: number;
  overtimePay: number;
  pension: number;
  incomeTax: number;
  socialSecurity: number;
  healthInsurance: number;
  other: number;
  employerTotal: number;
  currency: string;
  taxCountry?: string;
  status: string | null;
};

type SummaryYtd = {
  gross: number;
  net: number;
  bonus: number;
  pension: number;
  incomeTax: number;
  socialSecurity: number;
  healthInsurance: number;
  other: number;
  employerTotal: number;
  netKept: number;
  taxes: number;
  mandatory: number;
  monthsWithPay: number;
};

type Summary = {
  year: number;
  months: SummaryMonth[];
  ytd: SummaryYtd;
  latest: SummaryMonth | null;
};

type Viewer =
  | {
      id: string;
      name: string;
      email: string;
      organizationId?: string;
    }
  | null
  | undefined;

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

import type { TFunction } from 'i18next';

export async function exportMyPayslipPdf({
  summary,
  user,
  locale,
  t,
}: {
  summary: Summary;
  user: Viewer;
  locale: string;
  // We accept the i18next `t` function as-is so callers can forward their
  // own typed instance; this keeps the helper decoupled from the
  // `useTranslation` overload structure.
  t: TFunction;
}): Promise<void> {
  if (!summary || !user) throw new Error('Missing data');
  const { pdfMake, font } = await loadPdfMakeWithFonts();

  const latest = summary.latest;
  const currency = latest?.currency ?? 'AMD';
  const langName = locale.toLowerCase().startsWith('hy')
    ? 'Armenian'
    : locale.toLowerCase().startsWith('ru')
      ? 'Russian'
      : 'English';
  const fmt = (n: number) => formatCurrency(n, currency);

  const safe = (key: string, fallback: string) => {
    try {
      const v = t(key, fallback);
      return typeof v === 'string' ? v : fallback;
    } catch {
      return fallback;
    }
  };

  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 40] as [number, number, number, number],
    defaultStyle: { font, fontSize: 10 },
    content: [
      {
        text: safe('payroll.myPayroll.pdfTitle', 'My payroll summary'),
        style: 'h1',
      },
      {
        columns: [
          { text: user.name ?? '', bold: true, fontSize: 14 },
          {
            text: `Period: ${summary.year}`,
            alignment: 'right',
          },
        ],
      },
      {
        text: user.email ?? '',
        color: '#64748b',
        fontSize: 9,
        margin: [0, 2, 0, 12],
      },
      {
        text: safe('payroll.myPayroll.pdfLatestLabel', 'Latest month'),
        style: 'h2',
      },
      latest?.hasRecord
        ? {
            table: {
              widths: ['*', 'auto'],
              body: [
                [
                  safe('payroll.myPayroll.month', 'Month'),
                  MONTH_NAMES[Number(latest.month.slice(5, 7)) - 1] ?? latest.month,
                ],
                [
                  safe('payroll.myPayroll.gross', 'Gross'),
                  { text: fmt(latest.gross), alignment: 'right' },
                ],
                [
                  safe('payroll.myPayroll.bonus', 'Bonus'),
                  { text: fmt(latest.bonus), alignment: 'right' },
                ],
                [
                  safe('payroll.myPayroll.overtime', 'Overtime'),
                  {
                    text:
                      fmt(latest.overtimePay) +
                      (latest.overtimeHours > 0 ? ` (${latest.overtimeHours} h)` : ''),
                    alignment: 'right',
                  },
                ],
                [
                  safe('payroll.myPayroll.incomeTax', 'Income tax'),
                  { text: '-' + fmt(latest.incomeTax), alignment: 'right', color: '#dc2626' },
                ],
                [
                  safe('payroll.myPayroll.pension', 'Pension'),
                  { text: '-' + fmt(latest.pension), alignment: 'right', color: '#dc2626' },
                ],
                [
                  safe('payroll.myPayroll.social', 'Social security'),
                  { text: '-' + fmt(latest.socialSecurity), alignment: 'right', color: '#dc2626' },
                ],
                [
                  safe('payroll.myPayroll.health', 'Health'),
                  { text: '-' + fmt(latest.healthInsurance), alignment: 'right', color: '#dc2626' },
                ],
                [
                  safe('payroll.myPayroll.net', 'Net'),
                  { text: fmt(latest.net), alignment: 'right', bold: true, fontSize: 12 },
                ],
              ],
            },
            layout: 'lightHorizontalLines',
          }
        : {
            text: safe(
              'payroll.myPayroll.pdfNoData',
              'No payslip data for the selected period yet.',
            ),
            italics: true,
            color: '#64748b',
            margin: [0, 0, 0, 16],
          },
      {
        text: safe('payroll.myPayroll.ytdTitle', 'Year to date'),
        style: 'h2',
        pageBreak: 'before',
      },
      {
        table: {
          widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto'],
          body: [
            [
              { text: safe('payroll.myPayroll.month', 'Month'), bold: true },
              { text: safe('payroll.myPayroll.gross', 'Gross'), bold: true, alignment: 'right' },
              { text: safe('payroll.myPayroll.tax', 'Tax'), bold: true, alignment: 'right' },
              {
                text: safe('payroll.myPayroll.pension', 'Pension'),
                bold: true,
                alignment: 'right',
              },
              { text: safe('payroll.myPayroll.net', 'Net'), bold: true, alignment: 'right' },
              { text: safe('payroll.myPayroll.status', 'Status'), bold: true, alignment: 'right' },
            ],
            ...summary.months.map((m, i) => [
              {
                text: m.hasRecord ? (MONTH_NAMES[i] ?? m.month) : '—',
                color: m.hasRecord ? '#0f172a' : '#94a3b8',
              },
              { text: m.hasRecord ? fmt(m.gross) : '—', alignment: 'right' },
              { text: m.hasRecord ? fmt(m.incomeTax) : '—', alignment: 'right' },
              { text: m.hasRecord ? fmt(m.pension) : '—', alignment: 'right' },
              { text: m.hasRecord ? fmt(m.net) : '—', alignment: 'right', bold: true },
              { text: m.status ?? '—', alignment: 'right', fontSize: 8, color: '#64748b' },
            ]),
            [
              { text: safe('payroll.myPayroll.ytd', 'YTD'), bold: true },
              { text: fmt(summary.ytd.gross), alignment: 'right', bold: true },
              { text: fmt(summary.ytd.incomeTax), alignment: 'right', bold: true },
              { text: fmt(summary.ytd.pension), alignment: 'right', bold: true },
              { text: fmt(summary.ytd.net), alignment: 'right', bold: true, fontSize: 11 },
              {
                text: String(summary.ytd.monthsWithPay) + '/12',
                alignment: 'right',
                fontSize: 8,
                color: '#64748b',
              },
            ],
          ],
        },
        layout: 'lightHorizontalLines',
      },
      {
        text: `${safe(
          'payroll.myPayroll.pdfGenerated',
          'Generated',
        )}: ${new Date().toLocaleString(locale)} · ${langName}`,
        fontSize: 8,
        color: '#64748b',
        margin: [0, 12, 0, 0],
      },
    ],
    styles: {
      h1: { fontSize: 18, bold: true, margin: [0, 0, 0, 12] },
      h2: { fontSize: 12, bold: true, margin: [0, 12, 0, 6], color: '#475569' },
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdf = (pdfMake as any).createPdf(docDefinition);
  pdf.download(`payslip-${summary.year}-${user.name?.replace(/\s+/g, '-') ?? 'me'}.pdf`);
  // Mark imported type so it isn't tree-shaken in dev — handy if the
  // build target needs to verify the helper was bundled.
  void (null as unknown as Id<'users'> | undefined);
}
