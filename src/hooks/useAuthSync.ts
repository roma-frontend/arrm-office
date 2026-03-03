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
  const [userEmail, setUserEmail] = useState<string | null>(null);
  
  // Get current user by email
  const currentUser = useQuery(
    api.users.getCurrentUser,
    userEmail ? { email: userEmail } : "skip"
  );

  useEffect(() => {
    const syncAuth = async () => {
      console.log("[useAuthSync] Status:", status, "Session:", session?.user?.email);
      
      if (status === "loading") {
        console.log("[useAuthSync] Still loading...");
        return;
      }

      // If logged out via NextAuth, logout from useAuthStore
      // BUT: Only logout if user is not authenticated via email/password (useAuthStore)
      if (status === "unauthenticated" && isAuthenticated) {
        console.log("[useAuthSync] NextAuth unauthenticated but useAuthStore is authenticated - keeping logged in");
        console.log("[useAuthSync] isAuthenticated:", isAuthenticated);
        return;
      }
      
      if (status === "unauthenticated" && !isAuthenticated) {
        console.log("[useAuthSync] Unauthenticated - logging out");
        console.log("[useAuthSync] Calling logout and redirecting...");
        logout();
        setUserEmail(null);
        // NOTE: This might cause redirect
        return;
      }

      // If authenticated via NextAuth
      if (status === "authenticated" && session?.user) {
        console.log("[useAuthSync] Authenticated! User:", session.user.email);
        console.log("[useAuthSync] Session user data:", {
          name: session.user.name,
          email: session.user.email,
          image: session.user.image,
        });
        
        try {
          // Create/update user in Convex
          console.log("[useAuthSync] Creating/updating user in Convex...");
          const userData = {
            email: session.user.email!,
            name: session.user.name || session.user.email!.split("@")[0],
            avatarUrl: session.user.image || undefined,
          };
          console.log("[useAuthSync] Sending to Convex:", userData);
          
          const result = await createOAuthUser(userData);

          console.log("[useAuthSync] User created/updated in Convex, result:", result);

          // Enable fetching the current user by email
          setUserEmail(session.user.email!);
          console.log("[useAuthSync] ✅ Now fetching current user from Convex with email:", session.user.email);
        } catch (error) {
          console.error("[useAuthSync] ❌ Error syncing OAuth user:", error);
        }
      }
    };

    syncAuth();
  }, [status, session, createOAuthUser, logout]);

  // Separate effect to handle user data once it's loaded
  useEffect(() => {
    console.log("[useAuthSync] Effect triggered - currentUser:", currentUser, "session:", session?.user?.email);
    
    if (!currentUser || !session?.user) {
      console.log("[useAuthSync] Waiting for currentUser or session...");
      return;
    }

    console.log("[useAuthSync] ✅ Current user from Convex:", currentUser);
    console.log("[useAuthSync] Syncing to useAuthStore...");
    
    // Sync to useAuthStore
    login({
      id: currentUser._id,
      name: currentUser.name,
      email: currentUser.email,
      role: currentUser.role,
      avatar: currentUser.avatarUrl,
      department: currentUser.department,
      position: currentUser.position,
      employeeType: currentUser.employeeType,
      organizationId: currentUser.organizationId,
    });
    
    console.log("[useAuthSync] ✅ User logged into useAuthStore with name:", currentUser.name);
    
    // Create server-side session cookie for dashboard auth (only once)
    if (!sessionCreated.current && !isAuthenticated) {
      sessionCreated.current = true;
      
      const createSession = async () => {
        try {
          const response = await fetch('/api/auth/create-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: currentUser._id,
              name: currentUser.name,
              email: currentUser.email,
              role: currentUser.role,
              department: currentUser.department,
              position: currentUser.position,
              employeeType: currentUser.employeeType,
              avatar: currentUser.avatarUrl,
            }),
          });
          
          if (response.ok) {
            console.log("[useAuthSync] ✅ Server session created!");
            // Wait a moment to ensure everything is synced
            await new Promise(resolve => setTimeout(resolve, 500));
            // Redirect to dashboard only if not already there
            if (window.location.pathname !== '/dashboard') {
              window.location.href = '/dashboard';
            }
          }
        } catch (error) {
          console.error("[useAuthSync] Failed to create server session:", error);
          sessionCreated.current = false; // Allow retry on error
        }
      };
      
      createSession();
    }
  }, [currentUser, session, login, isAuthenticated]);

  return { session, status, currentUser };
}
