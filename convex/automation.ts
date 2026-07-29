/**
 * Automation - Query functions for automation dashboard
 */

import { query } from './_generated/server';
import { v } from 'convex/values';
import { DEFAULT_LIST_CAP, XLARGE_LIST_CAP } from './lib/limits';

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const tasks = await ctx.db.query('automationTasks').take(XLARGE_LIST_CAP);
    const workflows = await ctx.db.query('automationWorkflows').take(DEFAULT_LIST_CAP);

    const now = Date.now();
    const last24h = now - 24 * 60 * 60 * 1000;
    const last7d = now - 7 * 24 * 60 * 60 * 1000;

    const recentTasks = tasks.filter((t) => t.createdAt > last24h);
    const previousTasks = tasks.filter((t) => t.createdAt > last7d && t.createdAt <= last24h);

    const completedTasks = tasks.filter((t) => t.status === 'completed').length;
    const pendingTasks = tasks.filter((t) => t.status === 'pending').length;
    const failedTasks = tasks.filter((t) => t.status === 'failed').length;

    const completedTrend = calculateTrend(
      tasks.filter((t) => t.status === 'completed' && t.createdAt > last24h).length,
      previousTasks.filter((t) => t.status === 'completed').length,
    );

    const pendingTrend = calculateTrend(
      tasks.filter((t) => t.status === 'pending' && t.createdAt > last24h).length,
      previousTasks.filter((t) => t.status === 'pending').length,
    );

    const failedTrend = calculateTrend(
      tasks.filter((t) => t.status === 'failed' && t.createdAt > last24h).length,
      previousTasks.filter((t) => t.status === 'failed').length,
    );

    const tasksTrend = calculateTrend(recentTasks.length, previousTasks.length);

    return {
      totalTasks: tasks.length,
      completedTasks,
      pendingTasks,
      failedTasks,
      tasksTrend,
      completedTrend,
      pendingTrend,
      failedTrend,
      activeWorkflows: workflows.filter((w) => w.isActive).length,
    };
  },
});

export const getRecentTasks = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args?.limit ?? 10;
    const tasks = await ctx.db.query('automationTasks').order('desc').take(limit);
    return tasks;
  },
});

export const getActiveWorkflows = query({
  args: {},
  handler: async (ctx) => {
    const workflows = await ctx.db.query('automationWorkflows').take(DEFAULT_LIST_CAP);
    return workflows;
  },
});

function calculateTrend(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}
