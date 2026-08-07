/**
 * 🛡️ SECURITY MIDDLEWARE (Edge runtime)
 *
 * Responsibilities:
 *  - Auth guard for protected routes (JWT verified, not just cookie presence)
 *  - Nonce-based CSP (no `unsafe-inline` in production scripts)
 *  - Rate limiting for API routes (IP-only key to avoid UA bypass)
 *  - Security headers (HSTS, X-Frame-Options, Referrer-Policy, …)
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { getToken } from 'next-auth/jwt';
import { checkRateLimit, blockKey } from '@/lib/redis';

// ═══════════════════════════════════════════════════════════════
// JWT — Edge-safe verification via `jose`
// ═══════════════════════════════════════════════════════════════
const jwtSecretRaw = process.env.JWT_SECRET;
if (!jwtSecretRaw || jwtSecretRaw.length < 32) {
  // Throwing at module load forces a fail-fast on Vercel build.
  throw new Error(
    'JWT_SECRET must be set and at least 32 chars long (middleware). ' +
      "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  );
}
const jwtSecret = new TextEncoder().encode(jwtSecretRaw);

async function isValidJWT(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, jwtSecret, { algorithms: ['HS256'] });
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate a NextAuth (Auth.js) session for OAuth users.
 *
 * Google sign-in establishes an Auth.js session cookie and redirects straight
 * to a protected route — but the `hr-auth-token` bridge cookie is only minted
 * client-side *after* landing there. Without accepting the Auth.js session in
 * the middleware, OAuth users bounce protected → /login in a redirect loop.
 */
async function hasValidNextAuthSession(request: NextRequest): Promise<boolean> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return false;
  try {
    const token = await getToken({
      req: request,
      secret,
      secureCookie: process.env.NODE_ENV === 'production',
    });
    return !!token?.email;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// PATH CLASSIFICATION
// ═══════════════════════════════════════════════════════════════
const PUBLIC_PATHS = [
  '/',
  '/login',
  '/register',
  '/register-org',
  '/forgot-password',
  '/reset-password',
  '/privacy',
  '/terms',
  '/features',
  '/contact',
  '/careers',
  '/robots.txt',
  '/sitemap.xml',
  '/favicon.svg',
  '/favicon-animated.svg',
  '/favicon-32x32.svg',
  '/favicon-16x16.svg',
  '/apple-touch-icon.svg',
  '/apple-touch-icon.png',
  '/site.webmanifest',
  '/opengraph-image',
  '/api/health',
  '/api/stripe/webhook',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/face-login',
  '/api/auth/login',
  '/api/auth/oauth-session',
  '/api/auth/create-session',
  '/api/csrf-token',
  '/_next',
];

const STATIC_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.ico',
  '.css',
  '.js',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.map',
  '.txt',
];

const AUTH_PATHS = ['/login', '/register', '/forgot-password', '/reset-password'];

// AuthJS internal client fetch routes — exempt from rate limiting
const AUTHJS_INTERNAL_PATHS = [
  '/api/auth/session',
  '/api/auth/csrf',
  '/api/auth/providers',
  '/api/auth/callback',
  '/api/auth/signin',
  '/api/auth/signout',
];

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/employees',
  '/leaves',
  '/tasks',
  '/attendance',
  '/analytics',
  '/reports',
  '/calendar',
  '/rooms',
  '/settings',
  '/profile',
  '/chat',
  '/ai-chat',
  '/ai-site-editor',
  '/security',
  '/superadmin',
  '/organizations',
  '/join-requests',
  '/org-requests',
  '/org-chart',
  '/onboarding',
  '/offboarding',
  '/help',
  '/drivers',
  '/recruitment',
  '/performance',
  '/learning',
  '/documents',
  '/signatures',
  '/surveys',
  '/goals',
  '/events',
  '/compliance',
  '/compensation',
  '/expenses',
  '/payroll',
  '/admin',
  '/approvals',
  '/recognition',
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (AUTHJS_INTERNAL_PATHS.some((p) => pathname.startsWith(p))) return true;
  if (STATIC_EXTENSIONS.some((ext) => pathname.endsWith(ext))) return true;
  if (AUTH_PATHS.some((prefix) => pathname.startsWith(prefix))) return true;
  // Marketing sub-pages
  if (pathname.startsWith('/features/') || pathname.startsWith('/careers/')) return true;
  return false;
}

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

// ═══════════════════════════════════════════════════════════════
// RATE LIMITING — IP-only (UA was trivially bypassable)
// ═══════════════════════════════════════════════════════════════
interface RateLimitRule {
  /** Stable identifier so rules with the same maxRequests don't share a bucket */
  id: string;
  pattern: (pathname: string) => boolean;
  maxRequests: number;
  windowMs: number;
  blockDurationMs?: number;
}

const RATE_LIMIT_RULES: RateLimitRule[] = [
  {
    id: 'auth-login',
    pattern: (p) => p === '/api/auth/login' || p === '/api/auth/face-login',
    maxRequests: 10,
    windowMs: 15 * 60 * 1000,
    blockDurationMs: 30 * 60 * 1000,
  },
  {
    // Convex auth-bridge token refresh. Called repeatedly by the Convex client
    // to (re)mint a short-lived token from the existing session cookie, so it
    // needs a far more generous budget than sensitive auth mutations. Abuse is
    // bounded anyway: without a valid session cookie it just returns a null token.
    id: 'convex-token',
    pattern: (p) => p === '/api/auth/convex-token',
    maxRequests: 240,
    windowMs: 15 * 60 * 1000,
  },
  {
    id: 'auth-other',
    pattern: (p) => p.startsWith('/api/auth/'),
    maxRequests: 30,
    windowMs: 15 * 60 * 1000,
  },
  {
    id: 'ai-chat',
    pattern: (p) => p.startsWith('/api/chat/') || p.startsWith('/api/ai-site-editor/'),
    maxRequests: 30,
    windowMs: 15 * 60 * 1000,
  },
  {
    id: 'stripe',
    pattern: (p) => p.startsWith('/api/stripe/'),
    maxRequests: 20,
    windowMs: 15 * 60 * 1000,
  },
  {
    id: 'api-default',
    pattern: (p) => p.startsWith('/api/'),
    maxRequests: 100,
    windowMs: 15 * 60 * 1000,
  },
];

function getClientIp(request: NextRequest): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

async function applyRateLimit(
  request: NextRequest,
  pathname: string,
): Promise<NextResponse | null> {
  if (process.env.NODE_ENV !== 'production') return null;
  if (AUTHJS_INTERNAL_PATHS.some((p) => pathname.startsWith(p))) return null;

  const rule = RATE_LIMIT_RULES.find((r) => r.pattern(pathname));
  if (!rule) return null;

  const ip = getClientIp(request);
  const key = `rl:${rule.id}:${ip}`;
  const result = await checkRateLimit(key, rule.maxRequests, rule.windowMs);

  if (!result.allowed) {
    if (rule.blockDurationMs && result.remaining <= -rule.maxRequests) {
      await blockKey(ip, rule.blockDurationMs, `Rate limit exceeded: ${pathname}`);
    }

    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    return new NextResponse(
      JSON.stringify({
        error: 'Too many requests',
        retryAfter,
        message: `Rate limit: ${rule.maxRequests} requests per ${rule.windowMs / 60000}min`,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(rule.maxRequests),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(result.resetAt),
        },
      },
    );
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════
// CSP + SECURITY HEADERS — with per-request nonce in production
// ═══════════════════════════════════════════════════════════════
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // btoa isn't available on Edge runtime for Uint8Array; use custom base64
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str);
}

function buildCsp(nonce: string, isProduction: boolean): string {
  // Production: nonce + strict-dynamic — required for React/Next inline boot scripts
  //   without enabling blanket 'unsafe-inline'.
  // Development: keep 'unsafe-eval' + 'unsafe-inline' because React devtools / HMR
  //   rely on them.
  const scriptSrc = isProduction
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval' https: 'unsafe-inline'`
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https: blob:";

  // 'unsafe-inline' for style-src is still widely needed (Tailwind runtime utility
  // classes can inject inline styles via Radix UI). Accepted trade-off.
  const styleSrc =
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com";

  return [
    "default-src 'self'",
    scriptSrc,
    styleSrc,
    "img-src 'self' blob: data: https://res.cloudinary.com https://lh3.googleusercontent.com https://*.sentry.io https://vercel.live https://va.vercel-scripts.com https://i.ytimg.com https://*.ytimg.com https://*.tile.openstreetmap.org",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://*.convex.cloud https://*.convex.site https://*.sentry.io https://vercel.live https://*.stripe.com https://*.js.stripe.com https://va.vercel-scripts.com https://vitals.vercel-insights.com https://nominatim.openstreetmap.org https://cdn.jsdelivr.net wss://*.convex.cloud wss://*.vercel.live",
    "worker-src 'self' blob: https://cdn.jsdelivr.net",
    "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://*.js.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
    ...(isProduction ? ['report-uri https://*.sentry.io'] : []),
  ].join('; ');
}

function applySecurityHeaders(
  response: NextResponse,
  nonce: string,
  isProduction: boolean,
): NextResponse {
  response.headers.set('Content-Security-Policy', buildCsp(nonce, isProduction));
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(self), microphone=(self), geolocation=(self), fullscreen=(self), clipboard-write=(self), payment=(self), usb=()',
  );
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  response.headers.delete('x-powered-by');
  return response;
}

// ═══════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════════
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProduction = process.env.NODE_ENV === 'production';
  const nonce = generateNonce();

  // Helper to produce a response with nonce + security headers
  const respondWith = (builder: () => NextResponse) => {
    const res = builder();
    res.headers.set('x-nonce', nonce);
    return applySecurityHeaders(res, nonce, isProduction);
  };

  // Pass request header `x-nonce` through to RSC so `headers()` in the
  // Root Layout can pick it up for inline scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  // ── 1) Static / Next internal / API
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/') ||
    STATIC_EXTENSIONS.some((ext) => pathname.endsWith(ext))
  ) {
    if (pathname.startsWith('/api/')) {
      const rl = await applyRateLimit(request, pathname);
      if (rl) return applySecurityHeaders(rl, nonce, isProduction);
    }
    return respondWith(() =>
      NextResponse.next({
        request: { headers: requestHeaders },
      }),
    );
  }

  // ── 2) Public paths
  if (isPublicPath(pathname)) {
    const isMaintenance = request.nextUrl.searchParams.get('maintenance') === 'true';
    const authToken = request.cookies.get('hr-auth-token')?.value;

    // Authenticated users who hit login/register pages get redirected —
    // but only if the JWT actually verifies.
    if (
      AUTH_PATHS.some((prefix) => pathname.startsWith(prefix)) &&
      !isMaintenance &&
      ((await isValidJWT(authToken)) || (await hasValidNextAuthSession(request)))
    ) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return respondWith(() => NextResponse.next({ request: { headers: requestHeaders } }));
  }

  // ── 3) Protected paths — require a *valid* JWT
  if (isProtectedPath(pathname)) {
    const authToken = request.cookies.get('hr-auth-token')?.value;

    // Accept either the credential/face bridge cookie (hr-auth-token) or a
    // valid Auth.js session (Google OAuth users, whose bridge cookie is only
    // minted client-side after they reach the dashboard).
    const hasValidSession =
      (await isValidJWT(authToken)) || (await hasValidNextAuthSession(request));
    if (!hasValidSession) {
      // Invalidate any stale cookies so the user doesn't see a login loop
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('next', pathname);
      const res = NextResponse.redirect(loginUrl);
      if (authToken) res.cookies.delete('hr-auth-token');
      return applySecurityHeaders(res, nonce, isProduction);
    }
  }

  return respondWith(() => NextResponse.next({ request: { headers: requestHeaders } }));
}

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════
export const config = {
  // `models` is excluded deliberately: those are the face-recognition weight
  // files (~6.6 MB across several requests). Running auth middleware over them
  // is pure overhead on every byte, and worse, an unauthenticated request for a
  // weights file could be answered with a redirect to /login — so `fetch` would
  // resolve with `ok: true` and an HTML body, and tfjs would fail decoding it
  // with a shape error that says nothing about what actually happened.
  matcher: [
    '/((?!_next/static|_next/image|models/|favicon\\.svg|favicon-animated\\.svg|site\\.webmanifest).*)',
  ],
};
