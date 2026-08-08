/**
 * Localizable system messages in chat.
 *
 * A system message used to be rendered into text on the server, in the language
 * of whoever happened to trigger it — and since `users.language` is usually
 * unset, that meant English for everybody. A group chat has members who do not
 * share a language, so there is no single correct language to bake in: the
 * ticket reporter, the assignee and the support agent can all want a different
 * one.
 *
 * So the server stores a token — a translation key plus its parameters — and
 * every reader's client renders it in their own language. Content that is not a
 * token is shown as-is, which keeps messages written before this change (and any
 * genuinely free-form system text) readable.
 */

/** Marks a message body as a translation token rather than prose. */
const TOKEN_PREFIX = 'i18n::';

export interface SystemMessageToken {
  key: string;
  params: Record<string, string>;
}

/**
 * Build the stored body of a localizable system message.
 *
 * @param key    Translation key, resolvable by the client's i18n instance.
 * @param params Interpolation values. Values are the caller's own data (ticket
 *               numbers, names) and are carried verbatim.
 */
export function encodeSystemMessage(key: string, params: Record<string, string> = {}): string {
  return `${TOKEN_PREFIX}${JSON.stringify({ key, params })}`;
}

/**
 * Read a stored system message body.
 *
 * @returns The token, or `null` when the body is plain text and should be
 *          displayed unchanged.
 */
export function decodeSystemMessage(content: string): SystemMessageToken | null {
  if (!content.startsWith(TOKEN_PREFIX)) return null;

  try {
    const parsed: unknown = JSON.parse(content.slice(TOKEN_PREFIX.length));
    if (!parsed || typeof parsed !== 'object') return null;

    const { key, params } = parsed as { key?: unknown; params?: unknown };
    if (typeof key !== 'string' || key.length === 0) return null;

    const safeParams: Record<string, string> = {};
    if (params && typeof params === 'object') {
      for (const [name, value] of Object.entries(params as Record<string, unknown>)) {
        if (typeof value === 'string') safeParams[name] = value;
        else if (typeof value === 'number' || typeof value === 'boolean') {
          safeParams[name] = String(value);
        }
      }
    }
    return { key, params: safeParams };
  } catch {
    // A body that merely looks like a token stays prose rather than disappearing.
    return null;
  }
}
