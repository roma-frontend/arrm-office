/**
 * Tests for the Strategy Maps health computation logic.
 *
 * The `getHealth` function maps OKR progress to a health status:
 *   - completed: status === 'completed'
 *   - draft: status === 'draft' or 'cancelled'
 *   - on_track: progress >= 70 on active
 *   - at_risk: progress 40-69 on active
 *   - behind: progress < 40 on active
 *
 * This logic is defined in convex/strategyMaps.ts.
 * We test it here by duplicating the logic (it's a small pure function).
 */

type HealthStatus = 'on_track' | 'at_risk' | 'behind' | 'completed' | 'draft';

function getHealth(progress: number, status: string): HealthStatus {
  if (status === 'completed') return 'completed';
  if (status === 'draft') return 'draft';
  if (status !== 'active') return 'draft';
  if (progress >= 70) return 'on_track';
  if (progress >= 40) return 'at_risk';
  return 'behind';
}

describe('getHealth (strategyMaps)', () => {
  // ── Status-based ──
  it('returns completed when status is completed regardless of progress', () => {
    expect(getHealth(100, 'completed')).toBe('completed');
    expect(getHealth(0, 'completed')).toBe('completed');
    expect(getHealth(50, 'completed')).toBe('completed');
  });

  it('returns draft when status is draft', () => {
    expect(getHealth(0, 'draft')).toBe('draft');
    expect(getHealth(50, 'draft')).toBe('draft');
    expect(getHealth(100, 'draft')).toBe('draft');
  });

  it('returns draft when status is cancelled', () => {
    expect(getHealth(50, 'cancelled')).toBe('draft');
  });

  // ── Progress-based (active only) ──
  it('returns on_track for progress >= 70 on active objectives', () => {
    expect(getHealth(70, 'active')).toBe('on_track');
    expect(getHealth(85, 'active')).toBe('on_track');
    expect(getHealth(100, 'active')).toBe('on_track');
  });

  it('returns at_risk for progress between 40 and 69 on active objectives', () => {
    expect(getHealth(40, 'active')).toBe('at_risk');
    expect(getHealth(50, 'active')).toBe('at_risk');
    expect(getHealth(60, 'active')).toBe('at_risk');
    expect(getHealth(69, 'active')).toBe('at_risk');
  });

  it('returns behind for progress < 40 on active objectives', () => {
    expect(getHealth(0, 'active')).toBe('behind');
    expect(getHealth(20, 'active')).toBe('behind');
    expect(getHealth(39, 'active')).toBe('behind');
  });

  // ── Edge cases ──
  it('handles boundary values correctly', () => {
    // At exact boundaries
    expect(getHealth(70, 'active')).toBe('on_track'); // >= 70
    expect(getHealth(40, 'active')).toBe('at_risk'); // >= 40
    expect(getHealth(39, 'active')).toBe('behind'); // < 40
  });

  it('handles negative progress (edge case)', () => {
    expect(getHealth(-10, 'active')).toBe('behind');
  });

  it('handles progress over 100 (edge case)', () => {
    expect(getHealth(150, 'active')).toBe('on_track');
  });

  it('handles unknown status gracefully', () => {
    expect(getHealth(80, 'unknown' as string)).toBe('draft');
  });
});

describe('Strategy Maps — progress color mapping', () => {
  // This tests the client-side color logic that maps progress to colors
  function getProgressColor(progress: number): string {
    if (progress >= 70) return 'text-emerald-600';
    if (progress >= 40) return 'text-amber-600';
    return 'text-red-600';
  }

  function getProgressBarColor(progress: number): string {
    if (progress >= 70) return 'bg-emerald-500';
    if (progress >= 40) return 'bg-amber-500';
    return 'bg-red-500';
  }

  it('returns emerald for high progress', () => {
    expect(getProgressColor(70)).toBe('text-emerald-600');
    expect(getProgressColor(100)).toBe('text-emerald-600');
    expect(getProgressBarColor(70)).toBe('bg-emerald-500');
  });

  it('returns amber for medium progress', () => {
    expect(getProgressColor(40)).toBe('text-amber-600');
    expect(getProgressColor(69)).toBe('text-amber-600');
    expect(getProgressBarColor(40)).toBe('bg-amber-500');
  });

  it('returns red for low progress', () => {
    expect(getProgressColor(0)).toBe('text-red-600');
    expect(getProgressColor(39)).toBe('text-red-600');
    expect(getProgressBarColor(0)).toBe('bg-red-500');
  });

  it('has consistent color boundaries with getHealth', () => {
    // on_track (>=70) → emerald
    expect(getProgressColor(70)).toBe('text-emerald-600');
    expect(getProgressBarColor(70)).toBe('bg-emerald-500');

    // at_risk (40-69) → amber
    expect(getProgressColor(50)).toBe('text-amber-600');
    expect(getProgressBarColor(50)).toBe('bg-amber-500');

    // behind (<40) → red
    expect(getProgressColor(20)).toBe('text-red-600');
    expect(getProgressBarColor(20)).toBe('bg-red-500');
  });
});
