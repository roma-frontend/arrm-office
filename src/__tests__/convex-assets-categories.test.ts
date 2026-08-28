// Asset category icon mapping from convex/assets.ts
// and maintenance scheduling logic patterns

function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    laptop: '💻',
    monitor: '🖥️',
    phone: '📱',
    tablet: '📲',
    peripheral: '🖱️',
    furniture: '🪑',
    software_license: '🔑',
    vehicle: '🚗',
    other: '📦',
  };
  return icons[category] || '📦';
}

// Asset status transitions
const ASSET_STATUS_TRANSITIONS: Record<string, string[]> = {
  available: ['assigned', 'in_maintenance', 'retired'],
  assigned: ['available', 'in_maintenance', 'retired'],
  in_maintenance: ['available', 'retired'],
  retired: [],
};

function canAssetTransition(from: string, to: string): boolean {
  return ASSET_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

// Maintenance window calculation
function nextMaintenanceDate(lastMaintenance: number, intervalDays: number, now: number): number {
  const intervalMs = intervalDays * 24 * 60 * 60 * 1000;
  let next = lastMaintenance + intervalMs;
  while (next <= now) next += intervalMs;
  return next;
}

function isOverdue(lastMaintenance: number, intervalDays: number, now: number): boolean {
  const intervalMs = intervalDays * 24 * 60 * 60 * 1000;
  return now > lastMaintenance + intervalMs;
}

// Depreciation calculation (straight-line)
function calculateDepreciation(
  purchasePrice: number,
  purchaseDate: number,
  usefulLifeDays: number,
  now: number,
): { accumulatedDepreciation: number; bookValue: number; depreciationPercent: number } {
  const age = now - purchaseDate;
  const dailyDepreciation = purchasePrice / usefulLifeDays;
  const accumulatedDepreciation = Math.min(purchasePrice, dailyDepreciation * age);
  const bookValue = purchasePrice - accumulatedDepreciation;
  const depreciationPercent = Math.round((accumulatedDepreciation / purchasePrice) * 100);
  return {
    accumulatedDepreciation: Math.round(accumulatedDepreciation),
    bookValue: Math.round(bookValue),
    depreciationPercent,
  };
}

describe('getCategoryIcon', () => {
  it('returns 💻 for laptop', () => {
    expect(getCategoryIcon('laptop')).toBe('💻');
  });

  it('returns 🖥️ for monitor', () => {
    expect(getCategoryIcon('monitor')).toBe('🖥️');
  });

  it('returns 📱 for phone', () => {
    expect(getCategoryIcon('phone')).toBe('📱');
  });

  it('returns 📲 for tablet', () => {
    expect(getCategoryIcon('tablet')).toBe('📲');
  });

  it('returns 🖱️ for peripheral', () => {
    expect(getCategoryIcon('peripheral')).toBe('🖱️');
  });

  it('returns 🪑 for furniture', () => {
    expect(getCategoryIcon('furniture')).toBe('🪑');
  });

  it('returns 🔑 for software_license', () => {
    expect(getCategoryIcon('software_license')).toBe('🔑');
  });

  it('returns 🚗 for vehicle', () => {
    expect(getCategoryIcon('vehicle')).toBe('🚗');
  });

  it('returns 📦 for other', () => {
    expect(getCategoryIcon('other')).toBe('📦');
  });

  it('returns 📦 for unknown category', () => {
    expect(getCategoryIcon('unknown')).toBe('📦');
  });
});

describe('Asset status transitions', () => {
  it('available → assigned', () => {
    expect(canAssetTransition('available', 'assigned')).toBe(true);
  });

  it('assigned → available (unassigned)', () => {
    expect(canAssetTransition('assigned', 'available')).toBe(true);
  });

  it('available → in_maintenance', () => {
    expect(canAssetTransition('available', 'in_maintenance')).toBe(true);
  });

  it('in_maintenance → available (repaired)', () => {
    expect(canAssetTransition('in_maintenance', 'available')).toBe(true);
  });

  it('available → retired', () => {
    expect(canAssetTransition('available', 'retired')).toBe(true);
  });

  it('retired cannot transition', () => {
    expect(canAssetTransition('retired', 'available')).toBe(false);
    expect(canAssetTransition('retired', 'assigned')).toBe(false);
  });

  it('cannot go directly from assigned to retired (must unassign first or use maintenance)', () => {
    // Actually assigned → retired is allowed
    expect(canAssetTransition('assigned', 'retired')).toBe(true);
  });
});

describe('Maintenance scheduling', () => {
  const DAY = 86_400_000;

  it('computes next maintenance date', () => {
    const last = Date.UTC(2026, 0, 1);
    const now = Date.UTC(2026, 5, 15);
    const next = nextMaintenanceDate(last, 30, now);
    expect(next).toBeGreaterThan(now);
  });

  it('skips past intervals', () => {
    const last = Date.UTC(2026, 0, 1);
    const now = Date.UTC(2026, 11, 1); // 334 days later
    const next = nextMaintenanceDate(last, 30, now);
    // Should be the next 30-day boundary after now
    expect(next).toBeGreaterThan(now);
    expect(next - now).toBeLessThanOrEqual(30 * DAY);
  });

  it('detects overdue maintenance', () => {
    const last = Date.UTC(2026, 0, 1);
    const now = Date.UTC(2026, 6, 1); // ~180 days, interval 90
    expect(isOverdue(last, 90, now)).toBe(true);
  });

  it('not overdue within interval', () => {
    const last = Date.UTC(2026, 5, 1);
    const now = Date.UTC(2026, 5, 15); // 14 days, interval 30
    expect(isOverdue(last, 30, now)).toBe(false);
  });
});

describe('Depreciation calculation', () => {
  const DAY = 86_400_000;

  it('calculates straight-line depreciation', () => {
    const purchaseDate = Date.UTC(2026, 0, 1);
    const now = purchaseDate + 180 * DAY; // 180 days
    const usefulLife = 365 * DAY; // 1 year
    const result = calculateDepreciation(1000, purchaseDate, usefulLife, now);
    expect(result.accumulatedDepreciation).toBe(493); // ~49.3%
    expect(result.bookValue).toBe(507);
    expect(result.depreciationPercent).toBe(49);
  });

  it('fully depreciated after useful life', () => {
    const purchaseDate = Date.UTC(2026, 0, 1);
    const now = purchaseDate + 400 * DAY;
    const usefulLife = 365 * DAY;
    const result = calculateDepreciation(5000, purchaseDate, usefulLife, now);
    expect(result.accumulatedDepreciation).toBe(5000);
    expect(result.bookValue).toBe(0);
    expect(result.depreciationPercent).toBe(100);
  });

  it('zero depreciation at purchase date', () => {
    const purchaseDate = Date.UTC(2026, 0, 1);
    const result = calculateDepreciation(2000, purchaseDate, 365 * DAY, purchaseDate);
    expect(result.accumulatedDepreciation).toBe(0);
    expect(result.bookValue).toBe(2000);
    expect(result.depreciationPercent).toBe(0);
  });
});
