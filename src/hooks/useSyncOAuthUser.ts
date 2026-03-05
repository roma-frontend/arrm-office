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
      console.log("[useSyncOAuthUser] Status:", status, "IsAuthenticated:", isAuthenticated, "Syncing:", syncingRef.current);
      
      // Already syncing or already authenticated — skip
      if (syncingRef.current || isAuthenticated) {
        console.log("[useSyncOAuthUser] ⏭️  Skipping (syncing=" + syncingRef.current + " or authenticated=" + isAuthenticated + ")");
        return;
      }
      
      // Only run when Google OAuth session is ready
      if (status !== "authenticated" || !session?.user?.email) {
        console.log("[useSyncOAuthUser] ⏳ Waiting for auth (status=" + status + ", email=" + session?.user?.email + ")");
        return;
      }

      console.log("[useSyncOAuthUser] 🔄 Starting OAuth user sync...");
      console.log("[useSyncOAuthUser]   Session user:", {
        email: session.user.email,
        name: session.user.name,
        image: session.user.image,
      });

      syncingRef.current = true;
      try {
        // 1. Ensure user exists in Convex (create or update)
        console.log("[useSyncOAuthUser] 📝 Calling createOAuthUser mutation...");
        // Ensure name ALWAYS has a value
        const finalName = session.user.name?.trim() || session.user.email.split("@")[0] || 'User';
        await createOAuthUser({
          email: session.user.email,
          name: finalName,
          avatarUrl: session.user.image ?? undefined,
        });
        console.log("[useSyncOAuthUser] ✅ User synced to Convex with name:", finalName);

        // 2. Create JWT session via our API endpoint
        console.log("[useSyncOAuthUser] 📡 Calling /api/auth/oauth-session...");
        const res = await fetch("/api/auth/oauth-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: session.user.email,
            name: finalName,
            avatarUrl: session.user.image ?? undefined,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          console.log("[useSyncOAuthUser] ✅ OAuth session created:", {
            userId: data.session?.userId,
            name: data.session?.name,
            email: data.session?.email,
            role: data.session?.role,
          });
          
          if (data.session) {
            // 3. Save to auth store — no reload needed!
            console.log("[useSyncOAuthUser] 💾 Logging into Zustand store...");
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
            console.log("[useSyncOAuthUser] ✅ User logged into Zustand:", {
              name: data.session.name,
              email: data.session.email,
              role: data.session.role,
            });
            
            // 4. Navigate to dashboard — use window.location to avoid SSL issues on localhost
            console.log("[useSyncOAuthUser] 🎯 Redirecting to /dashboard");
            window.location.href = "/dashboard";
            return;
          }
        }

        // Fallback if API failed
        console.error("[useSyncOAuthUser] ❌ OAuth session API failed:", res.status, await res.text());
        window.location.href = "/dashboard";
      } catch (error) {
        console.error("[useSyncOAuthUser] ❌ Error syncing OAuth user:", error);
        syncingRef.current = false;
      }
    };

    syncUser();
  }, [status, session, isAuthenticated, login, router, createOAuthUser]);

  return { session, status };
}
