import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { getServerConvexAuth } from '@/lib/server-convex-auth';

// Opt out of static generation — uses nextUrl.searchParams
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const auth = await getServerConvexAuth();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = req.nextUrl.searchParams.get('organizationId');

    if (!organizationId || organizationId.length < 10) {
      return NextResponse.json({ error: 'Invalid or missing organizationId' }, { status: 400 });
    }

    // Tenant isolation — callers may only list drivers of their own organization
    if (organizationId !== auth.payload.organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    convex.setAuth(auth.token);

    // Get available drivers
    const drivers = await convex.query(api.drivers.queries.getAvailableDrivers, {
      organizationId: organizationId as Id<'organizations'>,
    });

    return NextResponse.json(drivers);
  } catch (error: unknown) {
    console.error('Get drivers error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get drivers' },
      { status: 500 },
    );
  }
}
