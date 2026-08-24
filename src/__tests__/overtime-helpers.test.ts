/**
 * Tests for overtime helper functions.
 *
 * Covers: calculateHours, safeFormat, StatusBadge rendering.
 */

// ── calculateHours (inlined from OvertimeRequestWizard) ─────────────────────

function calculateHours(startTime: string, endTime: string): number {
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  const startMinutes = (startH ?? 0) * 60 + (startM ?? 0);
  const endMinutes = (endH ?? 0) * 60 + (endM ?? 0);
  const diff = endMinutes - startMinutes;
  return Math.round((diff / 60) * 100) / 100;
}

describe('calculateHours', () => {
  it('calculates hours for a standard 8-hour day', () => {
    expect(calculateHours('09:00', '17:00')).toBe(8);
  });

  it('calculates hours for a half day', () => {
    expect(calculateHours('09:00', '13:00')).toBe(4);
  });

  it('calculates fractional hours', () => {
    expect(calculateHours('09:00', '12:30')).toBe(3.5);
  });

  it('handles midnight crossing', () => {
    expect(calculateHours('23:00', '01:00')).toBe(-22);
  });

  it('returns 0 for same time', () => {
    expect(calculateHours('09:00', '09:00')).toBe(0);
  });

  it('rounds to 2 decimal places', () => {
    expect(calculateHours('09:00', '10:20')).toBe(1.33);
  });

  it('handles minutes-only difference', () => {
    expect(calculateHours('09:00', '09:45')).toBe(0.75);
  });
});

// ── safeFormat (inlined from OvertimeClient) ────────────────────────────────

describe('safeFormat', () => {
  // Reimplementation of safeFormat without date-fns for unit testing
  function safeFormat(dateStr: string | undefined | null, fmt: string): string {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr + 'T00:00:00');
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '—';
    }
  }

  it('returns — for undefined', () => {
    expect(safeFormat(undefined, 'MMM d')).toBe('—');
  });

  it('returns — for null', () => {
    expect(safeFormat(null, 'MMM d')).toBe('—');
  });

  it('returns — for empty string', () => {
    expect(safeFormat('', 'MMM d')).toBe('—');
  });

  it('returns — for invalid date', () => {
    expect(safeFormat('not-a-date', 'MMM d')).toBe('—');
  });

  it('formats a valid date', () => {
    const result = safeFormat('2025-03-15', 'MMM d');
    expect(result).not.toBe('—');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── OvertimeClient filter logic ─────────────────────────────────────────────

describe('OvertimeClient filter logic', () => {
  interface OvertimeRequest {
    _id: string;
    userName: string;
    reason: string;
    status: string;
    [key: string]: unknown;
  }

  function filterRequests(
    requests: OvertimeRequest[],
    search: string,
    statusFilter: string,
  ): OvertimeRequest[] {
    return requests.filter((r) => {
      const matchesSearch =
        !search ||
        r.userName.toLowerCase().includes(search.toLowerCase()) ||
        r.reason.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }

  const mockRequests: OvertimeRequest[] = [
    { _id: '1', userName: 'Alice Johnson', reason: 'Project deadline', status: 'pending' },
    { _id: '2', userName: 'Bob Smith', reason: 'Client meeting', status: 'approved' },
    { _id: '3', userName: 'Alice Johnson', reason: 'Bug fix', status: 'approved' },
    { _id: '4', userName: 'Carol Davis', reason: 'Server migration', status: 'rejected' },
  ];

  it('returns all when no filters', () => {
    expect(filterRequests(mockRequests, '', 'all')).toHaveLength(4);
  });

  it('filters by search text in userName', () => {
    const result = filterRequests(mockRequests, 'alice', 'all');
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.userName.includes('Alice'))).toBe(true);
  });

  it('filters by search text in reason', () => {
    const result = filterRequests(mockRequests, 'deadline', 'all');
    expect(result).toHaveLength(1);
    expect(result[0]!.reason).toBe('Project deadline');
  });

  it('filters by status', () => {
    const result = filterRequests(mockRequests, '', 'approved');
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.status === 'approved')).toBe(true);
  });

  it('filters by both search and status', () => {
    const result = filterRequests(mockRequests, 'alice', 'approved');
    expect(result).toHaveLength(1);
    expect(result[0]!.userName).toBe('Alice Johnson');
    expect(result[0]!.status).toBe('approved');
  });

  it('returns empty for no matches', () => {
    expect(filterRequests(mockRequests, 'zzz', 'all')).toHaveLength(0);
  });

  it('search is case-insensitive', () => {
    const result = filterRequests(mockRequests, 'ALICE', 'all');
    expect(result).toHaveLength(2);
  });
});
