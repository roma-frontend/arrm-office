import { NextResponse } from 'next/server';
import { fetchMutation, fetchQuery } from 'convex/nextjs';
import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { cookies } from 'next/headers';
import { getServerTranslation } from '@/lib/i18n/server-translation';
import { getServerConvexAuth } from '@/lib/server-convex-auth';

export const POST = withCsrfProtection(async (req: Request) => {
  try {
    const cookieStore = await cookies();
    const locale = cookieStore.get('i18nextLng')?.value || 'en';
    const { t } = await getServerTranslation('common', locale);

    const auth = await getServerConvexAuth();
    if (!auth) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    }
    const requesterId = auth.payload.userId;
    const convexAuth = { token: auth.token };

    const body = (await req.json()) as {
      leaveId?: string;
      employeeName?: string;
      startDate?: string;
      endDate?: string;
      leaveType?: string;
    };
    const leaveId: string = body.leaveId ?? '';
    const searchEmployeeName: string = body.employeeName ?? '';
    const searchStartDate: string = body.startDate ?? '';
    const searchEndDate: string = body.endDate ?? '';
    const searchLeaveType: string = body.leaveType ?? '';

    // Fetch all data
    const allLeaves = await fetchQuery(api.leaves.getAllLeaves, {}, convexAuth);
    const allUsers = await fetchQuery(api.users.queries.getAllUsers, {}, convexAuth);

    // Find leave by ID first
    let targetLeave = allLeaves.find((l) => l._id === leaveId);

    // If not found by ID — search by employee name + dates
    if (!targetLeave) {
      targetLeave = allLeaves.find((l) => {
        const leaveUser = allUsers.find((u) => u._id === l.userId);
        const nameOk = searchEmployeeName
          ? leaveUser?.name?.toLowerCase().includes(searchEmployeeName.toLowerCase())
          : true;
        const startOk = searchStartDate ? l.startDate === searchStartDate : true;
        const endOk = searchEndDate ? l.endDate === searchEndDate : true;
        const typeOk = searchLeaveType ? l.type === searchLeaveType : true;
        return nameOk && startOk && endOk && typeOk;
      });
    }

    if (!targetLeave) {
      const preview = allLeaves
        .slice(0, 5)
        .map((l) => {
          const u = allUsers.find((u) => u._id === l.userId);
          return `${u?.name ?? '?'}: ${l.type} ${l.startDate}→${l.endDate} [${l._id}]`;
        })
        .join(', ');
      return NextResponse.json({
        success: false,
        message: t('aiMessages.leaveNotFound', { preview }),
      });
    }

    // Find requester
    const requester = allUsers.find((u) => u._id === requesterId);
    if (!requester) {
      return NextResponse.json({ success: false, message: 'Requester not found' });
    }

    const isAdmin =
      requester.role === 'admin' ||
      requester.role === 'supervisor' ||
      requester.role === 'superadmin';
    const isOwner = targetLeave.userId === requesterId;

    if (!isAdmin && !isOwner) {
      return NextResponse.json({
        success: false,
        message: '❌ You can only cancel your own leave requests.',
      });
    }

    const ownerUser = allUsers.find((u) => u._id === targetLeave.userId);
    const ownerName = ownerUser?.name ?? 'Employee';

    if (isOwner) {
      // Nobody deletes their own leave here — not even HR. For employees the
      // request goes to the HR queue; for HR it goes up the reporting line
      // above them. Either way the deletion is only applied once approved.
      await fetchMutation(
        api.leaves.requestLeaveCancellation,
        {
          leaveId: targetLeave._id as Id<'leaveRequests'>,
        },
        convexAuth,
      );
      return NextResponse.json({
        success: true,
        message: t('aiMessages.leaveCancelRequested', {
          type: targetLeave.type,
          start: targetLeave.startDate,
          end: targetLeave.endDate,
        }),
      });
    }

    await fetchMutation(
      api.leaves.deleteLeave,
      {
        leaveId: targetLeave._id as Id<'leaveRequests'>,
      },
      convexAuth,
    );

    return NextResponse.json({
      success: true,
      message: t('aiMessages.leaveDeleted', {
        owner: isAdmin && !isOwner ? ownerName : '',
        type: targetLeave.type,
        start: targetLeave.startDate,
        end: targetLeave.endDate,
        balanceNote: targetLeave.status === 'approved' ? t('aiMessages.leaveDeletedBalance') : '',
      }),
    });
  } catch (error: unknown) {
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to delete leave',
    });
  }
});
