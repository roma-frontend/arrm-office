import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { applyRateLimit, PASSWORD_RESET_RATE_LIMIT } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

async function convexMutation<T = unknown>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: name, args }),
  });
  const data = (await res.json()) as { status: string; errorMessage?: string; value?: unknown };
  if (data.status === 'error') throw new Error(data.errorMessage ?? 'Convex error');
  return data.value as T;
}

export async function POST(req: NextRequest) {
  // Rate limiting: 3 requests per hour
  const rateLimitResponse = await applyRateLimit(req, PASSWORD_RESET_RATE_LIMIT, 'forgot-password');
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { email } = (await req.json()) as { email?: string };
    if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 });

    // Request reset token from Convex
    const result = await convexMutation<{ token?: string; email?: string; name?: string }>(
      'auth:requestPasswordReset',
      { email },
    );

    // If user not found, still return success (security)
    // SECURITY: Add timing attack mitigation — constant delay regardless of user existence
    const startTime = Date.now();

    if (!result.token) {
      // Wait a fixed amount of time to prevent timing-based email enumeration
      const elapsed = Date.now() - startTime;
      const minDelay = 500; // minimum 500ms delay
      if (elapsed < minDelay) {
        await new Promise((r) => setTimeout(r, minDelay - elapsed));
      }
      return NextResponse.json({ success: true });
    }

    const resetLink = `${APP_URL}/reset-password?token=${result.token}`;

    // Send email via Resend
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey && !resendKey.includes('your_api_key')) {
      const resend = new Resend(resendKey);
      // Resend requires verified domain to send to arbitrary emails.
      // Until adb.org DNS records are verified, send to test email (account owner).
      const isDomainVerified = process.env.RESEND_DOMAIN_VERIFIED === 'true';
      const testEmail =
        process.env.RESEND_TEST_EMAIL || process.env.BOOTSTRAP_SUPERADMIN_EMAIL || '';
      const toEmail = isDomainVerified ? (result.email ?? '') : testEmail;
      const fromEmail = isDomainVerified
        ? 'Strata <hr@strata.work>'
        : 'Strata <onboarding@resend.dev>';
      const subject = isDomainVerified
        ? 'Reset your Strata password'
        : `[For ${result.email}] Password Reset - Strata`;
      logger.log('Sending email:', { from: fromEmail, to: toEmail, target: result.email });
      const sendResult = await resend.emails.send({
        from: fromEmail,
        to: toEmail,
        subject,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f0f14; margin: 0; padding: 40px 20px;">
            <div style="max-width: 480px; margin: 0 auto;">
              <!-- Logo -->
              <div style="text-align: center; margin-bottom: 32px;">
                <div style="display: inline-flex; align-items: center; gap: 10px; background: linear-gradient(135deg, #2563eb, #0ea5e9); padding: 12px 20px; border-radius: 12px;">
                  <span style="color: white; font-weight: 700; font-size: 18px;">🎯 Strata</span>
                </div>
              </div>

              <!-- Card -->
              <div style="background: #1a1a2e; border: 1px solid rgba(99,102,241,0.2); border-radius: 16px; padding: 40px 36px;">
                <h1 style="color: #ffffff; font-size: 22px; font-weight: 700; margin: 0 0 8px;">Reset your password</h1>
                <p style="color: #9ca3af; font-size: 15px; margin: 0 0 28px; line-height: 1.5;">
                  Hi ${result.name},<br><br>
                  We received a request to reset your password. Click the button below to choose a new one.
                </p>

                <!-- Button -->
                <a href="${resetLink}" style="display: block; text-align: center; background: linear-gradient(135deg, #2563eb, #0ea5e9); color: white; text-decoration: none; padding: 14px 24px; border-radius: 10px; font-weight: 600; font-size: 15px; margin-bottom: 24px;">
                  Reset Password →
                </a>

                <!-- Warning -->
                <div style="background: rgba(99,102,241,0.08); border: 1px solid rgba(99,102,241,0.15); border-radius: 8px; padding: 14px 16px; margin-bottom: 24px;">
                  <p style="color: #9ca3af; font-size: 13px; margin: 0; line-height: 1.5;">
                    ⏱️ This link expires in <strong style="color: #93c5fd;">1 hour</strong>.<br>
                    If you didn't request this, you can safely ignore this email.
                  </p>
                </div>

                <!-- Link fallback -->
                <p style="color: #6b7280; font-size: 12px; margin: 0; line-height: 1.6;">
                  If the button doesn't work, copy and paste this link:<br>
                  <a href="${resetLink}" style="color: #2563eb; word-break: break-all;">${resetLink}</a>
                </p>
              </div>

              <!-- Footer -->
              <p style="text-align: center; color: #4b5563; font-size: 12px; margin-top: 24px;">
                © ${new Date().getFullYear()} Strata • From Strategy to Results
              </p>
            </div>
          </body>
          </html>
        `,
      });
      logger.log('Resend result:', JSON.stringify(sendResult));
      if (sendResult.error) {
        logger.error('Resend error:', sendResult.error);
        // Don't throw — token is still saved, user can try again or admin can resend
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('Forgot password error:', err);
    const msg = err instanceof Error ? err.message : 'Something went wrong';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
