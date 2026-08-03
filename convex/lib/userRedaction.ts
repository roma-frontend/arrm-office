/**
 * User-doc redaction — the single source of truth for fields that must never
 * leave the server through a user-list / user-detail query (or a backup).
 *
 * `backups.ts` imports this list and appends `faceImageUrl` (the biometric
 * photo, which is kept on query results as an avatar fallback but must never
 * be written into a backup). Keep both in sync via the shared list.
 */
export const SENSITIVE_USER_FIELDS = [
  'passwordHash',
  'sessionToken',
  'sessionExpiry',
  'totpSecret',
  'backupCodes',
  'webauthnChallenge',
  'faceDescriptor',
  'resetPasswordToken',
  'resetPasswordExpiry',
  'loginFailedAttempts',
  'loginLockedUntil',
  'faceIdBlocked',
  'faceIdBlockedAt',
  'faceIdFailedAttempts',
  'faceIdLastAttempt',
] as const;

/**
 * Copy a user doc with every sensitive field deleted, so credentials, session
 * secrets, 2FA material and biometric data never reach the client or an
 * export. Safe display fields (name, email, role, avatarUrl, balances, …) are
 * kept.
 *
 * The returned value keeps the same static type as the input on purpose: the
 * redaction is a runtime guarantee (see `SENSITIVE_USER_FIELDS`), and this way
 * query return types stay stable for the many `as Doc<'users'>` casts across
 * the app. Do NOT read any of the `SENSITIVE_USER_FIELDS` off a redacted doc —
 * it will be `undefined`.
 */
export function redactUser<T extends { _id: string }>(user: T): T {
  const safe: Record<string, unknown> = { ...user };
  for (const field of SENSITIVE_USER_FIELDS) {
    delete safe[field];
  }
  return safe as T;
}
