import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';

export interface ChatAuth {
  userId: string;
  role: string;
  organizationId?: string;
}

/**
 * Verify the JWT auth cookie for chat/AI API routes.
 * Shared by /api/chat and every assistant side-endpoint (memory, web search,
 * image generation, smart titles, shares, feedback).
 */
export async function verifyChatAuth(): Promise<ChatAuth | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('hr-auth-token') || cookieStore.get('oauth-session');
    if (!token) return null;

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return null;

    const secret = new TextEncoder().encode(jwtSecret);
    const { payload } = await jwtVerify(token.value, secret);
    return {
      userId: payload.sub as string,
      role: (payload.role as string) || 'employee',
      organizationId: payload.organizationId as string | undefined,
    };
  } catch {
    return null;
  }
}
