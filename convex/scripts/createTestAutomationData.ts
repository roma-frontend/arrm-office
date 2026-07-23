/**
 * Script to create test automation data
 * Run with: npx convex run scripts/createTestAutomationData.ts
 */

import { internalMutation } from '../_generated/server';
import { v } from 'convex/values';

export default internalMutation({
  args: {},
  handler: async (ctx) => {
    // Create test automation tasks
    const tasks = [
      { name: 'Daily backup', status: 'completed' as const },
      { name: 'Email notifications', status: 'completed' as const },
      { name: 'Data sync', status: 'running' as const },
      { name: 'Report generation', status: 'pending' as const },
      { name: 'User cleanup', status: 'failed' as const },
    ];

    const createdTasks = [];
    for (const task of tasks) {
      const taskId = await ctx.db.insert('automationTasks', {
        name: task.name,
        status: task.status,
        createdAt: Date.now() - Math.random() * 86400000, // Random time in last 24h
        updatedAt: Date.now(),
      });
      createdTasks.push({ taskId, name: task.name, status: task.status });
    }

    // Create test workflow
    const workflowId = await ctx.db.insert('automationWorkflows', {
      name: 'Employee Onboarding',
      description: 'Автоматическая настройка нового сотрудника',
      config: {
        steps: [
          'Create email account',
          'Assign equipment',
          'Schedule orientation',
          'Add to team channels',
        ],
      },
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Create another workflow
    const workflowId2 = await ctx.db.insert('automationWorkflows', {
      name: 'Leave Approval Auto-Response',
      description: 'Автоматический ответ на заявки отпусков',
      config: {
        trigger: 'leave_request_submitted',
        action: 'send_email_confirmation',
      },
      isActive: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return {
      success: true,
      tasks: createdTasks,
      workflows: [
        { workflowId, name: 'Employee Onboarding' },
        { workflowId: workflowId2, name: 'Leave Approval Auto-Response' },
      ],
    };
  },
});
