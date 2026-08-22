'use client';

/**
 * Row and stats types for the audit page, derived from the Convex functions.
 *
 * Deriving beats declaring here: the server already returns the taxonomy, so a
 * hand-written interface would be a second source of truth that goes stale the
 * moment `listAuditTrail` gains a field.
 */

import type { FunctionReturnType } from 'convex/server';
import { api } from '@/convex/_generated/api';
import type { AuditCategory, AuditSeverity } from '@/lib/audit/actionMeta';

export type AuditRow = FunctionReturnType<typeof api.security.listAuditTrail>['page'][number];
export type AuditStats = FunctionReturnType<typeof api.security.getAuditTrailStats>;
export type AuditActor = NonNullable<AuditRow['actor']>;

/** The taxonomy fields, re-exported so components import one module. */
export type { AuditCategory, AuditSeverity };
