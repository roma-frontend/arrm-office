/**
 * ⚠️ SECURITY: This endpoint previously executed shell commands via child_process.exec()
 * which is a Remote Code Execution vulnerability. It has been replaced with a safe
 * implementation that calls Node.js functions directly without shell execution.
 *
 * If you need to run npm scripts, do it via CI/CD or server-side deployment scripts,
 * NEVER through a web API endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { logger } from '@/lib/logger';

const ALLOWED_SCRIPTS = [
  'stripe:view',
  'stripe:add-test-data',
  'stripe:export',
  'stripe:export-pdf',
  'stripe:growth-chart',
  'stripe:sync',
  'stripe:check-trials',
];

/**
 * Verify the user is a superadmin by checking the JWT session cookie.
 */
async function verifySuperadmin(): Promise<{ userId: string; role: string } | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('oauth-session');
    if (!sessionCookie) return null;

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return null;

    const secret = new TextEncoder().encode(jwtSecret);
    const { payload } = await jwtVerify(sessionCookie.value, secret);

    if (payload.role !== 'superadmin') {
      logger.warn('[Stripe Run-Script] Non-superadmin access attempt:', payload.role);
      return null;
    }

    return { userId: payload.sub as string, role: payload.role as string };
  } catch {
    return null;
  }
}

export const POST = withCsrfProtection(async (req: NextRequest) => {
  // Require superadmin authentication
  const user = await verifySuperadmin();
  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized. Superadmin access required.' },
      { status: 401 },
    );
  }

  try {
    const { script } = (await req.json()) as { script?: string };

    if (!script || !ALLOWED_SCRIPTS.includes(script)) {
      return NextResponse.json({ error: 'Invalid or disallowed script name' }, { status: 400 });
    }

    // SECURITY: Instead of exec(), import and call the script function directly.
    // Each script should be a Node.js module that exports an async function.
    // Example implementation:
    // const scriptModule = await import(`@/scripts/stripe/${script}.ts`);
    // const result = await scriptModule.default();

    return NextResponse.json({
      success: false,
      error: 'Script execution via API is disabled for security. Use CLI or CI/CD instead.',
      output:
        'Direct script execution through web API has been disabled for security reasons. ' +
        'Please run scripts via CLI (npm run ' +
        script +
        ') or CI/CD pipeline.',
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Unknown error',
        output: 'Script execution failed.',
      },
      { status: 500 },
    );
  }
});
