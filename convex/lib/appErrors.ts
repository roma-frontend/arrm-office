import { ConvexError } from 'convex/values';

/**
 * Structured application errors.
 *
 * Plain `throw new Error(...)` messages are redacted by Convex before they
 * reach the client — production users just see "Server Error". A `ConvexError`
 * payload IS delivered intact, so the client can map a stable machine code to
 * a translated message (see `common.errors.codes.*` in the locale files and
 * `getAppErrorCode` / `appErrorToast` in src/lib/error-handler.ts).
 *
 * Keep this catalog to the codes the UI actually translates. Domain-specific
 * errors (KEY_RESULT_MISMATCH, DRIVER_ON_LEAVE, …) may keep their own code and
 * English message through the same payload shape — the client falls back to
 * that message when no translation exists.
 */
export const APP_ERROR_CODES = [
  'NOT_AUTHENTICATED',
  'FORBIDDEN',
  'NO_ORGANIZATION',
  'NOT_FOUND',
  'USER_NOT_FOUND',
  'ORG_NOT_FOUND',
  'ORG_FROZEN',
  'VALIDATION',
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

/** The payload shape every translatable error carries across the wire. */
export interface AppErrorPayload {
  code: AppErrorCode | (string & {});
  message: string;
}

/**
 * Throw a structured error the client can translate.
 *
 * The human-readable `message` stays in the payload (and in `error.message`,
 * JSON-stringified), so existing `rejects.toThrow('…')` assertions and the
 * message-fallback path in `getConvexErrorMessage` keep working.
 */
export function throwAppError(code: AppErrorCode, message: string): never {
  throw new ConvexError({ code, message } satisfies AppErrorPayload);
}

/** Narrow an unknown Convex error payload to a structured app error. */
export function isAppErrorPayload(data: unknown): data is AppErrorPayload {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof (data as { code?: unknown }).code === 'string' &&
    typeof (data as { message?: unknown }).message === 'string'
  );
}
