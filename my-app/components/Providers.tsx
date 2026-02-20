"use client";

import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";
import { ConvexClientProvider } from "./providers/ConvexProvider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ConvexClientProvider>
        {children}
      </ConvexClientProvider>
    </SessionProvider>
  );
}