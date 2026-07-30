/**
 * Script to create a test ticket for superadmin to see the issue
 * Run with: npx convex run scripts/createTestTicket.ts
 */

import { internalMutation } from '../_generated/server';
export default internalMutation({
  args: {},
  handler: async (ctx) => {
    // Find superadmin user
    const superadmin = await ctx.db
      .query('users')
      .filter((q) => q.eq(q.field('role'), 'superadmin'))
      .first();

    if (!superadmin) {
      throw new Error('No superadmin user found');
    }

    // Create a test ticket
    const ticketId = await ctx.db.insert('supportTickets', {
      createdBy: superadmin._id,
      organizationId: superadmin.organizationId,
      ticketNumber: `#TEST-${Date.now()}`,
      title: 'Тестовый тикет - Проблема с автоматизацией',
      description:
        'Это тестовый тикет для проверки работы системы тикетов.\n\nПроблема: Суперадмин хочет увидеть как выглядит тикет в системе.\n\nОжидаемое поведение: Тикет должен отображаться в списке тикетов суперадмина.',
      priority: 'medium',
      category: 'technical',
      status: 'open',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      assignedTo: undefined,
      resolvedAt: undefined,
      resolvedBy: undefined,
      relatedLeaveId: undefined,
      relatedDriverRequestId: undefined,
      relatedTaskId: undefined,
      resolution: undefined,
      slaDeadline: undefined,
      firstResponseAt: undefined,
    });

    // Create initial comment
    await ctx.db.insert('ticketComments', {
      ticketId: ticketId,
      organizationId: superadmin.organizationId,
      authorId: superadmin._id,
      message: 'Это первый комментарий в тестовом тикете. Создан автоматически для тестирования.',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isInternal: false,
      attachments: undefined,
    });

    return {
      success: true,
      ticketId,
      message: 'Тестовый тикет создан!',
      superadminEmail: superadmin.email,
    };
  },
});
