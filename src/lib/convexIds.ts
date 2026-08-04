/**
 * Route-parameter guards for Convex document ids.
 *
 * Dynamic segments like /tasks/[id] also catch literal paths (/tasks/new), and
 * handing such a word to a `v.id()` validator makes Convex throw an
 * ArgumentValidationError that surfaces as a runtime error overlay. These
 * helpers let a page skip the query and render "not found" instead.
 *
 * This is a shape check, not authorization: the server still validates the id
 * and the caller's access to the document.
 */

/** Convex ids are base32-ish strings; route words like "new" never match. */
const CONVEX_ID_PATTERN = /^[a-z0-9_-]{16,64}$/i;

export function isConvexId(value: unknown): value is string {
  return typeof value === 'string' && CONVEX_ID_PATTERN.test(value);
}

/**
 * Narrows a `useParams()` value (string | string[] | undefined) to a usable id,
 * or null when the segment cannot be one.
 */
export function convexIdFromParam<T extends string>(value: unknown): T | null {
  const raw: unknown = Array.isArray(value) ? (value as unknown[])[0] : value;
  return isConvexId(raw) ? (raw as T) : null;
}
