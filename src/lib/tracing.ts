import { trace, context as otelContext, SpanStatusCode } from '@opentelemetry/api';

/**
 * Tracing utility for API routes and server actions
 * Helps track performance and errors at different layers
 */

const tracer = trace.getTracer('strata-api');

/**
 * Wrap API route handlers with tracing
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic utility wrapper
export async function withTracing<T extends (...args: any[]) => Promise<any>>(
  spanName: string,
  fn: T,
  attributes?: Record<string, unknown>,
): Promise<ReturnType<T>> {
  return tracer.startActiveSpan(spanName, async (span) => {
    try {
      if (attributes) {
        Object.entries(attributes).forEach(([key, value]) => {
          span.setAttribute(key, String(value));
        });
      }

      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (error as Error).message,
      });
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Middleware for adding trace context to requests
 */
export async function tracingMiddleware(
  request: Request,
  handler: (req: Request) => Promise<Response>,
): Promise<Response> {
  const spanName = `${request.method} ${new URL(request.url).pathname}`;

  return tracer.startActiveSpan(spanName, async (span) => {
    try {
      span.setAttribute('http.method', request.method);
      span.setAttribute('http.url', request.url);
      span.setAttribute('http.target', new URL(request.url).pathname);

      const response = await handler(request);

      span.setAttribute('http.status_code', response.status);
      span.setStatus({ code: SpanStatusCode.OK });

      return response;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (error as Error).message,
      });
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Decorator for server actions
 */
export function withServerActionTracing(spanName: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic decorator pattern
  return function decorator<T extends (...args: any[]) => Promise<any>>(target: T): T {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed for variadic args
    return (async (...args: any[]) => {
      return withTracing(spanName, () => target(...args));
    }) as T;
  };
}

/**
 * Helper to add custom attributes to current span
 */
export function addSpanAttributes(attributes: Record<string, unknown>) {
  const span = trace.getActiveSpan();
  if (span) {
    Object.entries(attributes).forEach(([key, value]) => {
      span.setAttribute(key, String(value));
    });
  }
}
