/**
 * Storage format of asset handover / return acts — parsing and backfill.
 *
 * Kept dependency-free on purpose: this module is imported both by the client
 * renderer (`assetFormDocument.ts`) and by the Convex migration that upgrades
 * historical documents, so it must not pull in date-fns / pdfmake.
 *
 * Storage generations:
 *  1. `__MF__{json}` / `__RF__{json}` — current format. `dateTs` is canonical;
 *     the client formats it in the active language.
 *  2. English markdown (`# Asset Movement Form`, `**Handed To:** …`) — legacy.
 *  3. Anything else — a generic document, not an act.
 */

export const MOVEMENT_PREFIX = '__MF__';
export const RETURN_PREFIX = '__RF__';

export type AssetActType = 'movement' | 'return';

export interface ParsedAssetForm {
  type: AssetActType;
  data: Record<string, string>;
}

/**
 * Pull the value of a `**Label:**` field out of a legacy markdown form. The
 * legacy body is a single flattened line, so a value runs until the next
 * structural token: another bold field (`**`), a heading (`##`), a rule
 * (`---`), or a bullet separator (` - `). Returns '' when the field is absent.
 */
export function extractLegacyField(md: string, label: string): string {
  const m = md.match(new RegExp('\\*\\*\\s*' + label + '\\s*:\\*\\*\\s*(.+)'));
  if (!m || !m[1]) return '';
  return (m[1].split(/\s+(?:\*\*|#{1,3}\s|-{2,}|-\s)/)[0] ?? '').trim();
}

/**
 * Parse stored act content into a locale-agnostic shape. Returns `null` for
 * generic documents (and for corrupt JSON), so callers fall back to raw content.
 */
export function parseAssetFormContent(content: string): ParsedAssetForm | null {
  if (content.startsWith(MOVEMENT_PREFIX) || content.startsWith(RETURN_PREFIX)) {
    const type: AssetActType = content.startsWith(MOVEMENT_PREFIX) ? 'movement' : 'return';
    try {
      const parsed: unknown = JSON.parse(content.slice(MOVEMENT_PREFIX.length));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      return { type, data: parsed as Record<string, string> };
    } catch {
      return null;
    }
  }

  // ── Legacy markdown forms ──
  // Only treat content as an act when it carries the tell-tale field markers,
  // so unrelated documents pass through untouched.
  const isReturnForm = /Return Form/i.test(content) || /\*\*\s*Returned By\s*:\*\*/i.test(content);
  const isMovementForm =
    /Movement Form/i.test(content) || /\*\*\s*Handed To\s*:\*\*/i.test(content);
  if (!isReturnForm && !isMovementForm) return null;

  const assetName = extractLegacyField(content, 'Asset');
  if (isReturnForm) {
    return {
      type: 'return',
      data: {
        assetName,
        // Legacy return acts name the employee in "Returned By" and the admin in
        // "Received By"; the renderer handles both layouts.
        returnerName: extractLegacyField(content, 'Returned By'),
        assignerName: extractLegacyField(content, 'Received By'),
        condition: extractLegacyField(content, 'Condition'),
        date: extractLegacyField(content, 'Date of Return') || extractLegacyField(content, 'Date'),
      },
    };
  }
  return {
    type: 'movement',
    data: {
      assetName,
      assigneeName: extractLegacyField(content, 'Handed To'),
      assignerName: extractLegacyField(content, 'Handed By'),
      date: extractLegacyField(content, 'Date of Transfer') || extractLegacyField(content, 'Date'),
    },
  };
}

/** Live records used to fill the gaps of a historical act. */
export interface AssetActBackfillContext {
  /** Creation timestamp of the signature document — last-resort act date. */
  createdAt: number;
  asset?: {
    serialNumber?: string;
    assetTag?: string;
    category?: string;
    brand?: string;
    model?: string;
    location?: string;
    condition?: string;
  } | null;
  assignee?: { email?: string; position?: string } | null;
  assigner?: { position?: string } | null;
}

/** `true` when the value carries no information worth keeping. */
function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

/**
 * Resolve a timestamp for an act that predates `dateTs`.
 *
 * Historical acts stored the date as pre-formatted English text
 * ("August 1, 2026"), which is why such documents printed an English date in
 * every language. `Date.parse` recovers the instant; otherwise we fall back to
 * the document's creation time.
 */
function resolveDateTs(data: Record<string, unknown>, createdAt: number): number {
  const existing = Number(data.dateTs);
  if (Number.isFinite(existing) && existing > 0) return existing;
  if (typeof data.date === 'string' && data.date.trim()) {
    const parsed = Date.parse(data.date);
    if (Number.isFinite(parsed)) return parsed;
  }
  return createdAt;
}

/**
 * Upgrade a historical act to the current storage format:
 *  - converts legacy markdown to `__MF__`/`__RF__` JSON,
 *  - adds the canonical `dateTs` so the date renders in the reader's language,
 *  - fills asset/party details that were not captured at creation time.
 *
 * Only missing values are written, so the migration is idempotent. Returns the
 * new content string, or `null` when nothing needed changing (or the document
 * is not an act).
 */
export function backfillAssetActContent(
  content: string,
  ctx: AssetActBackfillContext,
): string | null {
  const parsed = parseAssetFormContent(content);
  if (!parsed) return null;

  const isJson = content.startsWith(MOVEMENT_PREFIX) || content.startsWith(RETURN_PREFIX);
  const data: Record<string, unknown> = { ...parsed.data };
  let changed = !isJson; // a legacy act is always rewritten as JSON

  const setIfBlank = (key: string, value: unknown) => {
    if (!isBlank(data[key]) || isBlank(value)) return;
    data[key] = value;
    changed = true;
  };

  const dateTs = resolveDateTs(data, ctx.createdAt);
  if (Number(data.dateTs) !== dateTs) {
    data.dateTs = dateTs;
    changed = true;
  }

  data._type = parsed.type;

  setIfBlank('assetSerial', ctx.asset?.serialNumber);
  setIfBlank('assetTag', ctx.asset?.assetTag);
  setIfBlank('category', ctx.asset?.category);
  setIfBlank('brand', ctx.asset?.brand);
  setIfBlank('model', ctx.asset?.model);
  setIfBlank('location', ctx.asset?.location);
  // Movement acts record the condition at handover; return acts already store
  // the condition on return, which must not be overwritten.
  if (parsed.type === 'movement') setIfBlank('condition', ctx.asset?.condition);
  setIfBlank('assigneeEmail', ctx.assignee?.email);
  setIfBlank('assigneePosition', ctx.assignee?.position);
  setIfBlank('assignerPosition', ctx.assigner?.position);

  if (!changed) return null;
  const prefix = parsed.type === 'return' ? RETURN_PREFIX : MOVEMENT_PREFIX;
  return `${prefix}${JSON.stringify(data)}`;
}
