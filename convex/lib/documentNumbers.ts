/**
 * Registration numbers for issued documents, e.g. `HR-2026-014`.
 *
 * A dedicated counter row (rather than counting existing documents) keeps the
 * sequence gap-free and race-free: the counter is patched inside the same
 * mutation that hands the number out, so two documents created concurrently
 * cannot receive the same one.
 *
 * The series is a parameter, not a constant: personnel documents are numbered
 * `HR`, orders `ORD`, agreements `NDA`, and each series counts independently per
 * organization and calendar year.
 */
import type { MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';

/** Series used when a blueprint or caller does not specify one. */
export const DEFAULT_DOCUMENT_SERIES = 'HR';

/** Series codes are printed on legal documents — keep them short and boring. */
const SERIES_PATTERN = /^[A-Z][A-Z0-9]{0,7}$/;

/**
 * Normalise a caller-supplied series code.
 *
 * Anything unusable falls back to the default rather than throwing: a bad code
 * on a blueprint must not be able to block issuing a document.
 */
export function normalizeSeries(series?: string | null): string {
  const candidate = (series ?? '').trim().toUpperCase();
  return SERIES_PATTERN.test(candidate) ? candidate : DEFAULT_DOCUMENT_SERIES;
}

/** Allocate the next number in `series` for the organization's current year. */
export async function allocateDocumentNumber(
  ctx: MutationCtx,
  organizationId: Id<'organizations'>,
  series: string = DEFAULT_DOCUMENT_SERIES,
): Promise<string> {
  const code = normalizeSeries(series);
  const year = new Date().getFullYear();

  const existing = await ctx.db
    .query('documentNumberCounters')
    .withIndex('by_org_year_series', (q) =>
      q.eq('organizationId', organizationId).eq('year', year).eq('series', code),
    )
    .first();

  const next = (existing?.lastNumber ?? 0) + 1;
  if (existing) {
    await ctx.db.patch(existing._id, { lastNumber: next, updatedAt: Date.now() });
  } else {
    await ctx.db.insert('documentNumberCounters', {
      organizationId,
      year,
      series: code,
      lastNumber: next,
      updatedAt: Date.now(),
    });
  }

  return `${code}-${year}-${String(next).padStart(3, '0')}`;
}
