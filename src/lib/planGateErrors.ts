/**
 * Plan-gate error parsing.
 *
 * The entitlements engine (convex/lib/entitlements.ts) rejects mutations with
 * stable, human-readable messages. Convex serializes errors across the wire as
 * plain `Error` objects, so custom properties are lost — the client side can
 * only rely on the message text. These parsers turn those messages back into
 * structured info for the global Upgrade modal.
 *
 * Keep the regexes in sync with the exact strings thrown by
 * `assertModuleAccess` / `assertQuota`.
 */

export interface PlanGateInfo {
  kind: 'module' | 'quota';
  /** Billing-module key when the error names one (module-access errors). */
  moduleKey?: string;
  /** The plan the caller is on, e.g. "Pro". */
  planName: string;
  /** The usage key that hit its limit (quota errors), e.g. "documents". */
  usageKey?: string;
  /** The numeric limit from the plan (quota errors). */
  limit?: number;
}

const MODULE_GATE_RE = /Module "([^"]+)" is not included in your (.+?) plan\./;
const QUOTA_GATE_RE = /Quota exceeded: (\w+) limit is (\d+) on the (.+?) plan\./;

/** Parse a server error into upgrade-modal info, or null when it's not a plan gate. */
export function parsePlanGateError(err: unknown): PlanGateInfo | null {
  const message = err instanceof Error ? err.message : String(err ?? '');
  const moduleMatch = MODULE_GATE_RE.exec(message);
  if (moduleMatch) {
    return { kind: 'module', moduleKey: moduleMatch[1], planName: moduleMatch[2] ?? '' };
  }
  const quotaMatch = QUOTA_GATE_RE.exec(message);
  if (quotaMatch) {
    return {
      kind: 'quota',
      usageKey: quotaMatch[1],
      limit: Number(quotaMatch[2] ?? 0),
      planName: quotaMatch[3] ?? '',
    };
  }
  return null;
}

export function isPlanGateError(err: unknown): boolean {
  return parsePlanGateError(err) !== null;
}
