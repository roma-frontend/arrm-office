"use client";

import { useAuthSync } from "@/hooks/useAuthSync";
import { ReactNode } from "react";

export function AuthSyncProvider({ children }: { children: ReactNode }) {
  useAuthSync();
  return <>{children}</>;
}
