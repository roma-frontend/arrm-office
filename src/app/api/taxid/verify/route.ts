import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { validateTaxId, maskTaxId } from '@/lib/hvhh';

/**
 * POST /api/taxid/verify
 *
 * Verifies an Armenian tax identification number (ՀՎՀՀ):
 *  1. Local format + checksum validation (always runs, non-blocking).
 *  2. When SRC/KGD credentials are configured via env vars, calls the SRC
 *     e-services endpoint for an authoritative taxpayer-status check.
 *  3. When SRC is not configured, returns a local-only verdict with
 *     `source: 'local'` — the UI shows it as "checked locally" rather than
 *     pretending the tax authority confirmed anything.
 *
 * Env config (all optional; the route degrades gracefully without them):
 *   SRC_API_URL       — e.g. https://api.e-services.am/.../taxpayer/check
 *   SRC_API_USERNAME  — basic-auth username issued by SRC
 *   SRC_API_PASSWORD  — basic-auth password issued by SRC
 *
 * The response never echoes the full number (see `maskTaxId`).
 */

const SRC_TIMEOUT_MS = 15_000;

interface VerifyBody {
  tin?: string;
}

/** Best-effort SRC taxpayer check. Returns a verdict or throws on transport/auth errors. */
async function checkWithSrc(tin: string): Promise<{
  status: 'verified' | 'not_found';
  taxpayerName?: string;
  source: 'src';
}> {
  const url = process.env.SRC_API_URL;
  if (!url) throw new Error('SRC_API_URL not configured');

  // Basic auth is the common SRC e-services contract; keys are server-side only.
  const username = process.env.SRC_API_USERNAME ?? '';
  const password = process.env.SRC_API_PASSWORD ?? '';
  const auth = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SRC_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify({ tin }),
      signal: controller.signal,
    });

    if (!res.ok) {
      // 4xx/5xx from SRC — do not leak response details (may contain PII).
      throw new Error(`SRC returned HTTP ${res.status}`);
    }

    const data = (await res.json()) as Record<string, unknown>;

    // Response shapes differ between SRC services; probe common fields.
    const statusRaw = String(
      data?.status ?? data?.result ?? data?.state ?? data?.code ?? '',
    ).toLowerCase();
    const found = ['found', 'active', 'registered', 'verified', 'true', '1', 'yes'].includes(
      statusRaw,
    );
    const notFound = ['not_found', 'notfound', 'inactive', 'none', 'false', '0', 'no'].includes(
      statusRaw,
    );

    if (notFound) return { status: 'not_found', source: 'src' };
    if (found) {
      const name = typeof data?.name === 'string' ? data.name : undefined;
      return { status: 'verified', taxpayerName: name, source: 'src' };
    }
    // Ambiguous/unknown shape — treat as not verified by SRC.
    return { status: 'not_found', source: 'src' };
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request: Request) {
  // The SRC endpoint is rate-limited and paid-for per application; require an
  // authenticated session so anonymous callers cannot burn the org's quota.
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, status: 'unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as VerifyBody;
    const raw = typeof body.tin === 'string' ? body.tin : '';

    const local = validateTaxId(raw);
    // Never echo the full number — PII.
    const masked = maskTaxId(local.tin);

    if (!local.formatValid) {
      return NextResponse.json({
        ok: false,
        masked,
        status: 'invalid_format',
        source: 'local',
        formatValid: false,
        checksumValid: false,
        message: 'Tax ID must be 8 digits',
      });
    }

    // Authoritative SRC check — only when configured.
    if (process.env.SRC_API_URL) {
      try {
        const src = await checkWithSrc(local.tin);
        return NextResponse.json({
          ok: true,
          masked,
          status: src.status,
          source: src.source,
          taxpayerName: src.taxpayerName,
          formatValid: true,
          checksumValid: local.checksumValid,
          checkedAt: Date.now(),
        });
      } catch {
        // SRC unreachable/misconfigured — fall back to the local verdict.
        return NextResponse.json({
          ok: local.valid,
          masked,
          status: local.valid ? 'valid_local' : 'invalid_checksum',
          source: 'local',
          formatValid: true,
          checksumValid: local.checksumValid,
          srcError: true,
          checkedAt: Date.now(),
        });
      }
    }

    // SRC not configured — local-only verdict.
    return NextResponse.json({
      ok: local.valid,
      masked,
      status: local.valid ? 'valid_local' : 'invalid_checksum',
      source: 'local',
      formatValid: true,
      checksumValid: local.checksumValid,
      srcConfigured: false,
      checkedAt: Date.now(),
    });
  } catch {
    return NextResponse.json({ ok: false, status: 'error' }, { status: 400 });
  }
}
