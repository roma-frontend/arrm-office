"use client";

import { useSession } from "next-auth/react";
import { useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";

export function useSyncOAuthUser() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { login, isAuthenticated } = useAuthStore();
  const createOAuthUser = useMutation(api.users.createOAuthUser);
  const syncingRef = useRef(false);

  useEffect(() => {
    const syncUser = async () => {
      // Already syncing or already authenticated — skip
      if (syncingRef.current || isAuthenticated) return;
      // Only run when Google OAuth session is ready
      if (status !== "authenticated" || !session?.user?.email) return;

      syncingRef.current = true;
      try {
        // 1. Ensure user exists in Convex (create or update)
        await createOAuthUser({
          email: session.user.email,
          name: session.user.name || session.user.email.split("@")[0],
          avatarUrl: session.user.image ?? undefined,
        });

        // 2. Create JWT session via our API endpoint
        const res = await fetch("/api/auth/oauth-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: session.user.email,
            name: session.user.name || session.user.email.split("@")[0],
            avatarUrl: session.user.image ?? undefined,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.session) {
            // 3. Save to auth store — no reload needed!
            login({
              id: data.session.userId,
              name: data.session.name,
              email: data.session.email,
              role: data.session.role,
              organizationId: data.session.organizationId,
              department: data.session.department,
              position: data.session.position,
              employeeType: data.session.employeeType,
              avatar: data.session.avatar,
            });
            // 4. Navigate to dashboard — use window.location to avoid SSL issues on localhost
            window.location.href = "/dashboard";
            return;
          }
        }

        // Fallback if API failed
        console.error("OAuth session API failed:", await res.text());
        window.location.href = "/dashboard";
      } catch (error) {
        console.error("Error syncing OAuth user:", error);
        syncingRef.current = false;
      }
    };

    syncUser();
  }, [status, session, isAuthenticated, login, router, createOAuthUser]);

  return { session, status };
}
