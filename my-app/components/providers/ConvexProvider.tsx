"use client";

import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { useSession } from "next-auth/react";
import { ReactNode, useCallback, useMemo } from "react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

function useAuthFromNextAuth() {
  const { data: session, status } = useSession();

  const fetchAccessToken = useCallback(
  async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
    if (status !== "authenticated") {
      console.log("Not authenticated, status:", status);
      return null;
    }
    const res = await fetch("/api/auth/convex-token");
    const { token } = await res.json();
    console.log("Fetched convex token:", token ? "got token" : "null");
    return token as string | null;
  },
  [status]
);

  return useMemo(
    () => ({
      isLoading: status === "loading",
      isAuthenticated: status === "authenticated",
      fetchAccessToken,
    }),
    [status, fetchAccessToken]
  );
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithAuth client={convex} useAuth={useAuthFromNextAuth}>
      {children}
    </ConvexProviderWithAuth>
  );
}