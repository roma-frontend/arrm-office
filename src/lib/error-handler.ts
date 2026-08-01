/**
 * Centralized Error Handling for Strata
 *
 * Provides standardized error types, handlers, and utilities
 * to replace ad-hoc error: any patterns across the codebase.
 */

// ── Error Types ─────────────────────────────────────────────────────────────

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    {
      code = 'APP_ERROR',
      statusCode = 500,
      details,
    }: {
      code?: string;
      statusCode?: number;
      details?: Record<string, unknown>;
    } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class UserError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, { code: 'USER_ERROR', statusCode: 400, details });
    this.name = 'UserError';
    Object.setPrototypeOf(this, UserError.prototype);
  }
}

export class AuthError extends AppError {
  constructor(message = 'Authentication required', details?: Record<string, unknown>) {
    super(message, { code: 'AUTH_ERROR', statusCode: 401, details });
    this.name = 'AuthError';
    Object.setPrototypeOf(this, AuthError.prototype);
  }
}

export class PermissionError extends AppError {
  constructor(message = 'Insufficient permissions', details?: Record<string, unknown>) {
    super(message, { code: 'PERMISSION_ERROR', statusCode: 403, details });
    this.name = 'PermissionError';
    Object.setPrototypeOf(this, PermissionError.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource', details?: Record<string, unknown>) {
    super(`${resource} not found`, { code: 'NOT_FOUND', statusCode: 404, details });
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class NetworkError extends AppError {
  constructor(message = 'Network error occurred', details?: Record<string, unknown>) {
    super(message, { code: 'NETWORK_ERROR', statusCode: 503, details });
    this.name = 'NetworkError';
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

export class ServerError extends AppError {
  constructor(message = 'Internal server error', details?: Record<string, unknown>) {
    super(message, { code: 'SERVER_ERROR', statusCode: 500, details });
    this.name = 'ServerError';
    Object.setPrototypeOf(this, ServerError.prototype);
  }
}

export class ValidationError extends UserError {
  public readonly fieldErrors: Record<string, string>;

  constructor(message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = 'ValidationError';
    Object.defineProperty(this, 'code', { value: 'VALIDATION_ERROR', enumerable: true });
    Object.setPrototypeOf(this, ValidationError.prototype);
    this.fieldErrors = fieldErrors;
  }
}

// ── Type Guards ─────────────────────────────────────────────────────────────

export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Safely extracts the `name` from any thrown value (works for DOMException,
 * Error subclasses, and plain objects). Returns '' when unavailable.
 */
export function getErrorName(error: unknown): string {
  return error && typeof error === 'object' && 'name' in error
    ? String((error as { name?: unknown }).name ?? '')
    : '';
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

export function isUserError(value: unknown): value is UserError {
  return value instanceof UserError;
}

export function isAuthError(value: unknown): value is AuthError {
  return value instanceof AuthError;
}

export function isNetworkError(value: unknown): value is NetworkError {
  return value instanceof NetworkError;
}

// ── Error Message Extraction ────────────────────────────────────────────────

/**
 * Extract a user-friendly error message from any error type.
 * Safe to use with unknown catch variables.
 * Handles Error subclasses, plain strings, DOMException-like objects, and more.
 */
export function getErrorMessage(error: unknown): string {
  if (isError(error)) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  // DOMException and other error-like objects carry a `message` property
  // without being instanceof Error in all environments.
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
  }
  return 'An unexpected error occurred';
}

/**
 * Extract error code from any error type.
 */
export function getErrorCode(error: unknown): string {
  if (isAppError(error)) {
    return error.code;
  }
  return 'UNKNOWN_ERROR';
}

/**
 * Extract HTTP status code from any error type.
 */
export function getErrorStatusCode(error: unknown): number | undefined {
  if (isAppError(error)) {
    return error.statusCode;
  }
  return undefined;
}

// ── Async Error Handler ─────────────────────────────────────────────────────

/**
 * Wrap an async function with standardized error handling.
 * Returns [data, error] tuple — no try/catch needed at call site.
 *
 * @example
 * const [data, error] = await safeAsync(fetchUsers());
 * if (error) { toast.error(getErrorMessage(error)); return; }
 */
export async function safeAsync<T>(promise: Promise<T>): Promise<[T | null, Error | null]> {
  try {
    const data = await promise;
    return [data, null];
  } catch (error) {
    return [null, error instanceof Error ? error : new Error(String(error))];
  }
}

// ── Convex Error Adapter ────────────────────────────────────────────────────

/**
 * Adapt Convex/server errors to AppError types.
 */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;

  const message = getErrorMessage(error);

  // Auth-related errors
  if (
    message.toLowerCase().includes('unauthorized') ||
    message.toLowerCase().includes('not logged in')
  ) {
    return new AuthError(message);
  }

  // Permission errors
  if (
    message.toLowerCase().includes('permission') ||
    message.toLowerCase().includes('not allowed')
  ) {
    return new PermissionError(message);
  }

  // Validation errors
  if (message.toLowerCase().includes('validation') || message.toLowerCase().includes('invalid')) {
    return new UserError(message);
  }

  // Network errors
  if (message.toLowerCase().includes('network') || message.toLowerCase().includes('fetch')) {
    return new NetworkError(message);
  }

  // Default to server error
  return new ServerError(message);
}
