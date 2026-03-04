/**
 * instrumentation.ts
 * 
 * This file is loaded by Next.js at startup for server-side instrumentation
 * Use it to initialize monitoring, tracing, and error handling
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Initialize OpenTelemetry on server
    const { initOpenTelemetryServer } = await import(
      "./opentelemetry.server.config"
    );
    initOpenTelemetryServer();

    // Initialize Sentry on server
    // const { initSentryServer } = await import("./sentry.server.config");
    // initSentryServer();

    console.log(
      "✅ Server instrumentation initialized (OpenTelemetry only - Sentry disabled)"
    );
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    // Edge runtime instrumentation
    console.log("✅ Edge runtime initialized");
  }
}
