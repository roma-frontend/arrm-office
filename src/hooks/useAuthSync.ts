"use client";

import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export function useAuthSync() {
  const { data: session, status } = useSession();
  const { login, logout, isAuthenticated } = useAuthStore();
  const createOAuthUser = useMutation(api.users.createOAuthUser);
  const sessionCreated = useRef(false);
  const lastSyncedUserRef = useRef<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  
  // Get current user by email
  const currentUser = useQuery(
    api.users.getCurrentUser,
    userEmail ? { email: userEmail } : "skip"
  );

  useEffect(() => {
    const syncAuth = async () => {
      console.log("[useAuthSync] Status:", status, "Session:", session?.user?.email);
      console.log("[useAuthSync] Session user name:", session?.user?.name);
      console.log("[useAuthSync] userEmail state:", userEmail);
      
      if (status === "loading") {
        console.log("[useAuthSync] Still loading...");
        return;
      }

      // When NextAuth logs user out, clear everything
      // BUT only if we don't have a valid email/password session (JWT cookie)
      if (status === "unauthenticated") {
        const { isAuthenticated } = useAuthStore.getState();
        if (isAuthenticated) {
          // User logged in via email/password — JWT session is active, don't logout
          console.log("[useAuthSync] NextAuth unauthenticated but email/password session active - skipping logout");
          return;
        }
        console.log("[useAuthSync] NextAuth unauthenticated and no active session - logging out");
        logout();
        setUserEmail(null);
        sessionCreated.current = false;
        return;
      }

      // If authenticated via NextAuth
      if (status === "authenticated" && session?.user) {
        console.log("[useAuthSync] Authenticated! User:", session.user.email);
        console.log("[useAuthSync] Session user full details:", {
          email: session.user.email,
          name: session.user.name,
          image: session.user.image,
          id: session.user.id,
        });
        
        // Only sync if user email changed (prevent excess mutations)
        if (userEmail !== session.user.email) {
          console.log("[useAuthSync] Email changed, syncing to Convex...");
          try {
            // Ensure name is never empty
            const finalName = session.user.name?.trim() || session.user.email!.split("@")[0] || 'User';
            console.log("[useAuthSync] Name extraction:", {
              sessionName: session.user.name,
              sessionNameTrimmed: session.user.name?.trim(),
              emailPrefix: session.user.email!.split("@")[0],
              finalName,
            });
            const userData = {
              email: session.user.email!,
              name: finalName,
              avatarUrl: session.user.image || undefined,
            };
            
            const result = await createOAuthUser(userData);
            console.log("[useAuthSync] User synced to Convex with name:", finalName);
            setUserEmail(session.user.email!);
          } catch (error) {
            console.error("[useAuthSync] Error syncing OAuth user:", error);
          }
        }
      }
    };

    syncAuth();
  }, [status, session?.user?.email, userEmail, createOAuthUser]);

  // Separate effect to handle user data once it's loaded
  useEffect(() => {
    console.log("[useAuthSync] Effect 2 triggered");
    console.log("[useAuthSync]   currentUser:", currentUser ? { id: currentUser._id, name: currentUser.name, email: currentUser.email, role: currentUser.role } : null);
    console.log("[useAuthSync]   session.user:", session?.user ? { name: session.user.name, email: session.user.email, role: (session.user as any).role } : null);
    
    if (!session?.user?.email) {
      console.log("[useAuthSync] ❌ No session.user - skipping sync");
      return;
    }

    // Prevent syncing the same user multiple times (race condition safeguard)
    if (lastSyncedUserRef.current === session.user.email) {
      console.log("[useAuthSync] ℹ️  Already synced", session.user.email, "- skipping to prevent race condition");
      return;
    }

    // If we have currentUser from Convex, use it (has full profile)
    if (currentUser) {
      console.log("[useAuthSync] ✅ Current user from Convex:", {
        id: currentUser._id,
        name: currentUser.name,
        email: currentUser.email,
        role: currentUser.role,
        department: currentUser.department,
        position: currentUser.position,
      });
      
      // If user name is "User" but we have better name from session, use that
      let finalName = currentUser.name;
      if (currentUser.name === "User" || !currentUser.name) {
        const sessionName = session.user.name?.trim();
        if (sessionName && sessionName !== "User") {
          console.log("[useAuthSync] 📝 Upgrading name from DB", currentUser.name, "to session name:", sessionName);
          finalName = sessionName;
        }
      }
      
      console.log("[useAuthSync] 📤 Syncing to useAuthStore from Convex...");
      
      // Sync to useAuthStore
      const { login } = useAuthStore.getState();
      login({
        id: currentUser._id,
        name: finalName,
        email: currentUser.email,
        role: currentUser.role,
        avatar: currentUser.avatarUrl,
        department: currentUser.department,
        position: currentUser.position,
        employeeType: currentUser.employeeType,
        organizationId: currentUser.organizationId,
      });
      
      console.log("[useAuthSync] ✅ User logged into useAuthStore:", {
        id: currentUser._id,
        name: finalName,
        email: currentUser.email,
        role: currentUser.role,
      });
      
      // Mark as synced to prevent race condition re-syncs
      lastSyncedUserRef.current = currentUser.email;
    } else if (session.user.email) {
      // Fallback: if Convex query hasn't returned yet, sync using NextAuth session data
      console.log("[useAuthSync] ⏳ Convex query pending, using NextAuth session data as fallback...");
      console.log("[useAuthSync]   session.user.name:", session.user.name);
      const { login } = useAuthStore.getState();
      
      // Ensure name is properly extracted - session.user.name should already be set by NextAuth
      const syncName = session.user.name?.trim() || session.user.email!.split("@")[0] || "User";
      
      console.log("[useAuthSync] Using final name for sync:", {
        originalSessionName: session.user.name,
        finalName: syncName,
      });
      
      // Map NextAuth session to our User type
      login({
        id: session.user.id || `nextauth-${Date.now()}`,
        name: syncName,
        email: session.user.email!,
        role: ((session.user as any).role as any) || 'employee',
        avatar: session.user.image,
        organizationId: ((session.user as any).organizationId as string | undefined),
        department: ((session.user as any).department as string | undefined),
        position: ((session.user as any).position as string | undefined),
        employeeType: ((session.user as any).employeeType as any),
      });
      
      console.log("[useAuthSync] ⚠️  User logged into useAuthStore from NextAuth fallback:", {
        id: session.user.id,
        name: syncName,
        email: session.user.email,
        role: (session.user as any).role,
      });
      
      // Mark as synced to prevent race condition re-syncs
      lastSyncedUserRef.current = session.user.email;
    }
    
    // Create server-side session cookie for dashboard auth (only once per user)
    if (!sessionCreated.current) {
      sessionCreated.current = true;
      
      const createSession = async () => {
        try {
          // Check if we're in maintenance mode
          const params = new URLSearchParams(window.location.search);
          const isMaintenance = params.get('maintenance') === 'true';
          
          // Skip redirect if in maintenance mode or already on dashboard/login
          if (isMaintenance) {
            console.log("[useAuthSync] Maintenance mode detected - not redirecting");
            return;
          }
          
          // Only redirect if we're on auth pages (login/register), not if already on a dashboard page
          const path = window.location.pathname;
          const isAuthPage = path === '/login' || path === '/register' || path.startsWith('/register-org');
          const isDashboardPage = path === '/dashboard' || path.startsWith('/superadmin') || path.startsWith('/admin') || path.startsWith('/employees') || path.startsWith('/tasks') || path.startsWith('/calendar') || path.startsWith('/leaves') || path.startsWith('/attendance') || path.startsWith('/settings') || path.startsWith('/chat') || path.startsWith('/analytics') || path.startsWith('/reports') || path.startsWith('/join-requests') || path.startsWith('/org-requests') || path.startsWith('/approvals') || path.startsWith('/profile') || path.startsWith('/ai-site-editor');
          if (!isDashboardPage && !isAuthPage) {
            console.log("[useAuthSync] Redirecting from", path, "to dashboard");
            window.location.href = '/dashboard';
          }
        } catch (error) {
          console.error("[useAuthSync] Session creation error:", error);
          sessionCreated.current = false; // Allow retry on error
        }
      };
      
      // Wait for state to update before redirecting
      setTimeout(createSession, 0);
    }
  }, [currentUser]);

  return { session, status, currentUser };
}
