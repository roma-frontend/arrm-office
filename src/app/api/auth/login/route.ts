import { NextRequest, NextResponse } from 'next/server';
import { signJWT } from '@/lib/jwt';
import { calculateRiskScore } from '@/lib/riskScore';
import { withTracing, addSpanAttributes } from '@/lib/tracing';

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

async function convexMutation(path: string, args: Record<string, unknown>) {
  const res = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args }),
  });
  const data = await res.json();
  if (data.status === 'error') throw new Error(data.errorMessage ?? 'Convex error');
  return data.value;
}

async function convexQuery(path: string, args: Record<string, unknown>) {
  const res = await fetch(`${CONVEX_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args }),
  });
  const data = await res.json();
  if (data.status === 'error') return null;
  return data.value;
}

export async function POST(req: NextRequest) {
  return withTracing('auth.login', async () => {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      'unknown';
    const userAgent = req.headers.get('user-agent') ?? undefined;

    let email = '';

    try {
      const body = await req.json();
      email = body.email ?? '';
      const { password, deviceFingerprint, keystrokeSample } = body;

      // Add tracing attributes
      addSpanAttributes({
        'auth.email': email,
        'auth.has_device_fingerprint': !!deviceFingerprint,
        'client.ip': ip,
      });

      if (!email || !password) {
        return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
      }
      if (!CONVEX_URL) {
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
      }

      // ── Check if audit_logging is enabled ────────────────────────────────────
      const auditEnabled = await convexQuery('security:getSetting', { key: 'audit_logging' });
      const adaptiveEnabled = await convexQuery('security:getSetting', { key: 'adaptive_auth' });

      // ── Get recent failed attempts for risk score ─────────────────────────────
      const fifteenMinAgo = Date.now() - 15 * 60 * 1000;
      let recentFailedAttempts = 0;
      const isKnownDevice = false;
      const isTrustedDevice = false;
      let lastLoginDaysAgo: number | undefined;
      let keystrokeSimilarity: number | undefined;

      // We'll check these after we find the user — for now fetch by email first
      // (we do a pre-check via loginAttempts by email)
      const recentByEmail = await convexQuery('security:getLoginStats', {
        hours: 0.25, // last 15 min
      });
      if (recentByEmail) {
        const suspicious = (recentByEmail.suspicious ?? []) as Array<{
          email?: string;
          success?: boolean;
        }>;
        const emailFails = suspicious.filter((a) => a.email === email && !a.success);
        recentFailedAttempts = emailFails.length;
      }

      // ── Calculate risk score ─────────────────────────────────────────────────
      const riskResult = calculateRiskScore({
        ip,
        userAgent,
        deviceFingerprint,
        email,
        method: 'password',
        isKnownDevice,
        isTrustedDevice,
        recentFailedAttempts,
        currentHour: new Date().getHours(),
        keystrokeSimilarity,
        lastLoginDaysAgo,
      });

      // ── Block high-risk if adaptive auth is on ───────────────────────────────
      if (
        adaptiveEnabled &&
        riskResult.action === 'block' &&
        riskResult.factors.includes('multiple_failed_attempts')
      ) {
        if (auditEnabled) {
          await convexMutation('security:logLoginAttempt', {
            email,
            success: false,
            method: 'password',
            ip,
            userAgent,
            deviceFingerprint,
            riskScore: riskResult.score,
            riskFactors: riskResult.factors,
            blockedReason: 'Too many failed attempts — account locked',
          });
        }
        return NextResponse.json(
          {
            error:
              'Account temporarily locked due to multiple failed attempts. Contact your administrator.',
          },
          { status: 429 },
        );
      }

      // ── Proceed with login ───────────────────────────────────────────────────
      const sessionToken = crypto.randomUUID();
      const sessionExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000;

      const res = await fetch(`${CONVEX_URL}/api/mutation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'auth:login',
          args: { email, password, sessionToken, sessionExpiry, isFaceLogin: false },
        }),
      });

      const data = await res.json();

      if (data.status === 'error') {
        // Log failed attempt
        if (auditEnabled) {
          await convexMutation('security:logLoginAttempt', {
            email,
            success: false,
            method: 'password',
            ip,
            userAgent,
            deviceFingerprint,
            riskScore: riskResult.score,
            riskFactors: riskResult.factors,
          });
        }
        return NextResponse.json({ error: data.errorMessage || 'Login failed' }, { status: 401 });
      }

      const result = data.value;

      // ── Check if 2FA is enabled ─────────────────────────────────────────────
      if (result.totpEnabled) {
        // Generate short-lived temp token (5 minutes)
        const tempToken = await signJWT(
          {
            userId: result.userId,
            name: result.name,
            email: result.email,
            role: result.role,
            organizationId: result.organizationId,
            organizationSlug: result.organizationSlug,
            organizationName: result.organizationName,
            department: result.department,
            position: result.position,
            employeeType: result.employeeType,
            avatar: result.avatarUrl,
            type: '2fa-pending',
          },
          '5m',
        );
        return NextResponse.json({
          requiresTwoFactor: true,
          tempToken,
        });
      }

      // ── Check maintenance mode — block non-superadmin login ──────────────────
      if (result.role !== 'superadmin' && result.organizationId) {
        const maintenanceData = await convexQuery('admin:getMaintenanceMode', {
          organizationId: result.organizationId,
        });
        if (maintenanceData?.isActive && maintenanceData.startTime <= Date.now()) {
          return NextResponse.json(
            { error: 'maintenance', organizationId: result.organizationId },
            { status: 503 },
          );
        }
      }

      // ── Register device fingerprint ──────────────────────────────────────────
      if (deviceFingerprint && result.userId) {
        const deviceResult = await convexMutation('security:registerDevice', {
          userId: result.userId,
          fingerprint: deviceFingerprint,
          userAgent,
        });

        // If new device and feature enabled — notify admin
        const newDeviceAlertEnabled = await convexQuery('security:getSetting', {
          key: 'new_device_alert',
        });
        if (newDeviceAlertEnabled && deviceResult?.isNew) {
          // Notify org admins about new device login
          await convexMutation('security:logLoginAttempt', {
            email,
            userId: result.userId,
            organizationId: result.organizationId,
            success: true,
            method: 'password',
            ip,
            userAgent,
            deviceFingerprint,
            riskScore: riskResult.score + 30, // boost score for new device
            riskFactors: [...riskResult.factors, 'new_device'],
          });
        }
      }

      // ── Log successful attempt ───────────────────────────────────────────────
      if (auditEnabled) {
        await convexMutation('security:logLoginAttempt', {
          email,
          userId: result.userId,
          organizationId: result.organizationId,
          success: true,
          method: 'password',
          ip,
          userAgent,
          deviceFingerprint,
          riskScore: riskResult.score,
          riskFactors: riskResult.factors,
        });
      }

      // ── Save keystroke profile if available ──────────────────────────────────
      if (keystrokeSample && result.userId) {
        const keystrokeEnabled = await convexQuery('security:getSetting', {
          key: 'keystroke_dynamics',
        });
        if (keystrokeEnabled) {
          await convexMutation('security:saveKeystrokeProfile', {
            userId: result.userId,
            ...keystrokeSample,
          });
        }
      }

      // ── Create JWT ───────────────────────────────────────────────────────────
      const jwt = await signJWT({
        userId: result.userId,
        name: result.name,
        email: result.email,
        role: result.role,
        organizationId: result.organizationId,
        organizationSlug: result.organizationSlug,
        organizationName: result.organizationName,
        isApproved: result.isApproved,
        department: result.department,
        position: result.position,
        employeeType: result.employeeType,
        avatar: result.avatarUrl,
      });

      const response = NextResponse.json({
        success: true,
        riskLevel: riskResult.level,
        session: {
          userId: result.userId,
          name: result.name,
          email: result.email,
          role: result.role,
          organizationId: result.organizationId,
          organizationSlug: result.organizationSlug,
          organizationName: result.organizationName,
          isApproved: result.isApproved,
          department: result.department,
          position: result.position,
          employeeType: result.employeeType,
          avatar: result.avatarUrl,
        },
      });

      response.cookies.set('hr-auth-token', jwt, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60,
        path: '/',
      });
      response.cookies.set('hr-session-token', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60,
        path: '/',
      });

      return response;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Login error:', error);
      // Log server error attempt
      try {
        await convexMutation('security:logLoginAttempt', {
          email,
          success: false,
          method: 'password',
          ip,
          userAgent,
          blockedReason: `Server error: ${error.message}`,
        });
      } catch {}
      return NextResponse.json(
        { error: error.message || 'Internal server error' },
        { status: 500 },
      );
    }
  });
}
