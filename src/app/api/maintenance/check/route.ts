import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

async function convexQuery(path: string, args: Record<string, unknown>) {
  const res = await fetch(`${CONVEX_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args }),
  });
  const data = (await res.json()) as { status: string; value?: unknown };
  if (data.status === 'error') return null;
  return data.value;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get('org');

    if (!orgId) {
      return NextResponse.json({ isActive: false });
    }

    const maintenanceData = (await convexQuery('admin:getMaintenanceMode', {
      organizationId: orgId,
    })) as { isActive?: boolean; startTime?: number } | null;

    const isActive =
      maintenanceData?.isActive &&
      typeof maintenanceData.startTime === 'number' &&
      maintenanceData.startTime <= Date.now();

    return NextResponse.json({ isActive });
  } catch (error) {
    logger.error('Maintenance check error:', error);
    return NextResponse.json({ isActive: false });
  }
}
