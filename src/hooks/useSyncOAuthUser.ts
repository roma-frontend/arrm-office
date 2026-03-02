"use client";

import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";

export function useSyncOAuthUser() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const currentUser = useQuery(api.users.getCurrentUser);
  const createOAuthUser = useMutation(api.users.createOAuthUser);

  useEffect(() => {
    const syncUser = async () => {
      // If user is authenticated via NextAuth but not in Convex
      if (status === "authenticated" && session?.user && currentUser === null) {
        try {
          // Create/update user in Convex
          await createOAuthUser({
            email: session.user.email!,
            name: session.user.name || session.user.email!.split("@")[0],
            avatarUrl: session.user.image,
          });
          
          // Refresh to load new user
          window.location.reload();
        } catch (error) {
          console.error("Error syncing OAuth user:", error);
        }
      }
    };

    syncUser();
  }, [status, session, currentUser, createOAuthUser]);

  return { session, status, currentUser };
}
