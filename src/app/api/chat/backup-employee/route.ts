import { NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { getServerConvexAuth } from '@/lib/server-convex-auth';

export const POST = withCsrfProtection(async (req: Request) => {
  try {
    const auth = await getServerConvexAuth();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (auth.payload.role !== 'superadmin') {
      return NextResponse.json({ error: 'Only superadmins can run backups' }, { status: 403 });
    }

    const { organizationId, employeeId } = await req.json();
    if (!organizationId || !employeeId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    convex.setAuth(auth.token);

    const employee = await convex.query(api.users.queries.getUserById, { userId: employeeId });
    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    const result = await convex.mutation(api.backups.createEmployeeBackup, {
      organizationId: organizationId as Id<'organizations'>,
      userId: employeeId as Id<'users'>,
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `Backup started for ${employee.name} (${employee.email}).`,
      });
    } else {
      return NextResponse.json({
        success: false,
        message: `Backup failed: ${result.reason}`,
      });
    }
  } catch (error) {
    console.error('Backup employee error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start backup' },
      { status: 500 },
    );
  }
});
