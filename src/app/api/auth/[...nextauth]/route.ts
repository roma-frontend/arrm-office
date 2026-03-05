import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import type { NextAuthOptions } from "next-auth";

// Validate required environment variables
const requiredEnvVars = ['NEXTAUTH_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);

if (missingVars.length > 0) {
  console.error('[NextAuth] ❌ Missing required environment variables:', missingVars);
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET || 'development-secret-change-in-production',
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      profile(profile: any) {
        console.log('[NextAuth GoogleProvider] PROFILE CALLBACK CALLED with:', {
          sub: profile.sub,
          email: profile.email,
          name: profile.name,
          given_name: profile.given_name,
          family_name: profile.family_name,
          picture: profile.picture,
        });
        
        // Extract name from multiple possible Google profile fields
        let name = profile.name;
        
        // If name is empty, try given_name + family_name
        if (!name && (profile.given_name || profile.family_name)) {
          name = `${profile.given_name || ''} ${profile.family_name || ''}`.trim();
        }
        
        // If still no name, use email prefix as fallback
        if (!name && profile.email) {
          name = profile.email.split('@')[0];
        }
        
        console.log('[NextAuth GoogleProvider] Profile processing result:', {
          originalName: profile.name,
          givenName: profile.given_name,
          familyName: profile.family_name,
          extractedName: name,
          email: profile.email,
          finalName: name || 'User',
        });
        
        return {
          id: profile.sub,
          name: name || 'User',
          email: profile.email,
          image: profile.picture,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      // OAuth sign in successful
      // User will be created/updated in Convex via client-side hook
      return true;
    },
    async jwt({ token, user, account, profile, trigger }) {
      // On first sign in, persist user data and fetch role
      if (user) {
        console.log("[NextAuth JWT] User sign-in detected:", {
          name: user.name,
          email: user.email,
          image: user.image,
          profileName: (profile as any)?.name,
          profileGivenName: (profile as any)?.given_name,
          profileFamilyName: (profile as any)?.family_name,
        });
        
        // Better name extraction from user and profile
        let name = user.name;
        
        // If no name, try to extract from profile (Google-specific fields)
        if (!name && profile) {
          const googleProfile = profile as any;
          if (googleProfile.given_name || googleProfile.family_name) {
            name = `${googleProfile.given_name || ''} ${googleProfile.family_name || ''}`.trim();
          } else if (googleProfile.name) {
            name = googleProfile.name;
          }
        }
        
        // Final fallback: use email prefix
        if (!name && user.email) {
          name = user.email.split('@')[0];
        }
        
        token.name = name || 'User';
        token.email = user.email;
        token.picture = user.image;
        
        console.log("[NextAuth JWT] Token after setting basic fields:", {
          name: token.name,
          email: token.email,
          picture: token.picture,
          finalName: name,
        });
      } else {
        // For subsequent calls, preserve existing token values
        console.log("[NextAuth JWT] Subsequent call - preserving token:", {
          name: token.name,
          email: token.email,
        });
      }
      
      // Fetch user role from Convex (outside if/else)
      try {
        const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
        if (convexUrl && (user?.email || token.email)) {
          // Use the HTTP API to query Convex
          const apiUrl = convexUrl.replace('/api', ''); // Remove /api if present
          const queryUrl = `${apiUrl}/api/query`;
          
          const emailToQuery = user?.email || token.email;
          console.log("[NextAuth JWT] Fetching user role from Convex for:", emailToQuery);
          
          const response = await fetch(queryUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              path: 'users:getUserByEmail',
              args: { email: emailToQuery },
              format: 'json',
            }),
          });
          
          if (response.ok) {
            const data = await response.json();
            // Convex returns data in 'value' field or directly
            const userData = data.value || data;
            console.log("[NextAuth JWT] Convex response:", userData ? {
              id: userData._id,
              name: userData.name,
              email: userData.email,
              role: userData.role,
            } : "NULL");
            
            if (userData?.role) {
              token.role = userData.role;
              console.log('[NextAuth JWT] ✅ Set role in token:', userData.role, 'for', emailToQuery);
            } else {
              console.warn('[NextAuth JWT] ⚠️  No role found for user:', emailToQuery);
            }
          } else {
            console.error('[NextAuth JWT] ❌ Failed to fetch user role:', response.status, response.statusText, await response.text());
          }
        }
      } catch (error) {
        console.error('[NextAuth JWT] ❌ Error fetching user role:', error);
        // Don't block login if role fetch fails
      }
      
      // On subsequent calls, role is already in token
      // If you need to refresh role, add logic here based on trigger === "update"
      
      return token;
    },
    async redirect({ url, baseUrl }) {
      // Allow redirects to any internal URL
      if (url.startsWith(baseUrl)) return url;
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      // Only redirect to dashboard for external URLs or as fallback
      return baseUrl;
    },
    async session({ session, token }) {
      // Add user info to session
      console.log("[NextAuth Session] Building session from token:", {
        sub: token.sub,
        name: token.name,
        email: token.email,
        picture: token.picture,
        role: token.role,
      });
      
      if (session.user) {
        session.user.id = token.sub!;
        session.user.email = token.email!;
        
        // Ensure name is ALWAYS set - never null, undefined, or just "User" without proper fallback
        session.user.name = token.name || token.email!.split("@")[0] || "User";
        
        // CRITICAL: Validate that we don't have "User" when we should have a better name
        if (session.user.name === "User" && token.email) {
          console.warn("[NextAuth Session] ⚠️  WARNING: user has name 'User' but email is:", token.email);
        }
        
        session.user.image = token.picture as string | undefined;
        
        // Properly set role on the session user object
        if (token.role) {
          session.user.role = token.role as 'superadmin' | 'admin' | 'supervisor' | 'employee';
        }
        
        console.log("[NextAuth Session] ✅ Final session.user:", {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          image: session.user.image,
          role: session.user.role,
        });
      }
      
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
};

const handler = NextAuth(authOptions);

// Properly export the handler for all HTTP methods
export { handler as GET, handler as POST };
