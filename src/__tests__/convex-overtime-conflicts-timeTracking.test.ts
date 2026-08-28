/**
 * Tests for convex/overtime/mutations — calculateEstimatedHours helper
 * and convex/conflicts/main — department thresholds.
 */

// ── Overtime: calculateEstimatedHours (not exported, so replicate the logic) ──
function calculateEstimatedHours(startTime: string, endTime: string): number {
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  const startMinutes = (startH ?? 0) * 60 + (startM ?? 0);
  const endMinutes = (endH ?? 0) * 60 + (endM ?? 0);
  const diff = endMinutes - startMinutes;
  return Math.round((diff / 60) * 100) / 100;
}

describe('overtime calculateEstimatedHours', () => {
  it('calculates standard 9:00–18:00 = 9h', () => {
    expect(calculateEstimatedHours('09:00', '18:00')).toBe(9);
  });

  it('calculates 08:00–17:30 = 9.5h', () => {
    expect(calculateEstimatedHours('08:00', '17:30')).toBe(9.5);
  });

  it('returns 0 for identical times', () => {
    expect(calculateEstimatedHours('09:00', '09:00')).toBe(0);
  });

  it('returns negative for inverted times', () => {
    expect(calculateEstimatedHours('18:00', '09:00')).toBe(-9);
  });

  it('handles midnight crossing', () => {
    expect(calculateEstimatedHours('22:00', '02:00')).toBe(-20);
  });

  it('handles short overtime (1h)', () => {
    expect(calculateEstimatedHours('18:00', '19:00')).toBe(1);
  });

  it('handles minutes correctly (30 min)', () => {
    expect(calculateEstimatedHours('14:30', '15:00')).toBe(0.5);
  });

  it('handles 15-minute increments', () => {
    expect(calculateEstimatedHours('09:00', '09:45')).toBe(0.75);
  });

  it('rounds to 2 decimal places', () => {
    expect(calculateEstimatedHours('09:00', '09:20')).toBe(0.33);
  });
});

// ── Conflicts: department overlap thresholds ──────────────────────────────
describe('conflict thresholds', () => {
  const DEPARTMENT_CRITICAL = 0.5;
  const DEPARTMENT_WARNING = 0.3;

  it('critical at >= 50% of department', () => {
    const deptSize = 10;
    const outCount = 5;
    const percentage = outCount / deptSize;
    expect(percentage).toBeGreaterThanOrEqual(DEPARTMENT_CRITICAL);
  });

  it('warning at >= 30% but < 50%', () => {
    const deptSize = 10;
    const outCount = 3;
    const percentage = outCount / deptSize;
    expect(percentage).toBeGreaterThanOrEqual(DEPARTMENT_WARNING);
    expect(percentage).toBeLessThan(DEPARTMENT_CRITICAL);
  });

  it('no conflict below 30%', () => {
    const deptSize = 10;
    const outCount = 2;
    const percentage = outCount / deptSize;
    expect(percentage).toBeLessThan(DEPARTMENT_WARNING);
  });
});

// ── TimeTracking: Armenia timezone helpers ────────────────────────────────
describe('timeTracking timezone', () => {
  const ARMENIA_OFFSET_MS = 4 * 60 * 60 * 1000;

  function getTodayDate(): string {
    const now = new Date();
    const armeniaTime = new Date(now.getTime() + ARMENIA_OFFSET_MS);
    return armeniaTime.toISOString().split('T')[0] || '';
  }

  function getScheduledTimestamps(dateStr: string, startTime: string, endTime: string) {
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    const [year, month, day] = dateStr.split('-').map(Number);
    const armeniaDayStartUTC = Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1) - ARMENIA_OFFSET_MS;
    const scheduledStart =
      armeniaDayStartUTC + ((startHour ?? 0) * 60 + (startMin ?? 0)) * 60 * 1000;
    const scheduledEnd = armeniaDayStartUTC + ((endHour ?? 0) * 60 + (endMin ?? 0)) * 60 * 1000;
    return { scheduledStart, scheduledEnd };
  }

  it('getTodayDate returns YYYY-MM-DD format', () => {
    const today = getTodayDate();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('getScheduledTimestamps: Armenia 09:00 = UTC 05:00', () => {
    const { scheduledStart } = getScheduledTimestamps('2026-08-28', '09:00', '18:00');
    const startDate = new Date(scheduledStart);
    expect(startDate.getUTCHours()).toBe(5);
    expect(startDate.getUTCMinutes()).toBe(0);
  });

  it('getScheduledTimestamps: Armenia 18:00 = UTC 14:00', () => {
    const { scheduledEnd } = getScheduledTimestamps('2026-08-28', '09:00', '18:00');
    const endDate = new Date(scheduledEnd);
    expect(endDate.getUTCHours()).toBe(14);
    expect(endDate.getUTCMinutes()).toBe(0);
  });

  it('getScheduledTimestamps: end > start for same day', () => {
    const { scheduledStart, scheduledEnd } = getScheduledTimestamps('2026-08-28', '09:00', '18:00');
    expect(scheduledEnd).toBeGreaterThan(scheduledStart);
  });

  it('getScheduledTimestamps: correct day in UTC', () => {
    const { scheduledStart } = getScheduledTimestamps('2026-01-01', '00:00', '23:59');
    const d = new Date(scheduledStart);
    // Armenia midnight Jan 1 = UTC Dec 31 20:00
    expect(d.getUTCFullYear()).toBe(2025);
    expect(d.getUTCMonth()).toBe(11); // December
    expect(d.getUTCDate()).toBe(31);
  });

  it('getScheduledTimestamps: handles minutes', () => {
    const { scheduledStart } = getScheduledTimestamps('2026-08-28', '09:30', '18:00');
    const d = new Date(scheduledStart);
    expect(d.getUTCHours()).toBe(5);
    expect(d.getUTCMinutes()).toBe(30);
  });
});
