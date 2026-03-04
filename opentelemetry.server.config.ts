import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";

/**
 * Initialize OpenTelemetry for Node.js
 * Exports traces to OTLP collector (e.g., Jaeger, Datadog, New Relic)
 */
export function initOpenTelemetryServer() {
  // Only initialize if not already running
  if (process.env._OPENTELEMETRY_INITIALIZED === "true") {
    return;
  }

  const otlpExporter = new OTLPTraceExporter({
    // Configure OTLP endpoint
    // Default: http://localhost:4318/v1/traces
    // For production, set via environment variable OTEL_EXPORTER_OTLP_ENDPOINT
    url:
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318/v1/traces",
    headers: process.env.OTEL_EXPORTER_OTLP_HEADERS
      ? JSON.parse(process.env.OTEL_EXPORTER_OTLP_HEADERS)
      : {},
  });

  const sdk = new NodeSDK({
    traceExporter: otlpExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": {
          enabled: false, // Disable fs tracing to reduce noise
        },
      }),
    ],
  });

  sdk.start();
  console.log("OpenTelemetry initialized for Node.js");

  // Handle graceful shutdown
  process.on("SIGTERM", () => {
    sdk
      .shutdown()
      .then(() => console.log("OpenTelemetry shut down gracefully"))
      .catch((err) => console.log("Error shutting down OpenTelemetry:", err))
      .finally(() => process.exit(0));
  });

  return sdk;
}
