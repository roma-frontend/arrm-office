"use client";

import { useEffect } from "react";
import { initSentryClient } from "../../../sentry.client.config";

/**
 * Monitoring Provider Component
 * Initializes Sentry and OpenTelemetry on the client side
 * Uses requestIdleCallback to defer non-critical monitoring initialization
 */
export function MonitoringProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Initialize Sentry immediately but in background thread
    // Don't wait for idle - just ensure it doesn't block rendering
    try {
      initSentryClient();
    } catch (error) {
      console.error('Failed to initialize Sentry:', error);
    }

    // Initialize OpenTelemetry client-side with deferred timing
    if (process.env.NEXT_PUBLIC_ENABLE_OTEL === "true") {
      if ('requestIdleCallback' in window) {
        requestIdleCallback(
          () => {
            import("../../../opentelemetry.client.config").then(({ initOpenTelemetryClient }) => {
              try {
                initOpenTelemetryClient();
                console.log("✅ OpenTelemetry initialized in browser");
              } catch (error) {
                console.error("Failed to initialize OpenTelemetry:", error);
              }
            });
          },
          { timeout: 5000 }
        );
      } else {
        setTimeout(() => {
          import("../../../opentelemetry.client.config").then(({ initOpenTelemetryClient }) => {
            try {
              initOpenTelemetryClient();
              console.log("✅ OpenTelemetry initialized in browser");
            } catch (error) {
              console.error("Failed to initialize OpenTelemetry:", error);
            }
          });
        }, 2000);
      }
    }
  }, []);

  return <>{children}</>;
}
