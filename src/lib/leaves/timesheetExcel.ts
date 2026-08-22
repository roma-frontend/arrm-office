/**
 * timesheetExcel — the accounting deliverable of the absence timesheet.
 *
 * Builds a five-sheet, fully styled .xlsx workbook out of exactly what the
 * timesheet screen shows: Overview (period, filters, KPIs, legend), Timesheet
 * (employees × days wall), Requests (one row per leave), Summary (per employee,
 * per department, per type) and Overtime & Holidays.
 *
 * The module is deliberately dependency-free apart from ExcelJS: every label,
 * colour and pre-computed number arrives through `TimesheetExportInput`, so the
 * caller owns i18n (`react-i18next`) and the palette (`@/lib/types`), and this
 * file stays a pure, testable formatter. ExcelJS itself is imported lazily —
 * it must never land in the page bundle.
 */

// ── Public data contract ────────────────────────────────────────────────────

export type TimesheetExportLang = 'en' | 'ru' | 'hy' | 'de';

/** One column of the day wall, already localized by the caller. */
export interface TimesheetExportDay {
  /** yyyy-MM-dd */
  ds: string;
  dayNumber: number;
  /** Localized short weekday, e.g. "пн" / "Mon". */
  weekdayShort: string;
  /** Localized month band label, e.g. "Август 2026" — merged over the month. */
  monthLabel: string;
  isWeekend: boolean;
  isToday: boolean;
  holidayName?: string;
  /** Localized holiday kind, e.g. "Государственный праздник". */
  holidayTypeLabel?: string;
}

/** One leave request, clipped to the exported period. */
export interface TimesheetExportLeave {
  id: string;
  type: string;
  status: string;
  startDate: string;
  endDate: string;
  /** Days the request itself carries (may exceed the period). */
  requestedDays: number;
  /** Calendar days inside the period. */
  daysInPeriod: number;
  /** Period days minus weekends and company holidays. */
  workingDaysInPeriod: number;
  reason?: string | null;
  reviewerName?: string | null;
  reviewComment?: string | null;
  /** The request continues outside the exported period. */
  clipped: boolean;
}

/** One employee row of the wall, with the totals the screen already computed. */
export interface TimesheetExportRow {
  name: string;
  position?: string | null;
  department?: string | null;
  /** Localized employment type ("Штатный" / "Контрактор"), when known. */
  employeeTypeLabel?: string | null;
  leaves: TimesheetExportLeave[];
  /** Calendar days, approved (and cancellation-requested) requests. */
  approvedDays: number;
  /** Calendar days awaiting approval. */
  pendingDays: number;
  workingDaysApproved: number;
  workingDaysPending: number;
  /** Calendar days per leave type, rejected excluded. */
  byType: Record<string, number>;
  /** Working days per leave type, rejected excluded. */
  byTypeWorking: Record<string, number>;
  /** Approved overtime hours in the period. */
  overtimeHours: number;
  /** yyyy-MM-dd → approved overtime hours on that day. */
  overtimeByDay: Record<string, number>;
  onLeaveToday: boolean;
}

export interface TimesheetExportOvertime {
  date: string;
  employeeName: string;
  department?: string | null;
  startTime: string;
  endTime: string;
  hours: number;
  statusLabel: string;
  status: string;
  reason?: string | null;
}

export interface TimesheetExportHoliday {
  date: string;
  /** Localized weekday, e.g. "среда". */
  weekdayLabel: string;
  name: string;
  typeLabel: string;
  isWeekend: boolean;
  recurring: boolean;
}

/** A single "filter → value" line reproduced on the Overview sheet. */
export interface TimesheetExportFilter {
  label: string;
  value: string;
}

// __APPEND__
