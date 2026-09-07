import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface LeaveRecord {
  _id: string;
  userId: string;
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: string;
  userName?: string | null;
  userDepartment?: string | null;
  userPosition?: string | null;
  reviewerName?: string | null;
  reviewComment?: string | null;
}

interface EmployeeRecord {
  _id: string;
  name: string;
  department?: string | null;
  position?: string | null;
}

interface RowData {
  emp: EmployeeRecord;
  leaves: LeaveRecord[];
  approvedDays: number;
  pendingDays: number;
  byType: Record<string, number>;
  onLeaveToday: boolean;
}

interface DayCell {
  date: string;
  ds: string;
  isWeekend: boolean;
  holidayName?: string | null;
}

interface ExportBody {
  viewStart: string;
  viewEnd: string;
  days: DayCell[];
  rows: RowData[];
  filters?: {
    search?: string;
    statuses?: string[];
    types?: string[];
    department?: string;
    position?: string;
    level?: string;
    employeeType?: string;
    onlyWithLeave?: boolean;
  };
  lang?: 'en' | 'ru' | 'hy' | 'de';
}

const TYPE_BG: Record<string, string> = {
  paid: 'DBEAFE',
  unpaid: 'FEF3C7',
  sick: 'FEE2E2',
  family: 'D1FAE5',
  doctor: 'CFFAFE',
  day_off: 'EDE9FE',
  maternity: 'FCE7F3',
  paternity: 'E0E7FF',
  study: 'F1F5F9',
};
const TYPE_FG: Record<string, string> = {
  paid: '1D4ED8',
  unpaid: '92400E',
  sick: 'B91C1C',
  family: '047857',
  doctor: '0E7490',
  day_off: '5B21B6',
  maternity: '9D174D',
  paternity: '3730A3',
  study: '334155',
};

const TYPE_LABEL = {
  ru: {
    paid: 'Оплачиваемый',
    unpaid: 'Неоплачиваемый',
    sick: 'Больничный',
    family: 'Семейные обстоятельства',
    doctor: 'Врач',
    day_off: 'Отгул',
    maternity: 'Декрет',
    paternity: 'Отцовство',
    study: 'Учёба',
  },
  en: {
    paid: 'Paid',
    unpaid: 'Unpaid',
    sick: 'Sick',
    family: 'Family',
    doctor: 'Doctor',
    day_off: 'Day off',
    maternity: 'Maternity',
    paternity: 'Paternity',
    study: 'Study',
  },
  hy: {
    paid: 'Վճարովի',
    unpaid: 'Չվճարովի',
    sick: 'Հիվանդ',
    family: 'Ընտանեկան',
    doctor: 'Բժիշկ',
    day_off: 'Հանգիստ օր',
    maternity: 'Ծննդաբեր',
    paternity: 'Հայրություն',
    study: 'Ուսում',
  },
  de: {
    paid: 'Bezahlt',
    unpaid: 'Unbezahlt',
    sick: 'Krank',
    family: 'Familie',
    doctor: 'Arzt',
    day_off: 'Freizeit',
    maternity: 'Mutterschaft',
    paternity: 'Vaterschaft',
    study: 'Studium',
  },
};

const LANG_HEADERS = {
  ru: {
    title: 'Табель отсутствий',
    sheetSummary: 'Сводка',
    sheetTimesheet: 'Табель',
    sheetDetail: 'Детально',
    sheetByTypes: 'По типам',
    sheetByDepts: 'По отделам',
    period: 'Период',
    generated: 'Сформировано',
    kpiEmployees: 'Сотрудники',
    kpiOnLeave: 'Отсутствуют сегодня',
    kpiPending: 'На согласовании',
    kpiDays: 'Дней отсутствий',
    legend: 'Условные обозначения',
    legendWeekend: 'Выходной / праздник',
    legendToday: 'Сегодня',
    legendNoData: 'Нет данных',
    filters: 'Применённые фильтры',
    employee: 'Сотрудник',
    department: 'Отдел',
    position: 'Должность',
    type: 'Тип',
    days: 'Дней',
    total: 'Всего',
    status: 'Статус',
    startDate: 'Начало',
    endDate: 'Окончание',
    reason: 'Причина',
    approver: 'Согласующий',
    reviewComment: 'Комментарий ревью',
    color: 'Цвет',
    daysApproved: 'Дней (согл.)',
    daysPending: 'Дней (ожид.)',
    pct: '% от общего',
    avgPer: 'Среднее на чел.',
    totalLabel: 'ИТОГО',
    number: '№',
  },
  en: {
    title: 'Absence Timesheet',
    sheetSummary: 'Summary',
    sheetTimesheet: 'Timesheet',
    sheetDetail: 'Detail',
    sheetByTypes: 'By Type',
    sheetByDepts: 'By Department',
    period: 'Period',
    generated: 'Generated',
    kpiEmployees: 'Employees',
    kpiOnLeave: 'On Leave Today',
    kpiPending: 'Pending',
    kpiDays: 'Absence Days',
    legend: 'Legend',
    legendWeekend: 'Weekend / Holiday',
    legendToday: 'Today',
    legendNoData: 'No data',
    filters: 'Applied Filters',
    employee: 'Employee',
    department: 'Department',
    position: 'Position',
    type: 'Type',
    days: 'Days',
    total: 'Total',
    status: 'Status',
    startDate: 'Start',
    endDate: 'End',
    reason: 'Reason',
    approver: 'Approver',
    reviewComment: 'Review comment',
    color: 'Color',
    daysApproved: 'Days (appr.)',
    daysPending: 'Days (pend.)',
    pct: '% of total',
    avgPer: 'Avg / person',
    totalLabel: 'TOTAL',
    number: '#',
  },
  hy: {
    title: 'Բացակայությունների �աղյուսակ',
    sheetSummary: 'Ամփոփ',
    sheetTimesheet: 'Աղյուսակ',
    sheetDetail: 'Մանրամասն',
    sheetByTypes: 'Ըստ տեսակի',
    sheetByDepts: 'Ըստ բաժնի',
    period: 'Շրջան',
    generated: 'Ստեղծված',
    kpiEmployees: 'Աշխատող',
    kpiOnLeave: 'Բացակա այսօր',
    kpiPending: 'Հաստատման',
    kpiDays: 'Բացակա օր',
    legend: 'Լեգենդ',
    legendWeekend: 'Հանգիստ / տոն',
    legendToday: 'Այսօր',
    legendNoData: 'Տվյալ չկա',
    filters: 'Կիրառված ֆիլտրեր',
    employee: 'Աշխատող',
    department: 'Բաժին',
    position: 'Պաշտոն',
    type: 'Տեսակ',
    days: 'Օր',
    total: 'Ընդ.',
    status: 'Կարգավիճակ',
    startDate: 'Սկիզբ',
    endDate: 'Վերջ',
    reason: 'Պատճառ',
    approver: 'Հաստատող',
    reviewComment: 'Մեկնաբանություն',
    color: 'Գույն',
    daysApproved: 'Օր (հաստ.)',
    daysPending: 'Օր (սպաս.)',
    pct: 'Ընդ. %',
    avgPer: 'Միջին / անձ',
    totalLabel: 'ԸՆԴԱՄԵՆԸ',
    number: '№',
  },
  de: {
    title: 'Abwesenheits-Tabelle',
    sheetSummary: 'Übersicht',
    sheetTimesheet: 'Tabelle',
    sheetDetail: 'Details',
    sheetByTypes: 'Nach Typ',
    sheetByDepts: 'Nach Abteilung',
    period: 'Zeitraum',
    generated: 'Erstellt',
    kpiEmployees: 'Mitarbeiter',
    kpiOnLeave: 'Heute abwesend',
    kpiPending: 'Genehmigung',
    kpiDays: 'Abwesenheitstage',
    legend: 'Legende',
    legendWeekend: 'Wochenende / Feiertag',
    legendToday: 'Heute',
    legendNoData: 'Keine Daten',
    filters: 'Aktive Filter',
    employee: 'Mitarbeiter',
    department: 'Abteilung',
    position: 'Position',
    type: 'Typ',
    days: 'Tage',
    total: 'Gesamt',
    status: 'Status',
    startDate: 'Beginn',
    endDate: 'Ende',
    reason: 'Grund',
    approver: 'Genehmiger',
    reviewComment: 'Kommentar',
    color: 'Farbe',
    daysApproved: 'Tage (gen.)',
    daysPending: 'Tage (off.)',
    pct: '% gesamt',
    avgPer: 'Schnitt / Pers.',
    totalLabel: 'GESAMT',
    number: 'Nr.',
  },
};

const STATUS_BADGE: Record<string, { color: string; labelKey: string }> = {
  approved: { color: '10B981', labelKey: 'approved' },
  pending: { color: 'F59E0B', labelKey: 'pending' },
  rejected: { color: 'EF4444', labelKey: 'rejected' },
};

function argb(hex: string | undefined): string {
  const h = (hex ?? '').replace('#', '').trim().toUpperCase();
  // Already a full ARGB value (e.g. 'FFEFF6FF') — return as-is to avoid
  // double-prefixing ('FFFFFFEFF6FF'), which Excel renders as black.
  if (h.length === 8) return h;
  return 'FF' + h;
}

function typeLabel(t: string, lang: string): string {
  const dict: Record<string, string> = TYPE_LABEL[lang as keyof typeof TYPE_LABEL] ?? TYPE_LABEL.en;
  return dict[t] ?? t;
}

function overlapDays(a: string, b: string, c: string, d: string): number {
  const s = a > c ? a : c;
  const e = b < d ? b : d;
  if (s > e) return 0;
  const ds = new Date(s);
  const de = new Date(e);
  return Math.round((de.getTime() - ds.getTime()) / 86400000) + 1;
}

function thinBorder(argbColor: string): Partial<ExcelJS.Borders> {
  return {
    top: { style: 'thin', color: { argb: argbColor } },
    left: { style: 'thin', color: { argb: argbColor } },
    bottom: { style: 'thin', color: { argb: argbColor } },
    right: { style: 'thin', color: { argb: argbColor } },
  };
}

const BASE = 'D1D5DB';
const ALT = 'EFF6FF';
const DARK = '1E293B';
const WEEKEND = 'FECACA';
const HOLIDAY = 'FEF3C7';
const TODAY = 'E0E7FF';
const WHITE = 'FAFBFC';

function fill(argbColor: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: argbColor } };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ExportBody;
    const lang = (
      body.lang && body.lang in LANG_HEADERS ? body.lang : 'ru'
    ) as keyof typeof LANG_HEADERS;
    const H = LANG_HEADERS[lang];
    const { viewStart, viewEnd, days, rows, filters } = body;

    const today = new Date().toISOString().slice(0, 10);
    const typeCols = Object.keys(TYPE_BG).filter((ty) =>
      rows.some((r) => (r.byType?.[ty] ?? 0) > 0),
    );

    const wb = new ExcelJS.Workbook();
    wb.creator = 'HR Project';
    wb.created = new Date();
    wb.title = H.title;

    // ═══════ Sheet: Сводка ═══════
    const cover = wb.addWorksheet(H.sheetSummary, {
      views: [{ showGridLines: false, zoomScale: 110 }],
    });
    cover.getColumn(1).width = 2;
    for (let c = 2; c <= 7; c++) cover.getColumn(c).width = 22;

    cover.mergeCells('B2:G2');
    cover.getCell('B2').value = H.title;
    cover.getCell('B2').font = {
      name: 'Calibri',
      size: 22,
      bold: true,
      color: { argb: argb('0F172A') },
    };
    cover.getCell('B2').alignment = { vertical: 'middle' };
    cover.getCell('B2').fill = fill(argb('EFF6FF'));
    cover.getRow(2).height = 44;

    cover.mergeCells('B3:G3');
    cover.getCell('B3').value =
      `${H.period}: ${viewStart} — ${viewEnd} · ${H.generated}: ${new Date().toLocaleString(lang === 'hy' ? 'hy-AM' : lang === 'ru' ? 'ru-RU' : lang === 'de' ? 'de-DE' : 'en-US')}`;
    cover.getCell('B3').font = { italic: true, size: 11, color: { argb: argb('475569') } };
    cover.getRow(3).height = 22;

    const totalEmp = rows.length;
    const totalAbsence = rows.reduce((a, r) => a + r.approvedDays + r.pendingDays, 0);
    const totalPending = rows.reduce((a, r) => a + r.pendingDays, 0);
    const todayAbs = rows.filter((r) => r.onLeaveToday).length;

    const kpis = [
      { label: H.kpiEmployees, value: totalEmp, color: '3B82F6' },
      { label: H.kpiOnLeave, value: todayAbs, color: 'EF4444' },
      { label: H.kpiPending, value: totalPending, color: 'F59E0B' },
      { label: H.kpiDays, value: totalAbsence, color: '10B981' },
    ];
    const kpiRow = 5;
    cover.getRow(kpiRow).height = 26;
    cover.getRow(kpiRow + 1).height = 42;
    kpis.forEach((k, i) => {
      const col = 2 + i;
      const lc = cover.getCell(kpiRow, col);
      lc.value = k.label;
      lc.font = { bold: true, color: { argb: argb(WHITE) }, size: 10 };
      lc.alignment = { vertical: 'middle', horizontal: 'center' };
      lc.fill = fill(argb(k.color));
      lc.border = thinBorder(argb(DARK));

      const vc = cover.getCell(kpiRow + 1, col);
      vc.value = k.value;
      vc.font = { bold: true, size: 22, color: { argb: argb(k.color) } };
      vc.alignment = { vertical: 'middle', horizontal: 'center' };
      vc.fill = fill(argb('F8FAFC'));
      vc.border = thinBorder(argb(DARK));
    });

    // Legend
    const legendRow = kpiRow + 4;
    cover.mergeCells(legendRow, 2, legendRow, 7);
    cover.getCell(legendRow, 2).value = H.legend;
    cover.getCell(legendRow, 2).font = { bold: true, size: 12 };
    cover.getRow(legendRow).height = 22;
    let lr = legendRow + 1;
    const activeTypes = Object.keys(TYPE_BG).filter(
      (ty) =>
        rows.some((r) => (r.byType?.[ty] ?? 0) > 0) ||
        rows.some((r) =>
          r.leaves.some(
            (l) =>
              l.type === ty &&
              l.startDate <= today &&
              l.endDate >= today &&
              l.status !== 'rejected',
          ),
        ),
    );
    const legendItems: Array<{ sw: string; label: string }> = [
      ...activeTypes.map((ty) => ({ sw: TYPE_BG[ty] ?? WHITE, label: typeLabel(ty, lang) })),
      { sw: WEEKEND, label: H.legendWeekend },
      { sw: TODAY, label: H.legendToday },
      { sw: ALT, label: H.legendNoData },
    ];
    legendItems.forEach((item) => {
      const sw = cover.getCell(lr, 2);
      sw.fill = fill(argb(item.sw));
      sw.border = thinBorder(argb(BASE));
      const lc = cover.getCell(lr, 3);
      lc.value = item.label;
      lc.font = { bold: true, size: 11 };
      lc.border = thinBorder(argb(BASE));
      cover.mergeCells(lr, 3, lr, 7);
      cover.getRow(lr).height = 20;
      lr++;
    });

    // Filters
    if (filters) {
      lr += 1;
      cover.mergeCells(lr, 2, lr, 7);
      cover.getCell(lr, 2).value = H.filters;
      cover.getCell(lr, 2).font = { bold: true, size: 12 };
      cover.getRow(lr).height = 22;
      lr++;
      const items: Array<[string, string]> = [];
      items.push([H.period, `${viewStart} — ${viewEnd}`]);
      if (filters.search) items.push(['Search', filters.search]);
      if (filters.statuses?.length) items.push(['Status', filters.statuses.join(', ')]);
      if (filters.types?.length)
        items.push([H.type, filters.types.map((t) => typeLabel(t, lang)).join(', ')]);
      if (filters.department && filters.department !== 'all')
        items.push([H.department, filters.department]);
      if (filters.position && filters.position !== 'all')
        items.push([H.position, filters.position]);
      if (filters.employeeType && filters.employeeType !== 'all')
        items.push(['Employee type', filters.employeeType]);
      if (filters.onlyWithLeave) items.push(['Only with leave', 'yes']);
      items.forEach(([k, v]) => {
        const a = cover.getCell(lr, 2);
        a.value = k;
        a.font = { bold: true, size: 10 };
        a.fill = fill(argb(ALT));
        a.border = thinBorder(argb(BASE));
        const b = cover.getCell(lr, 3);
        b.value = v;
        b.font = { size: 10 };
        b.border = thinBorder(argb(BASE));
        cover.mergeCells(lr, 3, lr, 7);
        cover.getRow(lr).height = 18;
        lr++;
      });
    }

    // ═══════ Sheet: Табель ═══════
    const ws = wb.addWorksheet(H.sheetTimesheet, {
      views: [{ state: 'frozen', xSplit: 3, ySplit: 3, showGridLines: false }],
    });
    ws.getColumn(1).width = 4;
    ws.getColumn(2).width = 30;
    ws.getColumn(3).width = 22;
    days.forEach((d, i) => {
      ws.getColumn(4 + i).width = d.isWeekend ? 4.5 : 6;
    });
    const totalCol = 4 + days.length;
    const typeStartCol = totalCol + 1;
    typeCols.forEach((_, i) => {
      ws.getColumn(typeStartCol + i).width = 11;
    });
    const sumCol = typeStartCol + typeCols.length;
    ws.getColumn(sumCol).width = 16;

    // Row 1: month banner
    const monthNames = {
      ru: [
        'Январь',
        'Февраль',
        'Март',
        'Апрель',
        'Май',
        'Июнь',
        'Июль',
        'Август',
        'Сентябрь',
        'Октябрь',
        'Ноябрь',
        'Декабрь',
      ],
      en: [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December',
      ],
      hy: [
        'Հունվար',
        'Փետրվար',
        'Մարտ',
        'Ապրիլ',
        'Մայիս',
        'Հունիս',
        'Հուլիս',
        'Օգոստոս',
        'Սեպտեմբեր',
        'Հոկտեմբեր',
        'Նոյեմբեր',
        'Դեկտեմբեր',
      ],
      de: [
        'Januar',
        'Februar',
        'März',
        'April',
        'Mai',
        'Juni',
        'Juli',
        'August',
        'September',
        'Oktober',
        'November',
        'Dezember',
      ],
    };
    const monthLabel = `${monthNames[lang]?.[Number(viewStart.slice(5, 7)) - 1] ?? ''} ${viewStart.slice(0, 4)}`;
    ws.mergeCells(1, 4, 1, 3 + days.length);
    const monthCell = ws.getCell(1, 4);
    monthCell.value = monthLabel;
    monthCell.font = { bold: true, color: { argb: argb('0F172A') }, size: 12 };
    monthCell.alignment = { vertical: 'middle', horizontal: 'center' };
    monthCell.fill = fill(argb('EFF6FF'));
    monthCell.border = thinBorder(argb(DARK));
    ws.getRow(1).height = 22;

    // Row 2: weekday labels
    const wdNames = {
      ru: ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'],
      en: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
      hy: ['կիր', 'երկ', 'երք', 'չրք', 'հնգ', 'ուրբ', 'շբթ'],
      de: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
    };
    days.forEach((d, i) => {
      const cell = ws.getCell(2, 4 + i);
      const dow = new Date(d.ds).getDay();
      cell.value = wdNames[lang]?.[dow] ?? '';
      cell.font = {
        bold: true,
        color: { argb: d.isWeekend ? argb('B91C1C') : argb('475569') },
        size: 9,
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.fill = fill(argb('F8FAFC'));
      cell.border = thinBorder(argb(BASE));
    });

    // Row 3: day numbers + left headers
    const headerFill = fill(argb('EFF6FF'));
    const headerFont = { bold: true, color: { argb: argb('0F172A') }, size: 10 };
    const headerAlign = { vertical: 'middle' as const, horizontal: 'center' as const };
    [
      [1, H.number],
      [2, H.employee],
      [3, `${H.department} · ${H.position}`],
    ].forEach(([c, v]) => {
      const cell = ws.getCell(3, c as number);
      cell.value = v as string;
      cell.font = headerFont;
      cell.alignment =
        c === 1 ? headerAlign : { vertical: 'middle', horizontal: 'left', indent: 1 };
      cell.fill = headerFill;
      cell.border = thinBorder(argb(DARK));
    });
    days.forEach((d, i) => {
      const cell = ws.getCell(3, 4 + i);
      const dNum = Number(d.ds.slice(8, 10));
      let bg = WHITE;
      if (d.holidayName) bg = HOLIDAY;
      else if (d.ds === today) bg = TODAY;
      else if (d.isWeekend) bg = WEEKEND;
      cell.value = dNum;
      cell.font = {
        bold: true,
        size: 11,
        color: {
          argb: d.holidayName
            ? argb('92400E')
            : d.ds === today
              ? argb('3730A3')
              : d.isWeekend
                ? argb('B91C1C')
                : argb('0F172A'),
        },
      };
      cell.alignment = headerAlign;
      cell.fill = fill(argb(bg));
      cell.border = thinBorder(argb(BASE));
    });
    const totalHeader = ws.getCell(3, totalCol);
    totalHeader.value = H.total;
    totalHeader.font = headerFont;
    totalHeader.alignment = headerAlign;
    totalHeader.fill = fill(argb('DBEAFE'));
    totalHeader.border = thinBorder(argb(DARK));
    typeCols.forEach((ty, i) => {
      const cell = ws.getCell(3, typeStartCol + i);
      cell.value = typeLabel(ty, lang);
      cell.font = { bold: true, color: { argb: argb(TYPE_FG[ty]) }, size: 9 };
      cell.alignment = { ...headerAlign, wrapText: true };
      cell.fill = fill(argb(TYPE_BG[ty]));
      cell.border = thinBorder(argb(BASE));
    });
    const sumHeader = ws.getCell(3, sumCol);
    sumHeader.value = H.total;
    sumHeader.font = headerFont;
    sumHeader.alignment = headerAlign;
    sumHeader.fill = fill(argb('DBEAFE'));
    sumHeader.border = thinBorder(argb(DARK));
    ws.getRow(3).height = 32;

    // Body rows
    rows.forEach((r, idx) => {
      const xlRow = 4 + idx;
      const isAlt = idx % 2 === 1;
      const rowFill = isAlt ? argb(ALT) : argb(WHITE);

      const numCell = ws.getCell(xlRow, 1);
      numCell.value = idx + 1;
      numCell.font = { color: { argb: argb('94A3B8') }, size: 10 };
      numCell.alignment = { vertical: 'middle', horizontal: 'center' };
      numCell.fill = fill(rowFill);
      numCell.border = thinBorder(argb(BASE));

      const empCell = ws.getCell(xlRow, 2);
      empCell.value = r.emp.name;
      empCell.font = { bold: true, size: 11, color: { argb: argb('0F172A') } };
      empCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      empCell.fill = fill(rowFill);
      empCell.border = thinBorder(argb(BASE));

      const depCell = ws.getCell(xlRow, 3);
      depCell.value = [r.emp.department, r.emp.position].filter(Boolean).join(' · ');
      depCell.font = { size: 10, color: { argb: argb('475569') } };
      depCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      depCell.fill = fill(rowFill);
      depCell.border = thinBorder(argb(BASE));

      days.forEach((d, i) => {
        const cell = ws.getCell(xlRow, 4 + i);
        const covering = r.leaves
          .filter((l) => l.startDate <= d.ds && l.endDate >= d.ds && l.status !== 'rejected')
          .sort((a, b) => (a.status === 'pending' ? 1 : -1) - (b.status === 'pending' ? 1 : -1));
        const cov = covering[0];
        let bg: string = rowFill;
        if (d.holidayName) bg = HOLIDAY;
        else if (d.ds === today) bg = TODAY;
        else if (d.isWeekend) bg = WEEKEND;
        if (cov) {
          cell.value = typeLabel(cov.type, lang);
          bg = TYPE_BG[cov.type] ?? rowFill;
          cell.font = { bold: true, size: 9, color: { argb: argb(TYPE_FG[cov.type] ?? '0F172A') } };
        } else {
          cell.value = '';
          cell.font = { size: 9, color: { argb: argb('CBD5E1') } };
        }
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.fill = fill(argb(bg));
        cell.border = thinBorder(argb(BASE));
      });

      const totalDays = r.approvedDays + r.pendingDays;
      const totalCell = ws.getCell(xlRow, totalCol);
      totalCell.value = totalDays;
      totalCell.font = {
        bold: true,
        size: 11,
        color: { argb: totalDays > 0 ? argb('0F172A') : argb('CBD5E1') },
      };
      totalCell.alignment = { vertical: 'middle', horizontal: 'center' };
      totalCell.fill = fill(totalDays > 0 ? argb('EFF6FF') : rowFill);
      totalCell.border = thinBorder(argb(BASE));
      totalCell.numFmt = '0';

      typeCols.forEach((ty, i) => {
        const cell = ws.getCell(xlRow, typeStartCol + i);
        const v = r.byType?.[ty] ?? 0;
        cell.value = v || '';
        cell.font = {
          bold: v > 0,
          size: 10,
          color: { argb: v > 0 ? argb(TYPE_FG[ty]) : argb('CBD5E1') },
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.fill = fill(v > 0 ? argb(TYPE_BG[ty]) : rowFill);
        cell.border = thinBorder(argb(BASE));
        cell.numFmt = '0';
      });

      const gCell = ws.getCell(xlRow, sumCol);
      gCell.value = totalDays;
      gCell.font = { bold: true, size: 12, color: { argb: argb('0F172A') } };
      gCell.alignment = { vertical: 'middle', horizontal: 'center' };
      gCell.fill = fill(totalDays > 0 ? argb('DBEAFE') : argb('F1F5F9'));
      gCell.border = thinBorder(argb(DARK));
      gCell.numFmt = '0';
      ws.getRow(xlRow).height = 22;
    });

    // Footer row
    const footerRow = 4 + rows.length;
    const fLabel = ws.getCell(footerRow, 2);
    fLabel.value = H.totalLabel;
    fLabel.font = { bold: true, color: { argb: argb('0F172A') }, size: 10 };
    fLabel.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    fLabel.fill = fill(argb('EFF6FF'));
    fLabel.border = thinBorder(argb(DARK));
    ws.mergeCells(footerRow, 2, footerRow, 3);
    days.forEach((d, i) => {
      const col = 4 + i;
      const dayCount = rows.filter((r) =>
        r.leaves.some((l) => l.startDate <= d.ds && l.endDate >= d.ds && l.status !== 'rejected'),
      ).length;
      const cell = ws.getCell(footerRow, col);
      cell.value = dayCount || '';
      cell.font = {
        bold: true,
        size: 10,
        color: { argb: dayCount ? argb('0F172A') : argb('CBD5E1') },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.fill = fill(
        dayCount
          ? argb('EFF6FF')
          : d.holidayName
            ? argb(HOLIDAY)
            : d.isWeekend
              ? argb(WEEKEND)
              : argb('FAFBFC'),
      );
      cell.border = thinBorder(argb(BASE));
      cell.numFmt = '0';
    });
    const grandTotal = rows.reduce((a, r) => a + r.approvedDays + r.pendingDays, 0);
    const fTotal = ws.getCell(footerRow, totalCol);
    fTotal.value = grandTotal;
    fTotal.font = { bold: true, color: { argb: argb('0F172A') }, size: 12 };
    fTotal.fill = fill(argb('DBEAFE'));
    fTotal.alignment = { vertical: 'middle', horizontal: 'center' };
    fTotal.border = thinBorder(argb(DARK));
    typeCols.forEach((ty, i) => {
      const col = typeStartCol + i;
      const v = rows.reduce((a, r) => a + (r.byType?.[ty] ?? 0), 0);
      const cell = ws.getCell(footerRow, col);
      cell.value = v || '';
      cell.font = { bold: true, size: 10, color: { argb: v ? argb(TYPE_FG[ty]) : argb('CBD5E1') } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.fill = fill(v ? argb(TYPE_BG[ty]) : argb('FAFBFC'));
      cell.border = thinBorder(argb(BASE));
      cell.numFmt = '0';
    });
    const fSum = ws.getCell(footerRow, sumCol);
    fSum.value = grandTotal;
    fSum.font = { bold: true, color: { argb: argb('0F172A') }, size: 12 };
    fSum.fill = fill(argb('DBEAFE'));
    fSum.alignment = { vertical: 'middle', horizontal: 'center' };
    fSum.border = thinBorder(argb(DARK));
    ws.getRow(footerRow).height = 24;

    // ═══════ Sheet: Detail ═══════
    const detail = wb.addWorksheet(H.sheetDetail, {
      views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
    });
    const dHeaders = [
      H.number,
      H.employee,
      H.department,
      H.position,
      H.type,
      H.status,
      H.startDate,
      H.endDate,
      H.days,
      H.reason,
      H.approver,
      H.reviewComment,
    ];
    dHeaders.forEach((h, i) => {
      const cell = detail.getCell(1, i + 1);
      cell.value = h;
      cell.font = headerFont;
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.fill = headerFill;
      cell.border = thinBorder(argb(DARK));
    });
    detail.getRow(1).height = 30;
    [5, 26, 18, 20, 16, 12, 12, 12, 8, 30, 20, 30].forEach((w, i) => {
      detail.getColumn(i + 1).width = w;
    });
    const flat: Array<{ emp: string; dept: string; pos: string; leave: LeaveRecord }> = [];
    rows.forEach((r) => {
      r.leaves.forEach((l) =>
        flat.push({
          emp: r.emp.name,
          dept: r.emp.department ?? '',
          pos: r.emp.position ?? '',
          leave: l,
        }),
      );
    });
    flat.sort(
      (a, b) => a.emp.localeCompare(b.emp) || a.leave.startDate.localeCompare(b.leave.startDate),
    );
    const statusLabel = (s: string) =>
      ({
        approved:
          { ru: 'Согласовано', en: 'Approved', hy: 'Հաստատված', de: 'Genehmigt' }[lang] ?? s,
        pending:
          { ru: 'На согласовании', en: 'Pending', hy: 'Սպասման', de: 'Ausstehend' }[lang] ?? s,
        rejected: { ru: 'Отклонено', en: 'Rejected', hy: 'Մերժված', de: 'Abgelehnt' }[lang] ?? s,
      })[s] ?? s;
    const statusColor = (s: string) => STATUS_BADGE[s]?.color ?? '64748B';
    flat.forEach((f, i) => {
      const xlRow = i + 2;
      const isAlt = i % 2 === 1;
      const rowFill = isAlt ? argb(ALT) : argb(WHITE);
      const days2 = overlapDays(f.leave.startDate, f.leave.endDate, viewStart, viewEnd);
      const cellData: Array<{
        v: unknown;
        font?: Partial<ExcelJS.Font>;
        fill?: ExcelJS.Fill;
        align?: Partial<ExcelJS.Alignment>;
        numFmt?: string;
      }> = [
        {
          v: i + 1,
          font: { color: { argb: argb('94A3B8') }, size: 10 },
          align: { vertical: 'middle', horizontal: 'center' },
          numFmt: '0',
        },
        {
          v: f.emp,
          font: { bold: true, size: 11, color: { argb: argb('0F172A') } },
          align: { vertical: 'middle' },
        },
        {
          v: f.dept,
          font: { size: 10, color: { argb: argb('475569') } },
          align: { vertical: 'middle' },
        },
        {
          v: f.pos,
          font: { size: 10, color: { argb: argb('475569') } },
          align: { vertical: 'middle' },
        },
        {
          v: typeLabel(f.leave.type, lang),
          font: { bold: true, size: 10, color: { argb: argb(TYPE_FG[f.leave.type] ?? '0F172A') } },
          fill: fill(argb(TYPE_BG[f.leave.type] ?? 'F1F5F9')),
          align: { vertical: 'middle', horizontal: 'center' },
        },
        {
          v: statusLabel(f.leave.status),
          font: { bold: true, size: 10, color: { argb: argb(WHITE) } },
          fill: fill(argb(statusColor(f.leave.status))),
          align: { vertical: 'middle', horizontal: 'center' },
        },
        {
          v: f.leave.startDate,
          font: { size: 10, color: { argb: argb('0F172A') } },
          align: { vertical: 'middle', horizontal: 'center' },
          numFmt: 'dd.mm.yyyy',
        },
        {
          v: f.leave.endDate,
          font: { size: 10, color: { argb: argb('0F172A') } },
          align: { vertical: 'middle', horizontal: 'center' },
          numFmt: 'dd.mm.yyyy',
        },
        {
          v: days2,
          font: { bold: true, size: 11, color: { argb: argb('0F172A') } },
          align: { vertical: 'middle', horizontal: 'center' },
          numFmt: '0',
        },
        {
          v: f.leave.reason ?? '',
          font: { size: 10, color: { argb: argb('334155') } },
          align: { vertical: 'middle', wrapText: true },
        },
        {
          v: f.leave.reviewerName ?? '',
          font: { size: 10, color: { argb: argb('334155') } },
          align: { vertical: 'middle' },
        },
        {
          v: f.leave.reviewComment ?? '',
          font: { size: 10, italic: true, color: { argb: argb('64748B') } },
          align: { vertical: 'middle', wrapText: true },
        },
      ];
      cellData.forEach((d, j) => {
        const cell = detail.getCell(xlRow, j + 1);
        cell.value = d.v as ExcelJS.CellValue;
        if (d.font) cell.font = d.font;
        if (d.align) cell.alignment = d.align;
        if (d.numFmt) cell.numFmt = d.numFmt;
        if (j === 4 || j === 5) {
          cell.fill = d.fill!;
        } else if (j === 0 || j === 8) {
          cell.fill = fill(argb(isAlt ? ALT : 'EFF6FF'));
        } else {
          cell.fill = d.fill ?? fill(rowFill);
        }
        cell.border = thinBorder(argb(BASE));
      });
      detail.getRow(xlRow).height = 20;
    });
    detail.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: dHeaders.length } };

    // ═══════ Sheet: By Type ═══════
    const byType = wb.addWorksheet(H.sheetByTypes, { views: [{ showGridLines: false }] });
    byType.getColumn(1).width = 4;
    byType.getColumn(2).width = 28;
    byType.getColumn(3).width = 14;
    byType.getColumn(4).width = 16;
    byType.getColumn(5).width = 16;
    byType.getColumn(6).width = 16;
    byType.getColumn(7).width = 16;
    byType.mergeCells('B2:G2');
    byType.getCell('B2').value = H.title + ' — ' + H.sheetByTypes;
    byType.getCell('B2').font = { bold: true, size: 16 };
    byType.getRow(2).height = 28;
    [H.number, H.type, H.color, H.daysApproved, H.daysPending, H.kpiEmployees, H.pct].forEach(
      (h, i) => {
        const cell = byType.getCell(4, i + 1);
        cell.value = h;
        cell.font = headerFont;
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.fill = headerFill;
        cell.border = thinBorder(argb(DARK));
      },
    );
    byType.getRow(4).height = 24;
    const grandPct = Math.max(
      1,
      typeCols.reduce((a, ty) => a + rows.reduce((aa, r) => aa + (r.byType?.[ty] ?? 0), 0), 0),
    );
    typeCols.forEach((ty, i) => {
      const xlRow = 5 + i;
      const isAlt = i % 2 === 1;
      const rowFill = isAlt ? argb(ALT) : argb(WHITE);
      const total = rows.reduce((a, r) => a + (r.byType?.[ty] ?? 0), 0);
      const emp = rows.filter((r) => (r.byType?.[ty] ?? 0) > 0).length;
      const appr = rows.reduce(
        (a, r) =>
          a +
          r.leaves
            .filter((l) => l.type === ty && l.status === 'approved')
            .reduce((s, l) => s + overlapDays(l.startDate, l.endDate, viewStart, viewEnd), 0),
        0,
      );
      const pend = rows.reduce(
        (a, r) =>
          a +
          r.leaves
            .filter((l) => l.type === ty && l.status === 'pending')
            .reduce((s, l) => s + overlapDays(l.startDate, l.endDate, viewStart, viewEnd), 0),
        0,
      );
      const rowData: Array<{
        v: unknown;
        font?: Partial<ExcelJS.Font>;
        fill?: ExcelJS.Fill;
        align?: Partial<ExcelJS.Alignment>;
        numFmt?: string;
      }> = [
        { v: i + 1, align: { vertical: 'middle', horizontal: 'center' }, numFmt: '0' },
        {
          v: typeLabel(ty, lang),
          font: { bold: true, size: 11, color: { argb: argb('0F172A') } },
          align: { vertical: 'middle' },
        },
        {
          v: '',
          font: { bold: true, color: { argb: argb(TYPE_FG[ty]) } },
          fill: fill(argb(TYPE_BG[ty])),
        },
        {
          v: appr,
          font: { bold: true, size: 11, color: { argb: argb('047857') } },
          align: { vertical: 'middle', horizontal: 'center' },
          numFmt: '0',
        },
        {
          v: pend,
          font: { bold: true, size: 11, color: { argb: argb('B45309') } },
          align: { vertical: 'middle', horizontal: 'center' },
          numFmt: '0',
        },
        {
          v: emp,
          font: { size: 11, color: { argb: argb('0F172A') } },
          align: { vertical: 'middle', horizontal: 'center' },
          numFmt: '0',
        },
        {
          v: total / grandPct,
          font: { size: 11, color: { argb: argb('0F172A') } },
          align: { vertical: 'middle', horizontal: 'center' },
          numFmt: '0.0%',
        },
      ];
      rowData.forEach((d, j) => {
        const cell = byType.getCell(xlRow, j + 1);
        cell.value = d.v as ExcelJS.CellValue;
        if (d.font) cell.font = d.font;
        if (d.align) cell.alignment = d.align;
        if (d.numFmt) cell.numFmt = d.numFmt;
        cell.fill = d.fill ?? fill(rowFill);
        cell.border = thinBorder(argb(BASE));
      });
      byType.getRow(xlRow).height = 22;
    });
    const totRow = 5 + typeCols.length;
    [
      [1, '', undefined],
      [2, H.totalLabel, undefined],
      [3, '', undefined],
      [4, rows.reduce((a, r) => a + r.approvedDays, 0), '0'],
      [5, rows.reduce((a, r) => a + r.pendingDays, 0), '0'],
      [6, rows.length, '0'],
      [7, 1, '0.0%'],
    ].forEach(([col, val, fmt]) => {
      const cell = byType.getCell(totRow, col as number);
      cell.value = val as ExcelJS.CellValue;
      cell.font = { bold: true, color: { argb: argb('0F172A') }, size: 12 };
      cell.alignment = {
        vertical: 'middle',
        horizontal: col === 2 ? 'left' : 'center',
        indent: col === 2 ? 1 : 0,
      };
      cell.fill = fill(argb('DBEAFE'));
      cell.border = thinBorder(argb(DARK));
      if (fmt) cell.numFmt = String(fmt);
    });
    byType.getRow(totRow).height = 26;

    // ═══════ Sheet: By Department ═══════
    const byDept = wb.addWorksheet(H.sheetByDepts, { views: [{ showGridLines: false }] });
    byDept.getColumn(1).width = 4;
    byDept.getColumn(2).width = 30;
    byDept.getColumn(3).width = 14;
    byDept.getColumn(4).width = 16;
    byDept.getColumn(5).width = 16;
    byDept.getColumn(6).width = 16;
    byDept.getColumn(7).width = 16;
    byDept.mergeCells('B2:G2');
    byDept.getCell('B2').value = H.title + ' — ' + H.sheetByDepts;
    byDept.getCell('B2').font = { bold: true, size: 16 };
    byDept.getRow(2).height = 28;
    [
      H.number,
      H.department,
      H.kpiEmployees,
      H.daysApproved,
      H.daysPending,
      H.total,
      H.avgPer,
    ].forEach((h, i) => {
      const cell = byDept.getCell(4, i + 1);
      cell.value = h;
      cell.font = headerFont;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.fill = headerFill;
      cell.border = thinBorder(argb(DARK));
    });
    byDept.getRow(4).height = 24;
    const deptMap = new Map<
      string,
      { count: Set<string>; approved: number; pending: number; total: number }
    >();
    rows.forEach((r) => {
      const d = r.emp.department || '—';
      if (!deptMap.has(d)) deptMap.set(d, { count: new Set(), approved: 0, pending: 0, total: 0 });
      const e = deptMap.get(d)!;
      e.count.add(r.emp._id);
      e.approved += r.approvedDays;
      e.pending += r.pendingDays;
      e.total += r.approvedDays + r.pendingDays;
    });
    const deptEntries = [...deptMap.entries()].sort((a, b) => b[1].total - a[1].total);
    deptEntries.forEach(([name, data], i) => {
      const xlRow = 5 + i;
      const isAlt = i % 2 === 1;
      const rowFill = isAlt ? argb(ALT) : argb(WHITE);
      const avg = data.count.size > 0 ? data.total / data.count.size : 0;
      const rowData: Array<{
        v: unknown;
        font?: Partial<ExcelJS.Font>;
        fill?: ExcelJS.Fill;
        align?: Partial<ExcelJS.Alignment>;
        numFmt?: string;
      }> = [
        { v: i + 1, align: { vertical: 'middle', horizontal: 'center' }, numFmt: '0' },
        {
          v: name,
          font: { bold: true, size: 11, color: { argb: argb('0F172A') } },
          align: { vertical: 'middle' },
        },
        {
          v: data.count.size,
          font: { size: 11, color: { argb: argb('0F172A') } },
          align: { vertical: 'middle', horizontal: 'center' },
          numFmt: '0',
        },
        {
          v: data.approved,
          font: { bold: true, size: 11, color: { argb: argb('047857') } },
          align: { vertical: 'middle', horizontal: 'center' },
          numFmt: '0',
        },
        {
          v: data.pending,
          font: { bold: true, size: 11, color: { argb: argb('B45309') } },
          align: { vertical: 'middle', horizontal: 'center' },
          numFmt: '0',
        },
        {
          v: data.total,
          font: { bold: true, size: 12, color: { argb: argb('0F172A') } },
          fill: fill(argb('DBEAFE')),
          align: { vertical: 'middle', horizontal: 'center' },
          numFmt: '0',
        },
        {
          v: avg,
          font: { size: 11, color: { argb: argb('0F172A') } },
          align: { vertical: 'middle', horizontal: 'center' },
          numFmt: '0.00',
        },
      ];
      rowData.forEach((d, j) => {
        const cell = byDept.getCell(xlRow, j + 1);
        cell.value = d.v as ExcelJS.CellValue;
        if (d.font) cell.font = d.font;
        if (d.align) cell.alignment = d.align;
        if (d.numFmt) cell.numFmt = d.numFmt;
        cell.fill = d.fill ?? fill(rowFill);
        cell.border = thinBorder(argb(BASE));
      });
      byDept.getRow(xlRow).height = 22;
    });
    const dtRow = 5 + deptEntries.length;
    [
      [1, '', undefined],
      [2, H.totalLabel, undefined],
      [3, rows.length, '0'],
      [4, rows.reduce((a, r) => a + r.approvedDays, 0), '0'],
      [5, rows.reduce((a, r) => a + r.pendingDays, 0), '0'],
      [6, rows.reduce((a, r) => a + r.approvedDays + r.pendingDays, 0), '0'],
      [
        7,
        rows.length > 0
          ? rows.reduce((a, r) => a + r.approvedDays + r.pendingDays, 0) / rows.length
          : 0,
        '0.00',
      ],
    ].forEach(([col, val, fmt]) => {
      const cell = byDept.getCell(dtRow, col as number);
      cell.value = val as ExcelJS.CellValue;
      cell.font = { bold: true, color: { argb: argb('0F172A') }, size: 12 };
      cell.alignment = {
        vertical: 'middle',
        horizontal: col === 2 ? 'left' : 'center',
        indent: col === 2 ? 1 : 0,
      };
      cell.fill = fill(argb('DBEAFE'));
      cell.border = thinBorder(argb(DARK));
      if (fmt) cell.numFmt = String(fmt);
    });
    byDept.getRow(dtRow).height = 26;

    let buffer = await wb.xlsx.writeBuffer();
    // Post-process: inject a light Office theme so Excel doesn't apply dark mode
    // (which inverts the cellStyle "Normal" background to dark).
    try {
      const JSZip = (await import('jszip')).default;
      const zip = await new JSZip().loadAsync(buffer as ArrayBuffer);
      const lightTheme = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office">
<a:themeElements>
<a:clrScheme name="Office"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="F8FAFC"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>
<a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light" panose="020F0302020204030204"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri" panose="020F0502020204030204"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>
<a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>
</a:themeElements></a:theme>`;
      if (zip.files['xl/theme/theme1.xml']) {
        zip.file('xl/theme/theme1.xml', lightTheme);
      }
      // Also override the workbook's "Normal" cellStyle fill (fillId 0) and the
      // cellStyleXfs so the default cell background is not "none"/inheriting
      // from the theme background.
      const stylesPath = 'xl/styles.xml';
      if (zip.files[stylesPath]) {
        let styles = await zip.files[stylesPath].async('string');
        // Compute the new fill index = current count
        const fillsMatch = styles.match(/<fills count="(\d+)">/);
        const currentFills = fillsMatch ? Number(fillsMatch[1]) : 0;
        const newFillIndex = currentFills;
        // Add a solid light fill as the new default at the end
        const newFill = `<fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor rgb="FFF8FAFC"/></patternFill></fill>`;
        styles = styles.replace(
          /<fills count="(\d+)">/g,
          (_m, n) => `<fills count="${Number(n) + 1}">`,
        );
        styles = styles.replace('</fills>', newFill + '</fills>');
        // Add a new cellStyleXf that references the new fill
        const newCellStyleXf = `<xf numFmtId="0" fontId="0" fillId="${newFillIndex}" borderId="0" xfId="0" applyFill="1"/>`;
        styles = styles.replace(
          /<cellStyleXfs count="(\d+)">/g,
          (_m, n) => `<cellStyleXfs count="${Number(n) + 1}">`,
        );
        styles = styles.replace('</cellStyleXfs>', newCellStyleXf + '</cellStyleXfs>');
        // Point the Normal cellStyle to the new xfId (1)
        styles = styles.replace(
          /<cellStyle name="Normal" xfId="0"/,
          '<cellStyle name="Normal" xfId="1"',
        );
        zip.file(stylesPath, styles);
      }
      buffer = await zip.generateAsync({ type: 'arraybuffer' });
    } catch (e) {
      console.error('Theme injection failed', e);
    }
    const filename = `timesheet_${viewStart}_${viewEnd}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    logger.error('Timesheet export error:', error);
    return NextResponse.json({ error: 'Failed to export timesheet' }, { status: 500 });
  }
}
