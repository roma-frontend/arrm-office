export const DEFAULT_PROBATION_DAYS = 90;
export const MAX_PROBATION_DAYS = 180;
export const REMINDER_THRESHOLDS = [20, 15, 10, 5];

const DAY = 86400000;

export function daysRemaining(endDate: number, now = Date.now()): number {
  return Math.ceil((endDate - now) / DAY);
}

export function totalProbationDays(startDate: number, endDate: number): number {
  return Math.round((endDate - startDate) / DAY);
}

// Mirrors convex/lib/resolveServiceAssignee.ts — used only to decide whether a
// plain-employee caller is the org's HR owner and therefore sees the manage
// actions (the server re-checks authoritatively).
const HR_PATTERN =
  /\b(hr|human resources|people ops|talent|recruiter)\b|кадр|рекрутер|персонал|человеческ/i;

export function isLikelyHr(user: { department?: string; position?: string } | null): boolean {
  if (!user) return false;
  return HR_PATTERN.test(`${user.department ?? ''} ${user.position ?? ''}`);
}
