'use server';

import { cookies } from 'next/headers';
import { signJWT, verifyJWT } from '@/lib/jwt';
import { logger as log, logger } from '@/lib/logger';

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

interface ConvexResponse<T> {
  status: string;
  value?: T;
  errorMessage?: string;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

async function convexMutation<T>(name: string, args: Record<string, unknown>): Promise<T> {
  try {
    logger.log('🔧 convexMutation called', { name, CONVEX_URL, hasURL: !!CONVEX_URL });
    log.debug('convexMutation called', { name });

    if (!CONVEX_URL) {
      logger.error('❌ CONVEX_URL is undefined!', {
        availableConvexEnvVars: Object.keys(process.env).filter((k) => k.includes('CONVEX')),
      });
      throw new Error('NEXT_PUBLIC_CONVEX_URL environment variable is not set');
    }

    const res = await fetch(`${CONVEX_URL}/api/mutation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: name, args }),
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const data = (await res.json()) as ConvexResponse<T>;

    if (data.status === 'error') {
      throw new Error(data.errorMessage ?? 'Convex error');
    }

    log.debug('convexMutation returning value', {
      resultKeys: data.value && typeof data.value === 'object' ? Object.keys(data.value) : null,
    });

    if (data.value === undefined) {
      throw new Error('Convex mutation returned no value');
    }

    return data.value;
  } catch (error: unknown) {
    const err = toError(error);
    log.error('convexMutation failed', err, {
      name,
      errorMessage: err.message,
      errorType: err.name,
      errorStack: err.stack,
    });

    // Provide better error messages
    if (err.name === 'AbortError') {
      throw new Error('Request timeout - server is not responding');
    } else if (err.message.includes('fetch')) {
      throw new Error('Network error - cannot reach Convex server');
    }

    throw err;
  }
}

async function _convexQuery<T>(name: string, args: Record<string, unknown>): Promise<T> {
  try {
    log.debug('convexQuery called', { name });

    if (!CONVEX_URL) {
      throw new Error('NEXT_PUBLIC_CONVEX_URL environment variable is not set');
    }

    const res = await fetch(`${CONVEX_URL}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: name, args }),
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const data = (await res.json()) as ConvexResponse<T>;

    if (data.status === 'error') {
      throw new Error(data.errorMessage ?? 'Convex error');
    }

    log.debug('convexQuery data parsed', { result: data.value });

    if (data.value === undefined) {
      throw new Error('Convex query returned no value');
    }

    return data.value;
  } catch (error: unknown) {
    const err = toError(error);
    log.error('convexQuery failed', err, {
      name,
      errorMessage: err.message,
      errorType: err.name,
      errorStack: err.stack,
    });

    // Provide better error messages
    if (err.name === 'AbortError') {
      throw new Error('Request timeout - server is not responding');
    } else if (err.message.includes('fetch')) {
      throw new Error('Network error - cannot reach Convex server');
    }

    throw err;
  }
}

interface AuthRegisterResult {
  userId?: string;
  role: 'admin' | 'supervisor' | 'employee' | 'superadmin' | 'driver';
  needsApproval: boolean;
  organizationId?: string;
}

export interface AuthLoginResult {
  userId: string;
  name: string;
  email: string;
  role: 'admin' | 'supervisor' | 'employee' | 'superadmin' | 'driver';
  organizationId?: string;
  organizationSlug?: string;
  organizationName?: string;
  department?: string;
  position?: string;
  employeeType?: 'staff' | 'contractor';
  avatarUrl?: string;
  travelAllowance: number;
  isApproved: boolean;
  totpEnabled: boolean;
  /** Superadmin issued a temporary password — user must set their own now. */
  mustChangePassword?: boolean;
  /** The temporary password's grace window has passed — login refused. */
  tempPasswordExpired?: boolean;
}

export async function registerAction(formData: FormData) {
  const name = formData.get('name') as string;
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const phone = formData.get('phone') as string | undefined;
  const organizationId = formData.get('organizationId') as string | undefined;
  const inviteToken = formData.get('inviteToken') as string | undefined;

  if (!name || !email || !password) throw new Error('All fields required');
  if (password.length < 8) throw new Error('Password must be at least 8 characters');

  const result = await convexMutation<AuthRegisterResult>('auth:register', {
    name,
    email,
    password,
    phone: phone || undefined,
    organizationId: organizationId || undefined,
    inviteToken: inviteToken || undefined,
  });

  // If user needs approval, don't auto-login
  if (result.needsApproval) {
    // Still try to link subscription even if pending approval
    if (result.userId) {
      try {
        await convexMutation('subscriptions:linkSubscriptionToUser', {
          email,
          userId: result.userId,
        });
      } catch {
        // Non-critical — subscription linking can fail silently
      }
    }
    return {
      success: true,
      role: result.role,
      needsApproval: true,
      message:
        'Your account has been created and is pending admin approval. You will be notified once approved.',
    };
  }

  // Auto-login after register (for admin users)
  const sessionToken = crypto.randomUUID();
  const sessionExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000;

  const loginResult = await convexMutation<AuthLoginResult>('auth:login', {
    email,
    password,
    sessionToken,
    sessionExpiry,
  });

  // Link subscription to user (non-critical, fails silently)
  try {
    await convexMutation('subscriptions:linkSubscriptionToUser', {
      email,
      userId: loginResult.userId,
    });
  } catch {
    // Subscription linking is optional — user can still register
  }

  const cookieStore = await cookies();
  const jwt = await signJWT(
    {
      userId: loginResult.userId,
      name: loginResult.name,
      email: loginResult.email,
      role: loginResult.role,
      organizationId: loginResult.organizationId,
      organizationSlug: loginResult.organizationSlug,
      organizationName: loginResult.organizationName,
      department: loginResult.department,
      position: loginResult.position,
      employeeType: loginResult.employeeType,
      avatar: loginResult.avatarUrl,
    },
    '7d',
    cookieStore,
  );

  cookieStore.set('hr-auth-token', jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  });
  cookieStore.set('hr-session-token', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  });

  return {
    success: true,
    role: result.role,
    needsApproval: false,
    userId: loginResult.userId,
    name: loginResult.name,
    email: loginResult.email,
    department: loginResult.department,
    position: loginResult.position,
    employeeType: loginResult.employeeType,
    avatar: loginResult.avatarUrl,
  };
}

export async function loginAction(
  formData: FormData | { email: string; password: string; isFaceLogin?: boolean },
) {
  let email: string = '';
  let password: string;
  let isFaceLogin = false;

  try {
    const endTimer = log.time('User Login');

    log.info('Login action initiated', {
      action: 'login',
      inputType: formData instanceof FormData ? 'FormData' : 'Object',
    });

    if (formData instanceof FormData) {
      email = formData.get('email') as string;
      password = formData.get('password') as string;
    } else {
      email = formData.email;
      password = formData.password;
      isFaceLogin = formData.isFaceLogin || false;
    }

    log.debug('Login credentials parsed', {
      email,
      hasPassword: !!password,
      isFaceLogin,
    });

    // For Face ID login, we don't need password validation
    if (!isFaceLogin && (!email || !password)) {
      throw new Error('Email and password required');
    }

    const sessionToken = crypto.randomUUID();
    const sessionExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000;

    log.api.call('POST', 'auth:login', { email, isFaceLogin });

    let result: AuthLoginResult;
    try {
      result = await convexMutation<AuthLoginResult>('auth:login', {
        email,
        password: password || '', // Empty password for Face ID login
        sessionToken,
        sessionExpiry,
        isFaceLogin, // Pass Face ID login flag
      });

      log.debug('Raw Convex login result', {
        result,
        keys: Object.keys(result),
        types: Object.fromEntries(Object.entries(result).map(([k, v]) => [k, typeof v])),
      });

      log.api.response('POST', 'auth:login', 200, {
        userId: result.userId,
        role: result.role,
      });
    } catch (convexError: unknown) {
      const err = toError(convexError);
      log.error('Convex auth:login mutation failed', err, {
        email,
        isFaceLogin,
        errorMessage: err.message,
        errorName: err.name,
      });
      // Re-throw with a cleaner message
      throw new Error(err.message || 'Authentication failed');
    }

    log.debug('Creating JWT token', { userId: result.userId, name: result.name });

    const cookieStore = await cookies();
    const jwt = await signJWT(
      {
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
      '7d',
      cookieStore,
    );
    log.debug('JWT token created successfully');

    log.debug('Setting authentication cookies');

    cookieStore.set('hr-auth-token', jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });
    cookieStore.set('hr-session-token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    log.info('User logged in successfully', {
      userId: result.userId,
      email: result.email,
      role: result.role,
      isFaceLogin,
    });

    // Auto-unlock Face ID after successful email/password login
    if (!isFaceLogin) {
      try {
        log.debug('Auto-unlocking Face ID after password login', { userId: result.userId });
        await convexMutation('users:autoUnblockFaceId', {
          userId: result.userId,
        });
        log.info('Face ID auto-unlocked successfully', { userId: result.userId });
      } catch (error) {
        log.error(
          'Failed to auto-unlock Face ID',
          error instanceof Error ? error : new Error(String(error)),
          {
            userId: result.userId,
          },
        );
        // Don't fail login if Face ID unlock fails
      }
    }

    endTimer();

    // Return ONLY success flag to avoid serialization issues
    // The client will get user data from the JWT cookie via getSessionAction
    log.debug('Login successful, cookies set');

    return { success: true };
  } catch (error: unknown) {
    log.error('Login action failed', toError(error), {
      action: 'login',
      email,
      isFaceLogin,
    });
    throw error;
  }
}

export async function logoutAction() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('hr-session-token')?.value;
  const jwt = cookieStore.get('hr-auth-token')?.value;

  if (jwt) {
    try {
      const payload = await verifyJWT(jwt);
      if (payload && sessionToken) {
        await convexMutation('auth:logout', { userId: payload.userId });
      }
    } catch {}
  }

  cookieStore.delete('hr-auth-token');
  cookieStore.delete('hr-session-token');
}

export async function getSessionAction() {
  const cookieStore = await cookies();
  const jwt = cookieStore.get('hr-auth-token')?.value;
  if (!jwt) return null;
  return await verifyJWT(jwt);
}

export async function forceClearSessionAction() {
  const cookieStore = await cookies();
  cookieStore.delete('hr-auth-token');
  cookieStore.delete('hr-session-token');
}

export async function updateSessionProfileAction(userId: string, name: string, email: string) {
  try {
    const cookieStore = await cookies();
    const jwt = cookieStore.get('hr-auth-token')?.value;

    if (!jwt) {
      logger.error('[updateSessionProfileAction] No JWT token found');
      throw new Error('Not authenticated');
    }

    const payload = await verifyJWT(jwt);

    if (!payload) {
      logger.error('[updateSessionProfileAction] Invalid JWT payload');
      throw new Error('Invalid token');
    }

    if (payload.userId !== userId) {
      logger.error('[updateSessionProfileAction] User ID mismatch', {
        payloadUserId: payload.userId,
        requestUserId: userId,
      });
      throw new Error('Unauthorized');
    }

    const newJwt = await signJWT(
      {
        userId: payload.userId,
        name,
        email,
        role: payload.role,
        organizationId: payload.organizationId,
        organizationSlug: payload.organizationSlug,
        organizationName: payload.organizationName,
        department: payload.department,
        position: payload.position,
        employeeType: payload.employeeType,
        avatar: payload.avatar,
      },
      '7d',
      cookieStore,
    );

    cookieStore.set('hr-auth-token', newJwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });
    return { success: true };
  } catch (error) {
    logger.error('[updateSessionProfileAction] Error:', error);
    throw error;
  }
}

export async function updateSessionAvatarAction(userId: string, avatarUrl: string) {
  const cookieStore = await cookies();
  const jwt = cookieStore.get('hr-auth-token')?.value;
  if (!jwt) throw new Error('Not authenticated');

  const payload = await verifyJWT(jwt);
  if (!payload || payload.userId !== userId) throw new Error('Unauthorized');

  // Update JWT with new avatar
  const newJwt = await signJWT(
    {
      userId: payload.userId,
      name: payload.name,
      email: payload.email,
      role: payload.role,
      organizationId: payload.organizationId,
      organizationSlug: payload.organizationSlug,
      organizationName: payload.organizationName,
      department: payload.department,
      position: payload.position,
      employeeType: payload.employeeType,
      avatar: avatarUrl,
    },
    '7d',
    cookieStore,
  );

  cookieStore.set('hr-auth-token', newJwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  });

  return { success: true, avatar: avatarUrl };
}
