"use client";

import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";

export function OAuthSyncLoader() {
  const { status } = useSession();

  // Only show loader when OAuth session is being synced
  if (status !== "authenticated") {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--background)]">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
        <div className="text-center">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-1">
            Signing you in...
          </h3>
          <p className="text-sm text-[var(--text-muted)]">
            Setting up your session
          </p>
        </div>
      </div>
    </div>
  );
}
