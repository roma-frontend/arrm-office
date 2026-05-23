import { NextResponse } from 'next/server';
import { fetchMutation, fetchQuery } from 'convex/nextjs';
import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { cookies } from 'next/headers';
import { getServerTranslation } from '@/lib/i18n/server-translation';

export const POST = withCsrfProtection(async (req: Request) => {
  try {
    const cookieStore = await cookies();
    const locale = cookieStore.get('i18nextLng')?.value || 'en';
    const { t } = await getServerTranslation('common', locale);

    const { leaveId, requesterId, startDate, endDate, days, reason, type } = await req.json();

    if (!leaveId || !requesterId) {
      return NextResponse.json(
        { success: false, message: 'Missing leaveId or requesterId' },
        { status: 400 },
      );
    }

    // Get the leave to validate
    const leaves = await fetchQuery(api.leaves.getAllLeaves, { requesterId: requesterId as any });
    const leave = (leaves as any[]).find((l: any) => l._id === leaveId);

    if (!leave) {
      return NextResponse.json({ success: false, message: 'Leave request not found' });
    }

    // Get requester
    const users = await fetchQuery(api.users.queries.getAllUsers, {
      requesterId: requesterId as any,
    });
    const requester = (users as any[]).find((u: any) => u._id === requesterId);

    if (!requester) {
      return NextResponse.json({ success: false, message: 'User not found' });
    }

    const isAdmin = requester.role === 'admin';
    const isOwner = leave.userId === requesterId;

    if (!isAdmin && !isOwner) {
      return NextResponse.json({
        success: false,
        message:
          "❌ You can only edit your own leave requests. You don't have permission to edit other employees' leaves.",
      });
    }

    if (!isAdmin && leave.status !== 'pending') {
      return NextResponse.json({
        success: false,
        message: t('aiMessages.leaveCannotEdit', { status: leave.status }),
      });
    }

    await fetchMutation(api.leaves.updateLeave, {
      leaveId: leaveId as Id<'leaveRequests'>,
      requesterId: requesterId as Id<'users'>,
      ...(startDate && { startDate }),
      ...(endDate && { endDate }),
      ...(days && { days }),
      ...(reason && { reason }),
      ...(type && { type }),
    });

    return NextResponse.json({
      success: true,
      message: t('aiMessages.leaveUpdated', {
        adminNote: isAdmin && !isOwner ? t('aiMessages.leaveUpdatedAdmin') : '',
      }),
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      message: error.message ?? 'Failed to update leave request',
    });
  }
});
