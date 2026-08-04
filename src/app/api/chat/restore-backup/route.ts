import { NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { getServerConvexAuth } from '@/lib/server-convex-auth';
import { logger } from '@/lib/logger';

export const POST = withCsrfProtection(async (req: Request) => {
  try {
    const auth = await getServerConvexAuth();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (auth.payload.role !== 'superadmin') {
      return NextResponse.json({ error: 'Only superadmins can restore backups' }, { status: 403 });
    }

    const { backupId } = (await req.json()) as { backupId?: string };
    if (!backupId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    convex.setAuth(auth.token);

    const result = await convex.mutation(api.backups.restoreEmployeeBackup, {
      backupId: backupId as Id<'employeeBackups'>,
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `Employee data restored successfully from backup.`,
        restoredAt: result.restoredAt,
      });
    } else {
      return NextResponse.json({
        success: false,
        message: `Restore failed: Unknown error`,
      });
    }
  } catch (error) {
    logger.error('Restore backup error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to restore backup' },
      { status: 500 },
    );
  }
});
