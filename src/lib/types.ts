// ── Leave Types ──────────────────────────────────────────────────────────────
// Mirrors the Convex schema union (convex/schema/leaves.ts) — every type that
// can exist in the database must be representable in the UI.
export type LeaveType =
  | 'paid'
  | 'unpaid'
  | 'sick'
  | 'family'
  | 'doctor'
  | 'day_off'
  | 'maternity'
  | 'paternity'
  | 'study';
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancel_requested';
export type EmployeeType = 'staff' | 'contractor';
export type UserRole = 'admin' | 'manager' | 'employee';

export const ALL_LEAVE_TYPES: readonly LeaveType[] = [
  'paid',
  'unpaid',
  'sick',
  'family',
  'doctor',
  'day_off',
  'maternity',
  'paternity',
  'study',
] as const;

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  paid: 'Paid Vacation',
  unpaid: 'Unpaid Leave',
  sick: 'Sick Leave',
  family: 'Family Leave',
  doctor: 'Doctor Visit',
  day_off: 'Day Off',
  maternity: 'Maternity Leave',
  paternity: 'Paternity Leave',
  study: 'Study Leave',
};

// Helper function to get translated leave type labels
export function getLeaveTypeLabel(type: LeaveType, t: (key: string) => string): string {
  const labelKeys: Record<LeaveType, string> = {
    paid: 'leaveTypes.paid',
    unpaid: 'leaveTypes.unpaid',
    sick: 'leaveTypes.sick',
    family: 'leaveTypes.family',
    doctor: 'leaveTypes.doctor',
    day_off: 'leaveTypes.day_off',
    maternity: 'leaveTypes.maternity',
    paternity: 'leaveTypes.paternity',
    study: 'leaveTypes.study',
  };
  return t(labelKeys[type]);
}

export const LEAVE_TYPE_COLORS: Record<LeaveType, string> = {
  paid: '#2563eb',
  unpaid: '#f59e0b',
  sick: '#ef4444',
  family: '#10b981',
  doctor: '#06b6d4',
  day_off: '#7c3aed',
  maternity: '#ec4899',
  paternity: '#6366f1',
  study: '#64748b',
};

export const FALLBACK_LEAVE_TYPE_COLOR = '#94a3b8';

export function getLeaveTypeColor(type: string): string {
  return LEAVE_TYPE_COLORS[type as LeaveType] ?? FALLBACK_LEAVE_TYPE_COLOR;
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function calculateDays(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  if (e < s) return 1;

  // Count only working days (Mon–Fri), excluding Saturday (6) and Sunday (0).
  let count = 0;
  const current = new Date(s);
  while (current <= e) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return Math.max(1, count);
}

export function formatCurrency(amount: number, lang: string = 'en'): string {
  const locale = lang === 'ru' ? 'ru-RU' : lang === 'hy' ? 'hy-AM' : 'en-US';
  return amount.toLocaleString(locale) + ' ֏';
}
