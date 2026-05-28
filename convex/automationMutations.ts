/**
 * Automation - Mutation functions
 */

import { mutation } from './_generated/server';
import { internalMutation } from './_generated/server';
import { v } from 'convex/values';

// Public mutation that triggers the action
export const runAutomation = mutation({
  args: {},
  handler: async (ctx) => {
    // Just create the task, action will handle the rest
    const taskId = await ctx.db.insert('automationTasks', {
      name: 'Manual automation run',
      status: 'running',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { success: true, taskId };
  },
});

// Internal mutations for action
export const createAutomationTask = internalMutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const taskId = await ctx.db.insert('automationTasks', {
      name: args.name,
      status: 'running',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return taskId;
  },
});

export const completeAutomationTask = internalMutation({
  args: { taskId: v.id('automationTasks') },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.taskId, {
      status: 'completed',
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

export const toggleWorkflow = mutation({
  args: { workflowId: v.id('automationWorkflows') },
  handler: async (ctx, args) => {
    const workflow = await ctx.db.get(args.workflowId);
    if (!workflow) {
      throw new Error('Workflow not found');
    }

    await ctx.db.patch(args.workflowId, {
      isActive: !workflow.isActive,
      updatedAt: Date.now(),
    });

    return { success: true, isActive: !workflow.isActive };
  },
});

export const createWorkflow = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    config: v.any(),
  },
  handler: async (ctx, args) => {
    const workflowId = await ctx.db.insert('automationWorkflows', {
      name: args.name,
      description: args.description || '',
      config: args.config,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { success: true, workflowId };
  },
});

export const deleteWorkflow = mutation({
  args: { workflowId: v.id('automationWorkflows') },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.workflowId);
    return { success: true };
  },
});
