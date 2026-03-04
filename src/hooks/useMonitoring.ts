import { useEffect, useRef } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Hook for tracking component lifecycle in development
 * Useful for performance monitoring and debugging
 */
export function useComponentTracing(componentName: string) {
  const renderCountRef = useRef(0);

  useEffect(() => {
    renderCountRef.current++;

    if (process.env.NODE_ENV === "development") {
      console.log(`[${componentName}] Rendered (count: ${renderCountRef.current})`);
    }

    // Report to Sentry in production for critical components
    if (
      process.env.NODE_ENV === "production" &&
      renderCountRef.current > 10
    ) {
      Sentry.captureMessage(
        `Component [${componentName}] rendered ${renderCountRef.current} times`,
        "warning"
      );
    }

    return () => {
      // Cleanup
    };
  }, [componentName]);

  return {
    renderCount: renderCountRef.current,
  };
}

/**
 * Hook for tracking async operations (API calls, data fetching)
 */
export function useAsyncTracing(operationName: string) {
  return async function tracedFetch<T>(
    fn: () => Promise<T>
  ): Promise<T> {
    const startTime = performance.now();

    try {
      const result = await fn();
      const duration = performance.now() - startTime;

      if (process.env.NODE_ENV === "development") {
        console.log(
          `[${operationName}] Completed in ${duration.toFixed(2)}ms`
        );
      }

      // Report slow operations
      if (duration > 3000) {
        Sentry.captureMessage(
          `Slow operation: [${operationName}] took ${duration.toFixed(2)}ms`,
          "warning"
        );
      }

      return result;
    } catch (error) {
      Sentry.captureException(error, {
        contexts: {
          operation: {
            name: operationName,
            type: "async_operation",
          },
        },
      });
      throw error;
    }
  };
}

/**
 * Hook for tracking form submissions
 */
export function useFormTracing(formName: string) {
  const handleSubmit = async (
    onSubmit: (data: any) => Promise<void>
  ) => {
    return async (data: any) => {
      const startTime = performance.now();

      try {
        Sentry.captureMessage(
          `Form submitted: ${formName}`,
          "info"
        );

        await onSubmit(data);

        const duration = performance.now() - startTime;
        Sentry.captureMessage(
          `Form processed successfully: ${formName} (${duration.toFixed(2)}ms)`,
          "info"
        );
      } catch (error) {
        Sentry.captureException(error, {
          contexts: {
            form: {
              name: formName,
              fields: Object.keys(data),
            },
          },
        });
        throw error;
      }
    };
  };

  return { handleSubmit };
}

/**
 * Hook for tracking user navigation
 */
export function useNavigationTracing() {
  useEffect(() => {
    const handleNavigation = (event: any) => {
      const pathName = event.destination?.pathname || "unknown";
      Sentry.captureMessage(
        `Navigation: ${pathName}`,
        "info"
      );
    };

    // Next.js router events
    if (typeof window !== "undefined") {
      const handleRouteChange = (url: string) => {
        Sentry.captureMessage(
          `Page load: ${url}`,
          "info"
        );
      };

      // Listen to route changes
      window.addEventListener("popstate", handleNavigation);
    }

    return () => {
      window?.removeEventListener("popstate", handleNavigation);
    };
  }, []);
}

/**
 * HOC for wrapping async operations with error boundary
 */
export function withErrorTracking<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  operationName: string
): T {
  return (async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      Sentry.captureException(error, {
        contexts: {
          operation: {
            name: operationName,
            args: args.length,
          },
        },
      });
      throw error;
    }
  }) as T;
}
