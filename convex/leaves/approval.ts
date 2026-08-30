/**
 * Who decides a leave request.
 *
 * BEFORE
 *   Approval was a rank check: any `admin` or `supervisor` could approve any
 *   request anywhere in the organization, `supervisorId` appeared zero times in
 *   this folder, there was no self-approval guard at all, and the "new request"
 *   notification fanned out to every `admin` — so a supervisor who actually
 *   managed the requester was never told, while admins with no relationship to
 *   them were.
 *
 * NOW
 *   1. Nobody reviews their own request, and nobody reviews a request they filed
 *      on someone else's behalf (the rule `convex/expenses.ts` already applies to
 *      money: nobody signs off on what they claimed).
 *   2. The approver is the nearest manager in the requester's reporting line who
 *      holds `leave.approve`.
 *   3. A holder of `leave.approve.org` (HR / admin) may approve anyone in the
 *      organization — except the head, whose request follows the head policy.
 *   4. The head of the organization has no ancestor, so `organizations.headApproval`
 *      decides: `auto` (default) records it approved with an audit note,
 *      `delegate` routes it to a named person, `peer` lets another
 *      `leave.approve.org` holder decide.
 */

import type { QueryCtx, MutationCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import { getAncestorIds, isAncestorOf, getOrgHeadId } from '../lib/reportingLine';
import { hasCapability } from '../lib/capabilities';
import { SMALL_LIST_CAP } from '../lib/limits';

/** Audit/review note stamped on a head request that nobody above could approve. */
export const HEAD_AUTO_APPROVAL_NOTE =
  'Auto-approved: the head of the organization has no approver above them (organization policy: headApproval=auto).';

export type ApprovalReason =
  /** Routed to the nearest manager in the line who may approve. */
  | 'chain'
  /** The head's request, routed to `organizations.headApproverUserId`. */
  | 'delegate'
  /** The head's request, recorded as approved on the spot. */
  | 'head_auto'
  /** The head's request, open to any other org-wide approver. */
  | 'head_peer'
  /** Nobody in the line may approve — org-wide approvers pick it up. */
  | 'org_fallback';

export interface ApprovalRoute {
  /** Record the request as already approved instead of leaving it pending. */
  autoApprove: boolean;
  reason: ApprovalReason;
  /** Who is expected to decide, and therefore who gets notified. */
  notifyIds: Id<'users'>[];
}

/** Active holders of `leave.approve.org` in an organization (HR / admins).
 *  System accounts (the HR Assistant bot per org, plus any other email-isolated
 *  internal accounts) never appear in this list: they exist to act, never to
 *  be acted on, so they must not be routed an approval. */
async function orgWideApprovers(
  ctx: Pick<QueryCtx, 'db'>,
  organizationId: Id<'organizations'> | undefined,
): Promise<Doc<'users'>[]> {
  if (!organizationId) return [];
  const admins = await ctx.db
    .query('users')
    .withIndex('by_org_role', (q) => q.eq('organizationId', organizationId).eq('role', 'admin'))
    .take(SMALL_LIST_CAP);
  return admins.filter(
    (u) =>
      u.isActive &&
      hasCapability(u, 'leave.approve.org') &&
      // Bot accounts are namespaced under `+<purpose>-bot@<id>.internal` —
      // never a real human login. Strip them so the bot can't end up on a
      // leave-approval recipient list or show up in any HR UI.
      !isSystemAccountEmail(u.email),
  );
}

/** True for the email-shaped accounts used by internal automations (HR
 *  Assistant bot, future moderation bots, etc.) — anything that lives under
 *  the `.internal` namespace. Kept loose on purpose so we don't have to
 *  thread a flag through every bot provisioning path. */
function isSystemAccountEmail(email: string | undefined): boolean {
  return !!email && email.endsWith('.internal');
}

/**
 * Where a new request from `requester` should go.
 *
 * `notifyIds` deliberately includes both the chain approver and the org-wide
 * approvers. The chain approver is the one who *should* act — that is the fix
 * for supervisors never hearing about their own reports. The org-wide holders
 * stay on the list because HR approves everyone here, and dropping them would
 * make HR blind to requests they are responsible for. The list is bounded by
 * the admin count, not by the org size.
 */
export async function resolveApprovalRoute(
  ctx: Pick<QueryCtx, 'db'>,
  requester: Doc<'users'>,
): Promise<ApprovalRoute> {
  const org = requester.organizationId ? await ctx.db.get(requester.organizationId) : null;
  const headId = org?.headUserId;
  const orgApprovers = (await orgWideApprovers(ctx, requester.organizationId)).filter(
    (u) => u._id !== requester._id,
  );

  // ── The head of the organization: no ancestor to route to ────────────────
  if (headId && headId === requester._id) {
    const policy = org?.headApproval ?? 'auto';

    if (policy === 'delegate') {
      const delegateId = org?.headApproverUserId;
      const delegate = delegateId ? await ctx.db.get(delegateId) : null;
      if (delegate && delegate.isActive && delegate._id !== requester._id) {
        return { autoApprove: false, reason: 'delegate', notifyIds: [delegate._id] };
      }
      // Configured but unusable (never set, deactivated, or the head themselves):
      // fall through to peers rather than creating a request nobody can act on.
      return {
        autoApprove: orgApprovers.length === 0,
        reason: orgApprovers.length === 0 ? 'head_auto' : 'head_peer',
        notifyIds: orgApprovers.map((u) => u._id),
      };
    }

    if (policy === 'peer' && orgApprovers.length > 0) {
      return { autoApprove: false, reason: 'head_peer', notifyIds: orgApprovers.map((u) => u._id) };
    }

    return { autoApprove: true, reason: 'head_auto', notifyIds: [] };
  }

  // ── Everyone else: first ancestor who may approve ─────────────────────────
  const ancestorIds = await getAncestorIds(ctx, requester._id);
  for (const ancestorId of ancestorIds) {
    const ancestor = await ctx.db.get(ancestorId);
    if (!ancestor || !ancestor.isActive) continue;
    if (!hasCapability(ancestor, 'leave.approve')) continue;

    const notifyIds = [ancestorId, ...orgApprovers.map((u) => u._id)].filter(
      (id, i, all) => all.indexOf(id) === i,
    );
    return { autoApprove: false, reason: 'chain', notifyIds };
  }

  // Nobody in the line may approve (unassigned employee, or a line of people
  // without the capability): the org-wide approvers own it.
  return {
    autoApprove: false,
    reason: 'org_fallback',
    notifyIds: orgApprovers.map((u) => u._id),
  };
}

/**
 * May `reviewer` approve or reject `leave`?
 *
 * @returns the reason to refuse, or `null` when allowed. Mirrors
 * `attachmentRefusal` in `convex/tasks.ts` so bulk callers can collect reasons
 * per row instead of aborting the whole batch.
 */
export async function reviewRefusal(
  ctx: Pick<QueryCtx, 'db'>,
  reviewer: Doc<'users'>,
  leave: Doc<'leaveRequests'>,
): Promise<string | null> {
  const reviewerIsSuperadmin = reviewer.role === 'superadmin';

  if (!reviewerIsSuperadmin && reviewer.organizationId !== leave.organizationId) {
    return 'Access denied: cross-organization operation';
  }
  // The platform operator is not an org member and holds every capability.
  if (reviewerIsSuperadmin) return null;

  const headId = await getOrgHeadId(ctx, leave.organizationId);
  const requesterIsHead = headId !== undefined && headId === leave.userId;
  const org = leave.organizationId ? await ctx.db.get(leave.organizationId) : null;
  const policy = org?.headApproval ?? 'auto';

  // ── Separation of duties ─────────────────────────────────────────────────
  if (leave.userId === reviewer._id) {
    // One exception: under `auto` the head's own request is recorded as approved
    // by definition. A row that is still pending predates the policy (or the
    // head being declared), and only the head can clear it — nobody above them
    // exists, and HR is explicitly not allowed to review the head.
    if (requesterIsHead && policy === 'auto') return null;
    return 'You cannot review your own leave request';
  }
  if (leave.createdBy && leave.createdBy === reviewer._id) {
    return 'You cannot review a request you filed on someone else’s behalf';
  }

  // ── The head's request follows the head policy, not rank ─────────────────
  if (requesterIsHead) {
    if (policy === 'delegate') {
      return org?.headApproverUserId === reviewer._id
        ? null
        : 'Only the delegated approver may review the head of the organization';
    }
    if (policy === 'peer') {
      return hasCapability(reviewer, 'leave.approve.org')
        ? null
        : 'Only an organization-wide approver may review the head of the organization';
    }
    return 'The leave of the head of the organization is auto-approved and is not reviewed by others';
  }

  // ── HR / admin: org-wide authority ───────────────────────────────────────
  if (hasCapability(reviewer, 'leave.approve.org')) return null;

  // ── Manager: only inside their own subtree ───────────────────────────────
  if (hasCapability(reviewer, 'leave.approve')) {
    return (await isAncestorOf(ctx, reviewer._id, leave.userId))
      ? null
      : "Only a manager in this employee's reporting line may review their leave";
  }

  return 'You do not have permission to review leave requests';
}

/** Throwing wrapper for the single-row mutations. */
export async function assertMayReview(
  ctx: MutationCtx,
  reviewer: Doc<'users'>,
  leave: Doc<'leaveRequests'>,
): Promise<void> {
  const refusal = await reviewRefusal(ctx, reviewer, leave);
  if (refusal) throw new Error(refusal);
}
