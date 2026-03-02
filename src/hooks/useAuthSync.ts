"use client";

import { useSession } from "next-auth/react";
import { useEffect, useRef } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export function useAuthSync() {
  const { data: session, status } = useSession();
  const { login, logout, isAuthenticated } = useAuthStore();
  const createOAuthUser = useMutation(api.users.createOAuthUser);
  const sessionCreated = useRef(false);
  
  // Get user by email instead of using getCurrentUser
  const currentUser = useQuery(
    api.users.getUserByEmail,
    session?.user?.email ? { email: session.user.email } : "skip"
  );

  useEffect(() => {
    const syncAuth = async () => {
      console.log("[useAuthSync] Status:", status, "Session:", session?.user?.email);
      
      if (status === "loading") {
        console.log("[useAuthSync] Still loading...");
        return;
      }

      // If logged out via NextAuth, logout from useAuthStore
      if (status === "unauthenticated") {
        console.log("[useAuthSync] Unauthenticated - logging out");
        logout();
        return;
      }

      // If authenticated via NextAuth
      if (status === "authenticated" && session?.user) {
        console.log("[useAuthSync] Authenticated! User:", session.user.email);
        
        try {
          // Create/update user in Convex
          console.log("[useAuthSync] Creating/updating user in Convex...");
          await createOAuthUser({
            email: session.user.email!,
            name: session.user.name || session.user.email!.split("@")[0],
            avatarUrl: session.user.image || undefined,
          });

          console.log("[useAuthSync] User created/updated in Convex");

          // Wait a bit for Convex to update
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Get the current user from Convex
          console.log("[useAuthSync] Current user from Convex:", currentUser);
          
          if (currentUser) {
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
            
            console.log("[useAuthSync] ✅ User logged into useAuthStore!");
            
            // Create server-side session cookie for dashboard auth
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
                // Redirect to dashboard
                window.location.href = '/dashboard';
              }
            } catch (error) {
              console.error("[useAuthSync] Failed to create server session:", error);
            }
          } else {
            console.log("[useAuthSync] ⚠️ No current user found in Convex");
          }
        } catch (error) {
          console.error("[useAuthSync] ❌ Error syncing OAuth user:", error);
        }
      }
    };

    syncAuth();
  }, [status, session, currentUser, login, logout, createOAuthUser]);

  return { session, status, currentUser };
}
