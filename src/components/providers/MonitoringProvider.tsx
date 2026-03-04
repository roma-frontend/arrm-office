"use client";

import { useEffect } from "react";
import { initSentryClient } from "../../../sentry.client.config";

/**
 * Monitoring Provider Component
 * Initializes Sentry and OpenTelemetry on the client side
 */
export function MonitoringProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Initialize Sentry client-side
    initSentryClient();

    // Initialize OpenTelemetry client-side
    if (process.env.NEXT_PUBLIC_ENABLE_OTEL === "true") {
      import("../../../opentelemetry.client.config").then(({ initOpenTelemetryClient }) => {
        try {
          initOpenTelemetryClient();
          console.log("✅ OpenTelemetry initialized in browser");
        } catch (error) {
          console.error("Failed to initialize OpenTelemetry:", error);
        }
      });
    }
  }, []);

  return <>{children}</>;
}
