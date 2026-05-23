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
    const body = await req.json();
    const leaveId: string = body.leaveId ?? '';
    const requesterId: string = body.requesterId ?? '';
    const searchEmployeeName: string = body.employeeName ?? '';
    const searchStartDate: string = body.startDate ?? '';
    const searchEndDate: string = body.endDate ?? '';
    const searchLeaveType: string = body.leaveType ?? '';

    if (!requesterId) {
      return NextResponse.json({ success: false, message: 'Missing requesterId' }, { status: 400 });
    }

    // Fetch all data
    const allLeaves = await fetchQuery(api.leaves.getAllLeaves, {
      requesterId: requesterId as any,
    });
    const allUsers = await fetchQuery(api.users.queries.getAllUsers, {
      requesterId: requesterId as any,
    });

    // Find leave by ID first
    let targetLeave = (allLeaves as any[]).find((l: any) => l._id === leaveId);

    // If not found by ID — search by employee name + dates
    if (!targetLeave) {
      targetLeave = (allLeaves as any[]).find((l: any) => {
        const leaveUser = (allUsers as any[]).find((u: any) => u._id === l.userId);
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
      const preview = (allLeaves as any[])
        .slice(0, 5)
        .map((l: any) => {
          const u = (allUsers as any[]).find((u: any) => u._id === l.userId);
          return `${u?.name ?? '?'}: ${l.type} ${l.startDate}→${l.endDate} [${l._id}]`;
        })
        .join(', ');
      return NextResponse.json({
        success: false,
        message: t('aiMessages.leaveNotFound', { preview }),
      });
    }

    // Find requester
    const requester = (allUsers as any[]).find((u: any) => u._id === requesterId);
    if (!requester) {
      return NextResponse.json({ success: false, message: 'Requester not found' });
    }

    const isAdmin = requester.role === 'admin';
    const isOwner = targetLeave.userId === requesterId;

    if (!isAdmin && !isOwner) {
      return NextResponse.json({
        success: false,
        message: '❌ You can only delete your own leave requests.',
      });
    }

    const ownerUser = (allUsers as any[]).find((u: any) => u._id === targetLeave.userId);
    const ownerName = ownerUser?.name ?? 'Employee';

    await fetchMutation(api.leaves.deleteLeave, {
      leaveId: targetLeave._id as Id<'leaveRequests'>,
      requesterId: requesterId as Id<'users'>,
    });

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
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      message: error.message ?? 'Failed to delete leave',
    });
  }
});
