"use client";

import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export function useAuthSync() {
  const { data: session, status } = useSession();
  const { login, logout } = useAuthStore();
  const createOAuthUser = useMutation(api.users.createOAuthUser);
  const currentUser = useQuery(api.users.getCurrentUser);

  useEffect(() => {
    const syncAuth = async () => {
      if (status === "loading") return;

      // If logged out via NextAuth, logout from useAuthStore
      if (status === "unauthenticated") {
        logout();
        return;
      }

      // If authenticated via NextAuth
      if (status === "authenticated" && session?.user) {
        try {
          // Create/update user in Convex
          await createOAuthUser({
            email: session.user.email!,
            name: session.user.name || session.user.email!.split("@")[0],
            avatarUrl: session.user.image || undefined,
          });

          // Wait a bit for Convex to update
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Get the current user from Convex
          if (currentUser) {
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
          }
        } catch (error) {
          console.error("Error syncing OAuth user:", error);
        }
      }
    };

    syncAuth();
  }, [status, session, currentUser, login, logout, createOAuthUser]);

  return { session, status, currentUser };
}
