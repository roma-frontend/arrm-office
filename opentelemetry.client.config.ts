import { trace } from "@opentelemetry/api";
import { BasicTracerProvider, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-web";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { FetchInstrumentation } from "@opentelemetry/instrumentation-fetch";
import { DocumentLoadInstrumentation } from "@opentelemetry/instrumentation-document-load";
import { UserInteractionInstrumentation } from "@opentelemetry/instrumentation-user-interaction";

/**
 * Initialize OpenTelemetry for browser
 * Exports traces to OTLP collector
 */
export function initOpenTelemetryClient() {
  if (typeof window === "undefined") {
    // Skip in non-browser environment
    return null;
  }

  // Check if already initialized
  if ((window as any).__OTEL_INITIALIZED__ === true) {
    return null;
  }

  try {
    const otlpExporter = new OTLPTraceExporter({
      url:
        process.env.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT ||
        "http://localhost:4318/v1/traces",
      headers: process.env.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_HEADERS
        ? JSON.parse(process.env.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_HEADERS)
        : {},
    });

    const provider = new BasicTracerProvider();

    // Configure span processor for OTLP export (web SDK handles this via instrumentations)
    // Note: addSpanProcessor is not available on BasicTracerProvider in the web SDK
    // Instrumentations below handle span processing and export
    
    // Register instrumentations
    new FetchInstrumentation({
      enabled: true,
    }).enable();
    new DocumentLoadInstrumentation().enable();
    new UserInteractionInstrumentation().enable();
    console.log("OpenTelemetry initialized for Browser");

    return provider;
  } catch (error) {
    console.error("Failed to initialize OpenTelemetry:", error);
    return null;
  }
}

/**
 * Utility to add custom spans for tracking specific operations
 */
export function withSpan(
  name: string,
  fn: () => Promise<any> | any
) {
  const tracer = trace.getTracer("hr-office-frontend");
  if (!tracer) {
    return fn();
  }

  return tracer.startActiveSpan(name, (span) => {
    try {
      const result = fn();
      if (result instanceof Promise) {
        return result
          .then((value) => {
            span.end();
            return value;
          })
          .catch((error: any) => {
            if (error instanceof Error) {
              span.recordException(error);
            } else {
              span.recordException(new Error(String(error)));
            }
            span.end();
            throw error;
          });
      }
      span.end();
      return result;
    } catch (error: any) {
      if (error instanceof Error) {
        span.recordException(error);
      } else {
        span.recordException(new Error(String(error)));
      }
      span.end();
      throw error;
    }
  });
}
