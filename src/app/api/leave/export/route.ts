import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

/**
 * Styled Excel export for leave-money and final-settlement reports.
 * Headers are localized (en / hy / ru / de); EN is the fallback.
 */

type Lang = 'en' | 'hy' | 'ru' | 'de';

/** All header keys every locale provides (concrete, non-optional). */
interface HeaderDict {
  reportTitle: string;
  generated: string;
  org: string;
  employee: string;
  email: string;
  leaveType: string;
  used: string;
  remaining: string;
  total: string;
  dailyRate: string;
  grossValue: string;
  netValue: string;
  currency: string;
  lastDay: string;
  baseSalary: string;
  unusedLeaveDays: string;
  unusedLeaveComp: string;
  proratedDays: string;
  proratedSalary: string;
  severance: string;
  totalGross: string;
  incomeTax: string;
  pension: string;
  otherDeductions: string;
  totalDeductions: string;
  netPayable: string;
  totals: string;
  workingDaysNote: string;
  generatedAt: string;
}

const HEADERS: Record<Lang, HeaderDict> = {
  en: {
    reportTitle: 'Leave & Settlement Report',
    generated: 'Generated',
    org: 'Organization',
    employee: 'Employee',
    email: 'Email',
    leaveType: 'Leave Type',
    used: 'Used (days)',
    remaining: 'Remaining (days)',
    total: 'Total (days)',
    dailyRate: 'Daily Rate',
    grossValue: 'Gross Value',
    netValue: 'Net Value',
    currency: 'Currency',
    lastDay: 'Last Working Day',
    baseSalary: 'Base Salary',
    unusedLeaveDays: 'Unused Paid Leave (days)',
    unusedLeaveComp: 'Unused Leave Compensation',
    proratedDays: 'Prorated Days',
    proratedSalary: 'Prorated Salary',
    severance: 'Severance',
    totalGross: 'Total Gross',
    incomeTax: 'Income Tax',
    pension: 'Pension',
    otherDeductions: 'Other Deductions',
    totalDeductions: 'Total Deductions',
    netPayable: 'Net Payable',
    totals: 'TOTALS',
    workingDaysNote: 'Daily rate = monthly base salary ÷ 21 working days',
    generatedAt: 'Generated at',
  },
  hy: {
    reportTitle: 'Արձակուրդի և հաշվարկի հաշվետվություն',
    generated: 'Ստեղծված է',
    org: 'Կազմակերպություն',
    employee: 'Աշխատակից',
    email: 'Էլ․ փոստ',
    leaveType: 'Արձակուրդի տեսակ',
    used: 'Օգտագործված (օր)',
    remaining: 'Մնացած (օր)',
    total: 'Ընդհանուր (օր)',
    dailyRate: 'Օրական դրույք',
    grossValue: 'Համախառն գումար',
    netValue: 'Զուտ գումար',
    currency: 'Արժույթ',
    lastDay: 'Վերջին աշխատանքային օր',
    baseSalary: 'Հիմնական աշխատավարձ',
    unusedLeaveDays: 'Չօգտագործված վճարովի արձակուրդ (օր)',
    unusedLeaveComp: 'Չօգտագործված արձակուրդի փոխհատուցում',
    proratedDays: 'Համաչափ օրեր',
    proratedSalary: 'Համաչափ աշխատավարձ',
    severance: 'Արձակման նպաստ',
    totalGross: 'Ընդհանուր համախառն',
    incomeTax: 'Եկամտահարկ',
    pension: 'Կուտակային կենսաթոշակ',
    otherDeductions: 'Այլ պահումներ',
    totalDeductions: 'Ընդհանուր պահումներ',
    netPayable: 'Վճարվող զուտ գումար',
    totals: 'ԸՆԴԱՄԵՆԸ',
    workingDaysNote: 'Օրական դրույք = ամսական հիմնական աշխատավարձ ÷ 21 աշխատանքային օր',
    generatedAt: 'Ստեղծման ժամանակ',
  },
  ru: {
    reportTitle: 'Отчёт по отпускам и расчёту',
    generated: 'Сформирован',
    org: 'Организация',
    employee: 'Сотрудник',
    email: 'Email',
    leaveType: 'Тип отпуска',
    used: 'Использовано (дней)',
    remaining: 'Остаток (дней)',
    total: 'Всего (дней)',
    dailyRate: 'Дневная ставка',
    grossValue: 'Сумма (брутто)',
    netValue: 'Сумма (нетто)',
    currency: 'Валюта',
    lastDay: 'Последний рабочий день',
    baseSalary: 'Базовый оклад',
    unusedLeaveDays: 'Неиспользованный отпуск (дней)',
    unusedLeaveComp: 'Компенсация за отпуск',
    proratedDays: 'Отработано дней',
    proratedSalary: 'Пропорциональная зарплата',
    severance: 'Выходное пособие',
    totalGross: 'Итого брутто',
    incomeTax: 'Подоходный налог',
    pension: 'Пенсионные взносы',
    otherDeductions: 'Прочие удержания',
    totalDeductions: 'Итого удержания',
    netPayable: 'К выплате (нетто)',
    totals: 'ИТОГО',
    workingDaysNote: 'Дневная ставка = месячный оклад ÷ 21 рабочий день',
    generatedAt: 'Сформировано',
  },
  de: {
    reportTitle: 'Urlaubs- und Abrechnungsbericht',
    generated: 'Erstellt',
    org: 'Organisation',
    employee: 'Mitarbeiter',
    email: 'E-Mail',
    leaveType: 'Urlaubsart',
    used: 'Genutzt (Tage)',
    remaining: 'Verbleibend (Tage)',
    total: 'Gesamt (Tage)',
    dailyRate: 'Tagessatz',
    grossValue: 'Bruttowert',
    netValue: 'Nettowert',
    currency: 'Währung',
    lastDay: 'Letzter Arbeitstag',
    baseSalary: 'Grundgehalt',
    unusedLeaveDays: 'Nicht genutzter Urlaub (Tage)',
    unusedLeaveComp: 'Urlaubsabgeltung',
    proratedDays: 'Anteilige Tage',
    proratedSalary: 'Anteiliges Gehalt',
    severance: 'Abfindung',
    totalGross: 'Gesamt brutto',
    incomeTax: 'Einkommensteuer',
    pension: 'Rentenbeitrag',
    otherDeductions: 'Sonstige Abzüge',
    totalDeductions: 'Gesamtabzüge',
    netPayable: 'Netto auszahlbar',
    totals: 'GESAMT',
    workingDaysNote: 'Tagessatz = monatliches Grundgehalt ÷ 21 Arbeitstage',
    generatedAt: 'Erstellt am',
  },
};

function langOf(raw: unknown): Lang {
  const v = String(raw ?? 'en').toLowerCase();
  return v === 'hy' || v === 'ru' || v === 'de' ? v : 'en';
}

type HeaderSet = HeaderDict;

const LOCALES: Record<Lang, string> = {
  en: 'en-US',
  hy: 'hy-AM',
  ru: 'ru-RU',
  de: 'de-DE',
};

interface BalanceExportRow {
  employeeName: string;
  email?: string;
  leaveType: string;
  used: number;
  remaining: number;
  total: number;
  dailyRate: number;
  grossValue: number;
  netValue: number;
  currency: string;
}

interface SettlementExportRow {
  employeeName: string;
  email?: string;
  lastDay: number;
  baseSalary: number;
  unusedLeaveDays: number;
  unusedLeaveComp: number;
  proratedDays: number;
  proratedSalary: number;
  severance: number;
  totalGross: number;
  incomeTax: number;
  pension: number;
  otherDeductions: number;
  totalDeductions: number;
  netPayable: number;
  currency: string;
}

interface ExportBody {
  type: 'balances' | 'settlement';
  lang?: Lang;
  organizationName?: string;
  rows?: BalanceExportRow[] | SettlementExportRow[];
}

const BRAND = { argb: '2563EB' }; // brand blue
const LIGHT_BLUE = { argb: 'DBEAFE' };
const LIGHT_GRAY = { argb: 'F3F4F6' };
const MONEY = '#,##0.00';

function styleHeader(row: ExcelJS.Row): void {
  row.height = 22;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: BRAND };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: '1D4ED8' } },
      left: { style: 'thin', color: { argb: '1D4ED8' } },
      bottom: { style: 'thin', color: { argb: '1D4ED8' } },
      right: { style: 'thin', color: { argb: '1D4ED8' } },
    };
  });
}

/** `moneyCols` are 1-based column numbers, matching `cell.col`. */
function styleBodyRow(row: ExcelJS.Row, moneyCols: number[]): void {
  row.eachCell((cell) => {
    cell.border = {
      top: { style: 'hair', color: { argb: 'E5E7EB' } },
      left: { style: 'hair', color: { argb: 'E5E7EB' } },
      bottom: { style: 'hair', color: { argb: 'E5E7EB' } },
      right: { style: 'hair', color: { argb: 'E5E7EB' } },
    };
    cell.alignment = { vertical: 'middle' };
    if (moneyCols.includes(Number(cell.col))) {
      cell.numFmt = MONEY;
    }
  });
}

/**
 * Append a totals row that both carries a live SUM formula and a precomputed
 * result, so viewers that never recalculate still show correct values.
 */
function addTotalsRow(
  ws: ExcelJS.Worksheet,
  startRow: number,
  endRow: number,
  label: string,
  moneyCols: number[],
): void {
  const row = ws.addRow([]);
  row.getCell(1).value = label;
  row.getCell(1).font = { bold: true, size: 11 };
  row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: LIGHT_GRAY };
  for (const col of moneyCols) {
    const cell = row.getCell(col);
    const letter = ws.getColumn(col).letter;
    const formula = `SUM(${letter}${startRow}:${letter}${endRow})`;
    // Precompute the real sum from the plain-number body cells.
    let sum = 0;
    for (let r = startRow; r <= endRow; r++) {
      const v = ws.getCell(r, col).value;
      if (typeof v === 'number') sum += v;
    }
    cell.value = { formula, result: Math.round(sum * 100) / 100 } as ExcelJS.CellValue;
    cell.font = { bold: true };
    cell.numFmt = MONEY;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: LIGHT_GRAY };
  }
  row.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin', color: { argb: '2563EB' } },
      bottom: { style: 'thin', color: { argb: '2563EB' } },
    };
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ExportBody;
    const lang = langOf(body.lang);
    const H: HeaderSet = HEADERS[lang];
    const rows = body.rows ?? [];

    if (body.type !== 'balances' && body.type !== 'settlement') {
      return NextResponse.json(
        { error: 'Report type must be "balances" or "settlement"' },
        { status: 400 },
      );
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'HR System';
    workbook.created = new Date();
    workbook.properties.date1904 = false;

    // ── Title sheet (nice front page) ─────────────────────────────────────
    const title = workbook.addWorksheet(H.reportTitle.slice(0, 31), {
      properties: { tabColor: { argb: '2563EB' } },
    });
    title.mergeCells('A1:D1');
    title.getCell('A1').value = H.reportTitle;
    title.getCell('A1').font = { bold: true, size: 18, color: { argb: '1E3A8A' } };
    title.mergeCells('A3:D3');
    title.getCell('A3').value = `${H.org}: ${body.organizationName || '—'}`;
    title.getCell('A3').font = { size: 12, color: { argb: '374151' } };
    title.mergeCells('A4:D4');
    title.getCell('A4').value = H.workingDaysNote;
    title.getCell('A4').font = { italic: true, size: 10, color: { argb: '6B7280' } };
    title.mergeCells('A5:D5');
    title.getCell('A5').value = `${H.generatedAt}: ${new Date().toLocaleString(LOCALES[lang])}`;
    title.getCell('A5').font = { size: 10, color: { argb: '9CA3AF' } };
    title.getColumn(1).width = 30;
    title.getColumn(2).width = 30;
    title.getColumn(3).width = 30;
    title.getColumn(4).width = 30;

    const data = workbook.addWorksheet(body.type === 'balances' ? 'Leave Balance' : 'Settlement', {
      properties: { tabColor: { argb: '2563EB' } },
    });

    if (body.type === 'balances') {
      const balanceRows = rows as BalanceExportRow[];
      data.columns = [
        { header: H.employee, key: 'employee', width: 26 },
        { header: H.email, key: 'email', width: 28 },
        { header: H.leaveType, key: 'type', width: 22 },
        { header: H.used, key: 'used', width: 12 },
        { header: H.remaining, key: 'remaining', width: 12 },
        { header: H.total, key: 'total', width: 12 },
        { header: H.dailyRate, key: 'dailyRate', width: 14 },
        { header: H.grossValue, key: 'gross', width: 16 },
        { header: H.netValue, key: 'net', width: 16 },
        { header: H.currency, key: 'currency', width: 8 },
      ];
      styleHeader(data.getRow(1));
      let lastDataRow = 1;
      for (const r of balanceRows) {
        const row = data.addRow({
          employee: r.employeeName,
          email: r.email || '',
          type: r.leaveType,
          used: r.used,
          remaining: r.remaining,
          total: r.total,
          dailyRate: r.dailyRate,
          gross: r.grossValue,
          net: r.netValue,
          currency: r.currency,
        });
        styleBodyRow(row, [7, 8, 9]); // dailyRate, gross, net
        if ((data.rowCount - 1) % 2 === 0) {
          row.eachCell((cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: LIGHT_BLUE };
          });
        }
        lastDataRow = row.number;
      }
      if (lastDataRow >= 2) addTotalsRow(data, 2, lastDataRow, H.totals, [8, 9]); // gross, net
      data.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 10 } };
    } else {
      const settlementRows = rows as SettlementExportRow[];
      data.columns = [
        { header: H.employee, key: 'employee', width: 26 },
        { header: H.email, key: 'email', width: 26 },
        { header: H.lastDay, key: 'lastDay', width: 14 },
        { header: H.baseSalary, key: 'baseSalary', width: 14 },
        { header: H.unusedLeaveDays, key: 'leaveDays', width: 14 },
        { header: H.unusedLeaveComp, key: 'leaveComp', width: 16 },
        { header: H.proratedDays, key: 'proratedDays', width: 12 },
        { header: H.proratedSalary, key: 'proratedSalary', width: 15 },
        { header: H.severance, key: 'severance', width: 14 },
        { header: H.totalGross, key: 'totalGross', width: 15 },
        { header: H.incomeTax, key: 'incomeTax', width: 14 },
        { header: H.pension, key: 'pension', width: 14 },
        { header: H.otherDeductions, key: 'otherDeductions', width: 14 },
        { header: H.totalDeductions, key: 'totalDeductions', width: 15 },
        { header: H.netPayable, key: 'netPayable', width: 16 },
        { header: H.currency, key: 'currency', width: 8 },
      ];
      styleHeader(data.getRow(1));
      let lastDataRow = 1;
      for (const r of settlementRows) {
        const row = data.addRow({
          employee: r.employeeName,
          email: r.email || '',
          lastDay: new Date(r.lastDay).toLocaleDateString(
            lang === 'hy' ? 'hy-AM' : lang === 'ru' ? 'ru-RU' : lang === 'de' ? 'de-DE' : 'en-US',
          ),
          baseSalary: r.baseSalary,
          leaveDays: r.unusedLeaveDays,
          leaveComp: r.unusedLeaveComp,
          proratedDays: r.proratedDays,
          proratedSalary: r.proratedSalary,
          severance: r.severance,
          totalGross: r.totalGross,
          incomeTax: r.incomeTax,
          pension: r.pension,
          otherDeductions: r.otherDeductions,
          totalDeductions: r.totalDeductions,
          netPayable: r.netPayable,
          currency: r.currency,
        });
        styleBodyRow(row, [4, 6, 8, 9, 10, 11, 12, 13, 14, 15]);
        if ((data.rowCount - 1) % 2 === 0) {
          row.eachCell((cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: LIGHT_BLUE };
          });
        }
        lastDataRow = row.number;
      }
      if (lastDataRow >= 2)
        addTotalsRow(data, 2, lastDataRow, H.totals, [6, 8, 9, 10, 11, 12, 13, 14, 15]);
      data.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 16 } };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const suffix = body.type === 'balances' ? 'leave-balances' : 'settlement';
    const filename = `${suffix}-${new Date().toISOString().slice(0, 10)}-${lang}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Leave export error:', error);
    return NextResponse.json({ error: 'Failed to export report' }, { status: 500 });
  }
}
