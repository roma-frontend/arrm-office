/**
 * Automation - Actions (for operations with delays, external APIs, etc.)
 */

import { action } from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';

// Isolate internal API reference at module level to avoid deep type instantiation
const internalAutomation = internal.automationMutations;

interface RunAutomationResult {
  success: boolean;
  taskId: string;
}

export const runAutomation = action({
  args: {},
  handler: async (ctx): Promise<RunAutomationResult> => {
    // Create a new automation task via internal mutation
    const taskId: string = await ctx.runMutation(internalAutomation.createAutomationTask, {
      name: 'Manual automation run',
    });

    // Simulate automation execution with delay
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Update task status via internal mutation
    await ctx.runMutation(internalAutomation.completeAutomationTask, {
      taskId: taskId as Id<'automationTasks'>,
    });

    return { success: true, taskId };
  },
});
