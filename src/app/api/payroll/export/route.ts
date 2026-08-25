import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { logger } from '@/lib/logger';

/**
 * Styled Excel export for payroll records.
 * Headers are localized (en / ru / hy / de); EN is the fallback.
 */

type Lang = 'en' | 'ru' | 'hy' | 'de';

/** All header keys every locale provides (concrete, non-optional). */
interface HeaderDict {
  sheet: string;
  employee: string;
  email: string;
  period: string;
  baseSalary: string;
  grossSalary: string;
  netSalary: string;
  bonuses: string;
  overtimePay: string;
  incomeTax: string;
  socialSecurity: string;
  totalDeductions: string;
  status: string;
  createdAt: string;
  totals: string;
  unknown: string;
}

const HEADERS: Record<Lang, HeaderDict> = {
  en: {
    sheet: 'Payroll Report',
    employee: 'Employee',
    email: 'Email',
    period: 'Period',
    baseSalary: 'Base Salary',
    grossSalary: 'Gross Salary',
    netSalary: 'Net Salary',
    bonuses: 'Bonuses',
    overtimePay: 'Overtime Pay',
    incomeTax: 'Income Tax',
    socialSecurity: 'Social Security',
    totalDeductions: 'Total Deductions',
    status: 'Status',
    createdAt: 'Created At',
    totals: 'TOTALS',
    unknown: 'Unknown',
  },
  ru: {
    sheet: 'Зарплатный отчёт',
    employee: 'Сотрудник',
    email: 'Email',
    period: 'Период',
    baseSalary: 'Оклад',
    grossSalary: 'Начислено',
    netSalary: 'На руки',
    bonuses: 'Премии',
    overtimePay: 'Оплата переработок',
    incomeTax: 'Подоходный налог',
    socialSecurity: 'Соцстрахование',
    totalDeductions: 'Всего удержаний',
    status: 'Статус',
    createdAt: 'Создано',
    totals: 'ИТОГО',
    unknown: 'Неизвестно',
  },
  hy: {
    sheet: 'Աշխատավարձի հաշվետվություն',
    employee: 'Աշխատակից',
    email: 'Էլ. փոստ',
    period: 'Ժամանակահատված',
    baseSalary: 'Բազային աշխատավարձ',
    grossSalary: 'Համախառն',
    netSalary: 'Զուտ',
    bonuses: 'Բոնուսներ',
    overtimePay: 'Արտաժամյա վճար',
    incomeTax: 'Եկամտահարկ',
    socialSecurity: 'Սոցիալական ապահովագրություն',
    totalDeductions: 'Ընդհանուր պահումներ',
    status: 'Կարգավիճակ',
    createdAt: 'Ստեղծված է',
    totals: 'ԸՆԴՀԱՆՈՒՐ',
    unknown: 'Անհայտ',
  },
  de: {
    sheet: 'Gehaltsbericht',
    employee: 'Mitarbeiter',
    email: 'E-Mail',
    period: 'Zeitraum',
    baseSalary: 'Grundgehalt',
    grossSalary: 'Bruttogehalt',
    netSalary: 'Nettogehalt',
    bonuses: 'Prämien',
    overtimePay: 'Überstunden',
    incomeTax: 'Einkommensteuer',
    socialSecurity: 'Sozialversicherung',
    totalDeductions: 'Abzüge gesamt',
    status: 'Status',
    createdAt: 'Erstellt am',
    totals: 'GESAMT',
    unknown: 'Unbekannt',
  },
};

function normalizeLang(lang?: string): Lang {
  const code = (lang || 'en').slice(0, 2).toLowerCase();
  return code === 'ru' || code === 'hy' || code === 'de' ? code : 'en';
}

interface PayrollExportRecord {
  user?: { name?: string; email?: string } | null;
  period: string;
  baseSalary: number;
  grossSalary: number;
  netSalary: number;
  bonuses?: number;
  overtimePay?: number;
  deductions?: { incomeTax?: number; socialSecurity?: number; total?: number };
  status: string;
  createdAt: number | string | Date;
}

interface PayrollExportBody {
  records?: PayrollExportRecord[];
  organizationName?: string;
  period?: string;
  lang?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PayrollExportBody;
    const { records, period } = body;
    const t = HEADERS[normalizeLang(body.lang)];

    if (!records || !Array.isArray(records)) {
      return NextResponse.json({ error: 'Records array is required' }, { status: 400 });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'HR System';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet(t.sheet, {
      properties: { tabColor: { argb: '2563EB' } },
    });

    worksheet.columns = [
      { header: t.employee, key: 'employee', width: 25 },
      { header: t.email, key: 'email', width: 30 },
      { header: t.period, key: 'period', width: 15 },
      { header: t.baseSalary, key: 'baseSalary', width: 15 },
      { header: t.grossSalary, key: 'grossSalary', width: 15 },
      { header: t.netSalary, key: 'netSalary', width: 15 },
      { header: t.bonuses, key: 'bonuses', width: 12 },
      { header: t.overtimePay, key: 'overtimePay', width: 15 },
      { header: t.incomeTax, key: 'incomeTax', width: 12 },
      { header: t.socialSecurity, key: 'socialSecurity', width: 15 },
      { header: t.totalDeductions, key: 'totalDeductions', width: 15 },
      { header: t.status, key: 'status', width: 12 },
      { header: t.createdAt, key: 'createdAt', width: 20 },
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '2563EB' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    records.forEach((record) => {
      worksheet.addRow({
        employee: record.user?.name || t.unknown,
        email: record.user?.email || '',
        period: record.period,
        baseSalary: record.baseSalary,
        grossSalary: record.grossSalary,
        netSalary: record.netSalary,
        bonuses: record.bonuses || 0,
        overtimePay: record.overtimePay || 0,
        incomeTax: record.deductions?.incomeTax || 0,
        socialSecurity: record.deductions?.socialSecurity || 0,
        totalDeductions: record.deductions?.total || 0,
        status: record.status,
        createdAt: new Date(record.createdAt).toLocaleDateString(),
      });
    });

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        });
      }
    });

    const totalGross = records.reduce((sum: number, r) => sum + r.grossSalary, 0);
    const totalNet = records.reduce((sum: number, r) => sum + r.netSalary, 0);
    const totalDeductions = records.reduce((sum: number, r) => sum + (r.deductions?.total || 0), 0);

    worksheet.addRow([]);
    const totalsRow = worksheet.addRow({ employee: t.totals });
    totalsRow.font = { bold: true };
    totalsRow.getCell('grossSalary').value = totalGross;
    totalsRow.getCell('grossSalary').font = { bold: true };
    totalsRow.getCell('netSalary').value = totalNet;
    totalsRow.getCell('netSalary').font = { bold: true };
    totalsRow.getCell('totalDeductions').value = totalDeductions;
    totalsRow.getCell('totalDeductions').font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();

    const filename = `payroll-report-${period || 'all'}-${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logger.error('Payroll export error:', error);
    return NextResponse.json({ error: 'Failed to export payroll data' }, { status: 500 });
  }
}
