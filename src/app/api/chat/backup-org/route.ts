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

    const { organizationId } = (await req.json()) as { organizationId?: string };
    if (!organizationId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    convex.setAuth(auth.token);

    const org = await convex.query(api.organizations.getOrganizationById, {
      callerUserId: auth.payload.userId as Id<'users'>,
      organizationId: organizationId as Id<'organizations'>,
    });
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const result = await convex.mutation(api.backups.createOrgBackups, {
      organizationId: organizationId as Id<'organizations'>,
    });

    return NextResponse.json({
      success: result.success,
      message: `Backup started for ${org.name}. ${result.backedUp} employees queued for backup.`,
      backedUp: result.backedUp,
      failed: result.failed,
    });
  } catch (error) {
    console.error('Backup org error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start backup' },
      { status: 500 },
    );
  }
});
