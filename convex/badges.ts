/**
 * Unified nav-badge counts — one subscription instead of many.
 *
 * The sidebar, mobile sidebar, mobile dock and navbar each used to hold their
 * own copies of the same badge subscriptions (leaves unread, pending
 * signatures, pending approvals, news unread). Every write to any of those
 * tables re-ran up to three identical queries per connected client. This query
 * groups the low-frequency counters into a single subscription that the
 * NavBadgesProvider shares across the whole shell.
 *
 * Deliberately excluded:
 *   - chat unread — chatMembers is the highest-write table in the app; keeping
 *     it separate stops every incoming message from re-running this whole
 *     read set (announcements, signatures, leaves…).
 *   - notifications — the shared `getUserNotifications` list already serves
 *     the banner, dropdown and task badge; deriving counts client-side from
 *     that one subscription is free.
 *
 * Every read here is bounded: no branch touches more than a few hundred
 * documents, unlike `news.getNewsStats` (up to 4000 docs per run), which this
 * badge replaces in the nav.
 */
import { query } from './_generated/server';
import { getAuthCaller } from './lib/getAuthCaller';
import { isSuperadmin } from './lib/auth';
import { canSeeAnnouncement } from './news';
import { MAX_PAGE_SIZE } from './pagination';

/**
 * How many of the latest announcements the unread-news badge considers.
 * Anything older than the 60 most recent posts is not what a nav dot is for —
 * the badge caps visually anyway, and this keeps the read set bounded.
 */
const NEWS_BADGE_SCAN_CAP = 60;

export const getNavBadges = query({
  args: {},
  handler: async (ctx) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return null;

    const superadmin = isSuperadmin(caller);
    const staff = superadmin || caller.role === 'admin' || caller.role === 'supervisor';

    // ── Unread leave requests (pending-review queue, staff only) ──────────
    // Mirrors `leaves.getUnreadCount`: superadmin sees all orgs, org staff
    // sees their own, everyone else gets 0 so org-wide numbers never leak.
    let leavesUnread = 0;
    if (superadmin) {
      const allLeaves = await ctx.db.query('leaveRequests').order('desc').take(MAX_PAGE_SIZE);
      leavesUnread = allLeaves.filter(
        (l) =>
          (l.isRead === false || l.isRead === undefined) &&
          (l.status === 'pending' || l.status === 'cancel_requested'),
      ).length;
    } else if ((caller.role === 'admin' || caller.role === 'supervisor') && caller.organizationId) {
      const orgId = caller.organizationId;
      const orgLeaves = await ctx.db
        .query('leaveRequests')
        .withIndex('by_org', (q) => q.eq('organizationId', orgId))
        .take(MAX_PAGE_SIZE);
      leavesUnread = orgLeaves.filter(
        (l) =>
          (l.isRead === false || l.isRead === undefined) &&
          (l.status === 'pending' || l.status === 'cancel_requested'),
      ).length;
    }

    // ── Pending signature requests addressed to the caller ────────────────
    // Count-only version of `signatures.getMyPendingSignatures`: the nav badge
    // needs a number, not the enriched list with per-document sibling walks.
    const signatureRequests = await ctx.db
      .query('signatureRequests')
      .withIndex('by_signer_status', (q) => q.eq('signerId', caller._id).eq('status', 'pending'))
      .take(MAX_PAGE_SIZE);
    let pendingSignatures = 0;
    for (const req of signatureRequests) {
      const doc = await ctx.db.get(req.documentId);
      if (doc && doc.status !== 'cancelled') pendingSignatures++;
    }

    // ── Users awaiting approval (org admins / superadmin) ─────────────────
    let pendingApprovals = 0;
    if (superadmin) {
      const allUsers = await ctx.db.query('users').order('desc').take(MAX_PAGE_SIZE);
      pendingApprovals = allUsers.filter((u) => !u.isApproved).length;
    } else if (caller.role === 'admin' && caller.organizationId) {
      const orgId = caller.organizationId;
      const pendingUsers = await ctx.db
        .query('users')
        .withIndex('by_org_approval', (q) => q.eq('organizationId', orgId).eq('isApproved', false))
        .take(MAX_PAGE_SIZE);
      pendingApprovals = pendingUsers.length;
    }

    // ── Unread announcements ───────────────────────────────────────────────
    // Bounded replacement for `news.getNewsStats.unreadCount` in the nav: the
    // stats query reads up to 2000 announcements + 2000 views per run; here we
    // look at the latest posts only and point-read each view row.
    let newsUnread = 0;
    if (caller.organizationId) {
      const orgId = caller.organizationId;
      const userDoc = await ctx.db.get(caller._id);
      const viewer = {
        _id: caller._id,
        role: caller.role,
        departmentId: userDoc?.departmentId,
      };
      const now = Date.now();
      const recent = await ctx.db
        .query('announcements')
        .withIndex('by_org_published', (q) => q.eq('organizationId', orgId))
        .order('desc')
        .take(NEWS_BADGE_SCAN_CAP);
      const visible = recent.filter(
        (a) => (!a.expiresAt || a.expiresAt > now) && canSeeAnnouncement(a, viewer, staff),
      );
      for (const a of visible) {
        const seen = await ctx.db
          .query('announcementViews')
          .withIndex('by_announcement_user', (q) =>
            q.eq('announcementId', a._id).eq('userId', caller._id),
          )
          .first();
        if (!seen) newsUnread++;
      }
    }

    return { leavesUnread, pendingSignatures, pendingApprovals, newsUnread };
  },
});
