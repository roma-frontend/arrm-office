import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { resolveConvexUserIdByEmail } from '@/lib/convex-server-query';
import { logger } from '@/lib/logger';

export async function GET(_request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // `session.user.id` is the provider subject (UUID / Google sub), NOT a
    // Convex user id — resolve the Convex `_id` from the verified email so
    // consumers can safely use it as `Id<'users'>`.
    const email = session.user.email;
    const convexUserId = email ? await resolveConvexUserIdByEmail(email) : null;

    return NextResponse.json({
      userId: convexUserId ?? '',
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
    });
  } catch (error) {
    logger.error('[Metrics API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
