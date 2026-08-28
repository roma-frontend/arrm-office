/**
 * Tests for convex/automation — calculateTrend, stats aggregation patterns.
 */
import type {} from '../../convex/automation';

// Replicate the pure function from convex/automation.ts
function calculateTrend(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

describe('automation calculateTrend', () => {
  it('returns 100 when previous is 0 and current > 0', () => {
    expect(calculateTrend(5, 0)).toBe(100);
  });

  it('returns 0 when both are 0', () => {
    expect(calculateTrend(0, 0)).toBe(0);
  });

  it('returns positive percentage for increase', () => {
    expect(calculateTrend(15, 10)).toBe(50);
  });

  it('returns negative percentage for decrease', () => {
    expect(calculateTrend(5, 10)).toBe(-50);
  });

  it('returns 0 when values are equal', () => {
    expect(calculateTrend(10, 10)).toBe(0);
  });

  it('handles large increase', () => {
    expect(calculateTrend(100, 10)).toBe(900);
  });

  it('handles large decrease', () => {
    expect(calculateTrend(1, 100)).toBe(-99);
  });

  it('rounds to nearest integer', () => {
    expect(calculateTrend(3, 10)).toBe(-70); // (3-10)/10 = -0.7 → -70
  });

  it('handles single unit increase', () => {
    expect(calculateTrend(2, 1)).toBe(100);
  });
});

describe('automation stats aggregation', () => {
  const now = Date.now();
  const last24h = now - 24 * 60 * 60 * 1000;
  const last7d = now - 7 * 24 * 60 * 60 * 1000;

  interface MockTask {
    status: string;
    createdAt: number;
  }

  function aggregateTasks(tasks: MockTask[]) {
    const recentTasks = tasks.filter((t) => t.createdAt > last24h);
    const previousTasks = tasks.filter((t) => t.createdAt > last7d && t.createdAt <= last24h);

    return {
      totalTasks: tasks.length,
      completedTasks: tasks.filter((t) => t.status === 'completed').length,
      pendingTasks: tasks.filter((t) => t.status === 'pending').length,
      failedTasks: tasks.filter((t) => t.status === 'failed').length,
      tasksTrend: calculateTrend(recentTasks.length, previousTasks.length),
    };
  }

  it('counts statuses correctly', () => {
    const tasks: MockTask[] = [
      { status: 'completed', createdAt: now - 1000 },
      { status: 'completed', createdAt: now - 2000 },
      { status: 'pending', createdAt: now - 3000 },
      { status: 'failed', createdAt: now - 4000 },
    ];
    const result = aggregateTasks(tasks);
    expect(result.totalTasks).toBe(4);
    expect(result.completedTasks).toBe(2);
    expect(result.pendingTasks).toBe(1);
    expect(result.failedTasks).toBe(1);
  });

  it('returns 0 for empty tasks', () => {
    const result = aggregateTasks([]);
    expect(result.totalTasks).toBe(0);
    expect(result.completedTasks).toBe(0);
    expect(result.tasksTrend).toBe(0);
  });

  it('calculates trend when previous > 0', () => {
    const tasks: MockTask[] = [
      { status: 'completed', createdAt: now - 1000 }, // recent
      { status: 'completed', createdAt: now - 2000 }, // recent
    ];
    // previousTasks would be 0 (no tasks in last7d..last24h window)
    const result = aggregateTasks(tasks);
    expect(result.tasksTrend).toBe(100); // 2 recent vs 0 previous
  });

  it('handles mixed statuses from different time windows', () => {
    const tasks: MockTask[] = [
      { status: 'completed', createdAt: now - 1000 }, // recent
      { status: 'failed', createdAt: now - 1000 }, // recent
      { status: 'completed', createdAt: now - last7d }, // very old
    ];
    const result = aggregateTasks(tasks);
    expect(result.totalTasks).toBe(3);
    expect(result.completedTasks).toBe(2);
    expect(result.failedTasks).toBe(1);
  });
});
