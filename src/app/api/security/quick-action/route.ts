import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { getServerConvexAuth } from '@/lib/server-convex-auth';

/**
 * Quick Security Action API
 * Allows superadmin to quickly suspend/unsuspend users from notifications
 */
export const POST = withCsrfProtection(async (req: NextRequest) => {
  try {
    const auth = await getServerConvexAuth();
    if (!auth) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    convex.setAuth(auth.token);

    const { action, userId, reason, duration } = await req.json();

    if (!action || !userId) {
      return NextResponse.json(
        { error: 'Missing required fields: action, userId' },
        { status: 400 },
      );
    }

    // Validate action type
    if (!['suspend', 'unsuspend'].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be 'suspend' or 'unsuspend'" },
        { status: 400 },
      );
    }

    let result;

    if (action === 'suspend') {
      if (!reason) {
        return NextResponse.json({ error: 'Reason is required for suspension' }, { status: 400 });
      }

      result = await convex.mutation(api.users.admin.suspendUser, {
        userId: userId as Id<'users'>,
        reason,
        duration: duration || 24, // Default 24 hours
      });

      return NextResponse.json({
        success: true,
        message: `User suspended for ${duration || 24} hours`,
        data: result,
      });
    } else {
      // unsuspend
      result = await convex.mutation(api.users.admin.unsuspendUser, {
        userId: userId as Id<'users'>,
      });

      return NextResponse.json({
        success: true,
        message: 'User unsuspended successfully',
        data: result,
      });
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to perform action';
    console.error('[Quick Action API Error]:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
});
