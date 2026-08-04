import NextAuth from 'next-auth';
import type { NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import type { GoogleProfile } from '@auth/core/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { importPKCS8, SignJWT } from 'jose';
import { logger } from '@/lib/logger';

// ═══════════════════════════════════════════════════════════════
// VALIDATE ENVIRONMENT — fail fast, not silently
// ═══════════════════════════════════════════════════════════════
const requiredEnvVars = ['AUTH_SECRET', 'AUTH_GOOGLE_ID', 'AUTH_GOOGLE_SECRET'];
const missingVars = requiredEnvVars.filter((v) => !process.env[v]);

if (missingVars.length > 0) {
  logger.error('[Auth.js] ❌ Missing required environment variables:', missingVars);
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`[Auth.js] Missing required env vars: ${missingVars.join(', ')}`);
  }
}

const CONVEX_SITE_URL = process.env.NEXT_PUBLIC_CONVEX_URL!.replace(
  '.convex.cloud',
  '.convex.site',
);

// ═══════════════════════════════════════════════════════════════
// CONVEX HTTP API — shapes we read off the wire
// ═══════════════════════════════════════════════════════════════
type UserRole = 'superadmin' | 'admin' | 'supervisor' | 'employee' | 'driver';

/** Role fields Convex returns for a user; all optional — never trust the wire. */
interface ConvexUserData {
  _id?: string;
  userId?: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
  role?: UserRole;
  organizationId?: string;
  isApproved?: boolean;
}

/** Envelope returned by Convex's `/api/query` and `/api/mutation` endpoints. */
interface ConvexResponse {
  status?: 'success' | 'error';
  value?: ConvexUserData;
}

export const authConfig: NextAuthConfig = {
  providers: [
    Google({
      profile(profile: GoogleProfile) {
        let name: string | undefined = profile.name;

        if (!name && (profile.given_name || profile.family_name)) {
          name = `${profile.given_name || ''} ${profile.family_name || ''}`.trim();
        }

        if (!name && profile.email) {
          name = profile.email.split('@')[0];
        }

        return {
          id: profile.sub,
          name: name || 'User',
          email: profile.email,
          image: profile.picture,
        };
      },
    }),
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email as string;
        const password = credentials?.password as string;
        if (!email || !password) return null;

        const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
        if (!convexUrl) return null;

        try {
          // Verify credentials via Convex auth:login
          const res = await fetch(`${convexUrl}/api/mutation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              path: 'auth:login',
              args: {
                email,
                password,
                sessionToken: crypto.randomUUID(),
                sessionExpiry: Date.now() + 7 * 24 * 60 * 60 * 1000,
              },
            }),
            cache: 'no-store',
          });

          if (!res.ok) return null;
          const data = (await res.json()) as ConvexResponse;
          if (data.status === 'error') return null;

          const user = data.value;
          if (!user?.userId) return null;

          return {
            id: user.userId,
            name: user.name,
            email: user.email,
            image: user.avatarUrl,
            role: user.role,
            organizationId: user.organizationId,
            isApproved: user.isApproved,
          };
        } catch {
          return null;
        }
      },
    }),
  ],

  callbacks: {
    async signIn({ user }) {
      // Fetch user role from Convex on sign-in
      const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
      const email = user.email;

      if (convexUrl && email) {
        try {
          const apiUrl = convexUrl.replace(/\/api$/, '');
          const queryUrl = `${apiUrl}/api/query`;

          const response = await fetch(queryUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              path: 'users.queries.getPublicUserByEmail',
              args: { email },
              format: 'json',
            }),
          });

          if (response.ok) {
            const data = (await response.json()) as ConvexResponse & ConvexUserData;
            const userData: ConvexUserData = data.value ?? data;

            // The provider id (Google sub / UUID) is NOT a Convex user id.
            // Capture the Convex document `_id` so `session.user.id` is safe to
            // use as `Id<'users'>` in every consumer (getServerUser, chat,
            // tasks, profile/update, convex-token, ...).
            if (userData?._id) {
              user.id = userData._id;
            }
            if (userData?.role) {
              user.role = userData.role;
            }
            if (userData?.organizationId) {
              user.organizationId = userData.organizationId;
            }
            if (userData?.isApproved !== undefined) {
              user.isApproved = userData.isApproved;
            }
          }
        } catch (error) {
          logger.error('[Auth.js] Error fetching user role:', error);
        }
      }

      return true;
    },

    async jwt({ token, user, trigger }) {
      if (user) {
        token.name = user.name || 'User';
        token.email = user.email;
        token.picture = user.image;
        token.role = user.role;
        token.organizationId = user.organizationId;
        token.isApproved = user.isApproved;
      }

      // Refresh role data on explicit update trigger
      if (trigger === 'update' && token.email) {
        try {
          const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
          if (convexUrl) {
            const apiUrl = convexUrl.replace(/\/api$/, '');
            const queryUrl = `${apiUrl}/api/query`;

            const response = await fetch(queryUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                path: 'users.queries.getPublicUserByEmail',
                args: { email: token.email },
                format: 'json',
              }),
            });

            if (response.ok) {
              const data = (await response.json()) as ConvexResponse & ConvexUserData;
              const userData: ConvexUserData = data.value ?? data;

              if (userData?.role) token.role = userData.role;
              if (userData?.organizationId) token.organizationId = userData.organizationId;
              if (userData?.isApproved !== undefined) token.isApproved = userData.isApproved;
            }
          }
        } catch (error) {
          logger.error('[Auth.js] Error refreshing user role:', error);
        }
      }

      return token;
    },

    async session({ session, token }) {
      session.user.id = token.sub as string;
      session.user.email = token.email as string;
      session.user.name = token.name || token.email?.split('@')[0] || 'User';
      session.user.image = token.picture;
      session.user.role = token.role;
      session.user.organizationId = token.organizationId;
      session.user.isApproved = token.isApproved;

      // Sign a JWT for Convex auth
      if (process.env.CONVEX_AUTH_PRIVATE_KEY && token.email) {
        try {
          // Vercel stores the key with escaped newlines (\n as literal chars);
          // importPKCS8 needs real newlines. Without this the callback throws,
          // NextAuth returns no session, and OAuth users appear unauthenticated.
          const privateKey = await importPKCS8(
            process.env.CONVEX_AUTH_PRIVATE_KEY.replace(/\\n/g, '\n'),
            'RS256',
          );
          session.convexToken = await new SignJWT({ email: token.email })
            .setProtectedHeader({ alg: 'RS256' })
            .setIssuedAt()
            .setIssuer(CONVEX_SITE_URL)
            .setAudience('convex')
            .setSubject(token.email as string)
            .setExpirationTime('1h')
            .sign(privateKey);
        } catch (err) {
          logger.error('[Auth.js] Failed to sign Convex token:', err);
        }
      }

      return session;
    },
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  session: { strategy: 'jwt' },

  debug: process.env.NODE_ENV === 'development',
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
