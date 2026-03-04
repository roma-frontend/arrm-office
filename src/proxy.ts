import { type NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt';

// ═══════════════════════════════════════════════════════════════
// SECURITY CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const SECURITY_CONFIG = {
  RATE_LIMIT_WINDOW: 60 * 1000, // 1 minute
  RATE_LIMIT_MAX_REQUESTS: 500, // Увеличено для dashboard
  MAX_LOGIN_ATTEMPTS: 5,
  LOGIN_BLOCK_DURATION: 15 * 60 * 1000, // 15 minutes
  DDOS_THRESHOLD: 200,
  SUSPICIOUS_PATHS: ['/admin/php', '/wp-admin', '/phpmyadmin', '/.env', '/.git', '/config'],
};

// Rate limiting & security stores
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const loginAttempts = new Map<string, { count: number; resetTime: number; blockedUntil?: number }>();
const suspiciousIPs = new Set<string>();

// Routes that require authentication
const PROTECTED_ROUTES = [
  '/dashboard',
  '/attendance',
  '/employees',
  '/leaves',
  '/analytics',
  '/reports',
  '/tasks',
  '/calendar',
  '/approvals',
  '/settings',
  '/profile',
  '/admin',
  '/superadmin',
]

// Auth routes
const AUTH_ROUTES = ['/login', '/register']

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  return forwarded?.split(',')[0].trim() || realIP || 'unknown';
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitStore.get(ip);

  if (!record || now > record.resetTime) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + SECURITY_CONFIG.RATE_LIMIT_WINDOW });
    return true;
  }

  if (record.count >= SECURITY_CONFIG.RATE_LIMIT_MAX_REQUESTS) return false;
  record.count++;
  return true;
}

function checkDDoS(ip: string): boolean {
  const record = rateLimitStore.get(ip);
  if (record && record.count > SECURITY_CONFIG.DDOS_THRESHOLD) {
    suspiciousIPs.add(ip);
    console.error(`🚨 Potential DDoS attack from IP: ${ip}`);
    return false;
  }
  return true;
}

function isSuspiciousPath(pathname: string): boolean {
  return SECURITY_CONFIG.SUSPICIOUS_PATHS.some(path => 
    pathname.toLowerCase().includes(path.toLowerCase())
  );
}

function checkLoginAttempts(ip: string): { allowed: boolean; remainingAttempts?: number; blockedUntil?: number } {
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (!record) return { allowed: true, remainingAttempts: SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS };
  if (record.blockedUntil && now < record.blockedUntil) return { allowed: false, blockedUntil: record.blockedUntil };
  if (record.blockedUntil && now >= record.blockedUntil) {
    loginAttempts.delete(ip);
    return { allowed: true, remainingAttempts: SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS };
  }
  if (now > record.resetTime) {
    loginAttempts.set(ip, { count: 0, resetTime: now + SECURITY_CONFIG.LOGIN_BLOCK_DURATION });
    return { allowed: true, remainingAttempts: SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS };
  }

  return {
    allowed: record.count < SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS,
    remainingAttempts: Math.max(0, SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS - record.count),
  };
}

function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.jsdelivr.net https://accounts.google.com https://js.stripe.com https://maps.googleapis.com https://*.sentry.io",
      "worker-src 'self' blob:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: https: blob:",
      "connect-src 'self' https://*.convex.cloud https://*.googleapis.com https://api.groq.com https://api.openai.com https://api.stripe.com https://*.sentry.io wss://*.convex.cloud",
      "frame-src 'self' https://js.stripe.com https://accounts.google.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join('; ')
  );
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(), interest-cohort=()');
  response.headers.delete('X-Powered-By');
  return response;
}

// ═══════════════════════════════════════════════════════════════
// MAIN PROXY FUNCTION
// ═══════════════════════════════════════════════════════════════

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const ip = getClientIP(request);

  // 1. Check suspicious IPs
  if (suspiciousIPs.has(ip) && !pathname.startsWith('/api/')) {
    console.warn(`🚨 Blocked suspicious IP: ${ip}`);
    return new NextResponse('Access Denied', { status: 403 });
  }

  // 2. Check suspicious paths
  if (isSuspiciousPath(pathname)) {
    suspiciousIPs.add(ip);
    console.warn(`🚨 Suspicious path: ${pathname} from ${ip}`);
    return new NextResponse('Not Found', { status: 404 });
  }

  // 3. Rate Limiting
  if (!checkRateLimit(ip)) {
    console.warn(`⚠️ Rate limit exceeded: ${ip}`);
    return new NextResponse('Too Many Requests', {
      status: 429,
      headers: { 'Retry-After': '60' },
    });
  }

  // 4. DDoS Protection
  if (!checkDDoS(ip)) {
    return new NextResponse('Service Unavailable', { status: 503 });
  }

  // 5. Brute Force Protection for login
  if (pathname === '/login' || pathname === '/api/auth/signin') {
    const loginCheck = checkLoginAttempts(ip);
    if (!loginCheck.allowed) {
      const blockedMinutes = loginCheck.blockedUntil 
        ? Math.ceil((loginCheck.blockedUntil - Date.now()) / 60000)
        : 15;
      return new NextResponse(
        JSON.stringify({
          error: 'Too many login attempts',
          message: `Blocked for ${blockedMinutes} minutes`,
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // 6. SQL Injection check in query params
  if (pathname.startsWith('/api/')) {
    const url = new URL(request.url);
    const suspiciousPatterns = [
      /(\bSELECT\b|\bUNION\b|\bDROP\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b)/gi,
      /<script[^>]*>.*?<\/script>/gi,
    ];

    for (const [, value] of url.searchParams.entries()) {
      if (suspiciousPatterns.some(pattern => pattern.test(value))) {
        console.error(`🚨 SQL Injection attempt from ${ip}`);
        suspiciousIPs.add(ip);
        return new NextResponse('Bad Request', { status: 400 });
      }
    }
  }

  // 7. Auth logic
  const token = request.cookies.get('hr-auth-token')?.value;
  const nextAuthToken = request.cookies.get('next-auth.session-token')?.value || 
                        request.cookies.get('__Secure-next-auth.session-token')?.value;
  
  const isAuthRoute = AUTH_ROUTES.some(route => pathname === route || pathname.startsWith(`${route}/`));
  const isProtectedRoute = PROTECTED_ROUTES.some(route => pathname === route || pathname.startsWith(`${route}/`));

  // Если пользователь уже авторизован (через Google или обычный вход)
  if (isAuthRoute && (token || nextAuthToken)) {
    // Получаем URL откуда пришли
    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    
    // Если есть параметр from и это защищенный маршрут, редиректим туда
    if (from && from.startsWith('/')) {
      return NextResponse.redirect(new URL(from, request.url));
    }
    
    // Иначе редиректим на dashboard
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Блокируем доступ к защищенным маршрутам без авторизации
  if (isProtectedRoute && !token && !nextAuthToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 8. Role-based access control
  if (pathname.startsWith('/superadmin') || pathname.startsWith('/admin')) {
    // Check both NextAuth JWT and hr-auth-token (for email/password users)
    const jwtToken = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    const hrAuthToken = request.cookies.get('hr-auth-token')?.value;
    
    // Allow access if user has EITHER token
    if (!jwtToken && !hrAuthToken) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // For superadmin pages: allow if user is authenticated (role check is done client-side)
    // We trust client-side check because user data comes from server session
    if (pathname.startsWith('/superadmin')) {
      // If using NextAuth, check role
      if (jwtToken) {
        // If role is not yet loaded (undefined), allow access temporarily
        // The client-side will do the final check and redirect if needed
        if (jwtToken.role && jwtToken.role !== 'superadmin') {
          console.log('[Middleware] Blocking superadmin access for user with role:', jwtToken.role);
          return NextResponse.redirect(new URL('/dashboard', request.url));
        }
        // If role is undefined or is superadmin, allow access
      }
      // If using hr-auth-token, allow (role check on client)
    }

    if (pathname.startsWith('/admin')) {
      // If using NextAuth, check role
      if (jwtToken) {
        // If role is not yet loaded (undefined), allow access temporarily
        if (jwtToken.role && !['admin', 'superadmin'].includes(jwtToken.role as string)) {
          console.log('[Middleware] Blocking admin access for user with role:', jwtToken.role);
          return NextResponse.redirect(new URL('/dashboard', request.url));
        }
        // If role is undefined or is admin/superadmin, allow access
      }
      // If using hr-auth-token, allow (role check on client)
    }
  }

  // 9. Add security headers and return
  const response = NextResponse.next();
  return addSecurityHeaders(response);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|favicon.svg|icon.svg|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json)$).*)',
  ],
}
