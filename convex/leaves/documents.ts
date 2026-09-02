/**
 * Leave document generation — bilingual leave request and order documents.
 *
 * Flow:
 *   1. Employee requests leave → leave-request document sent to supervisor for signature
 *   2. Supervisor approves → leave-order document sent to HR for signature (if HR exists)
 *   3. If no HR → auto-generated (no signature needed)
 *   4. HR approves → done; HR rejects → cycle closes
 */
import { v } from 'convex/values';
import { internalMutation, query } from '../_generated/server';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import { getAuthCaller } from '../lib/getAuthCaller';

import { insertSignatureDocument } from '../signatures';
import { allocateDocumentNumber } from '../lib/documentNumbers';
import { notify } from '../lib/notify';
import { hasCapability } from '../lib/capabilities';
import { SMALL_LIST_CAP } from '../lib/limits';

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Find active HR / admin holders of leave.approve.org in an organization. */
async function findOrgHrUsers(
  ctx: Pick<QueryCtx, 'db'>,
  organizationId: Id<'organizations'>,
): Promise<Doc<'users'>[]> {
  const admins = await ctx.db
    .query('users')
    .withIndex('by_org_role', (q) => q.eq('organizationId', organizationId).eq('role', 'admin'))
    .take(SMALL_LIST_CAP);
  return admins.filter(
    (u) => u.isActive && hasCapability(u, 'leave.approve.org') && !u.email?.endsWith('.internal'),
  );
}

/** Locale of the secondary language for a leave document (Armenian + org lang). */
function secondaryLocale(employee: Doc<'users'>): 'hy' | 'ru' | 'en' | 'de' {
  // Armenian is always primary; secondary comes from employee preference or org default
  return (employee.language as 'hy' | 'ru' | 'en' | 'de') ?? 'ru';
}

/** Translate leave type key to display labels per locale. */
const LEAVE_TYPE_LABELS: Record<string, Record<string, string>> = {
  paid: { en: 'paid', ru: 'оплачиваемый', hy: 'վճարվող', de: 'bezahlter' },
  unpaid: { en: 'unpaid', ru: 'неоплачиваемый', hy: 'անվճար', de: 'unbezahlter' },
  sick: { en: 'sick', ru: 'больничный', hy: 'հիվանդության', de: 'Krankheits' },
  family: { en: 'family', ru: 'семейный', hy: 'ընտանեկան', de: 'Familien' },
  maternity: { en: 'maternity', ru: 'декретный', hy: 'մայրության', de: 'Mutterschafts' },
  paternity: { en: 'paternity', ru: 'отцовский', hy: 'հայրության', de: 'Vaterschafts' },
  study: { en: 'study', ru: 'учебный', hy: 'ուսումնական', de: 'Studien' },
  doctor: { en: 'doctor visit', ru: 'визит к врачу', hy: 'բժշկի այց', de: 'Arztbesuch' },
  day_off: { en: 'day off', ru: 'выходной', hy: 'հանգստյան օր', de: 'freier Tag' },
};

function leaveTypeLabel(type: string, locale: string): string {
  return LEAVE_TYPE_LABELS[type]?.[locale] ?? type;
}

// ─── Build bilingual leave request content ─────────────────────────────────

/**
 * Build the bilingual blocks for a leave request document.
 * This document is the employee's formal leave request, sent to the supervisor for signature.
 */
function buildLeaveRequestContent(args: {
  orgName: string;
  employeeName: string;
  employeePosition: string;
  employeeDepartment: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  primaryLocale: string;
  secondaryLocale: string;
  signatoryName?: string;
  signatoryPosition?: string;
  today: string;
}): string {
  const typeLabel = leaveTypeLabel(args.leaveType, args.primaryLocale);
  const typeLabelSec = leaveTypeLabel(args.leaveType, args.secondaryLocale);
  const dayWord = args.days === 1 ? 'day' : 'days';
  const dayWordHy = args.days === 1 ? 'օր' : 'օր';

  const blocks: Array<{ left: string; right: string }> = [
    // Title
    {
      left: `${args.orgName} — LEAVE REQUEST`,
      right: `${args.orgName} — ԴԻՄՈՒՄ ԱՐՁԱԿՈՒՐԴԻ ՀԱՄԱՐ`,
    },
    // Requestor info
    {
      left: `I, ${args.employeeName}, ${args.employeePosition} of the ${args.employeeDepartment} department,`,
      right: `Ես՝ ${args.employeeName}-ի, ${args.employeeDepartment} բաժնի ${args.employeePosition},`,
    },
    // Request body
    {
      left: `hereby request ${typeLabel} leave for ${args.days} ${dayWord} (${args.startDate} – ${args.endDate}).`,
      right: `սույնով խնդրում եմ տրամադրել ${typeLabelSec} արձակուրդ՝ ${args.days} ${dayWordHy} ժամկետով (${args.startDate} – ${args.endDate})։`,
    },
    // Reason
    {
      left: `Reason: ${args.reason}`,
      right: `Պատճառ՝ ${args.reason}`,
    },
    // Date
    {
      left: `Date: ${args.today}`,
      right: `Ամսաթիվ՝ ${args.today}`,
    },
  ];

  // Flatten into a JSON structure that the signing system can freeze
  return JSON.stringify({
    version: 2,
    source: 'catalog' as const,
    templateId: 'leave-request',
    title: 'Leave Request / Դիմում',
    blocks: blocks.map((b) => ({
      type: 'bilingual' as const,
      left: [{ type: 'paragraph' as const, text: b.left }],
      right: [{ type: 'paragraph' as const, text: b.right }],
      leftLabel: args.primaryLocale === 'hy' ? 'ՀԱՅԵՐԵՆ' : args.primaryLocale.toUpperCase(),
      rightLabel: args.secondaryLocale === 'hy' ? 'ՀԱՅԵՐԵՆ' : args.secondaryLocale.toUpperCase(),
    })),
    accent: 'emerald' as const,
    orgName: args.orgName,
    primaryLocale: args.primaryLocale,
    secondaryLocale: args.secondaryLocale,
    labels: {
      signature: args.primaryLocale === 'hy' ? 'Ստորագրություն' : 'Signature',
      name: args.primaryLocale === 'hy' ? 'Անուն' : 'Name',
      date: args.primaryLocale === 'hy' ? 'Ամսաթիվ' : 'Date',
      position: args.primaryLocale === 'hy' ? 'Պաշտոն' : 'Position',
    },
  });
}

/**
 * Build the bilingual blocks for a leave order document.
 * This document is the formal order issued after supervisor approval, sent to HR for countersignature.
 */
function buildLeaveOrderContent(args: {
  orgName: string;
  employeeName: string;
  employeePosition: string;
  employeeDepartment: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  supervisorName: string;
  supervisorPosition: string;
  primaryLocale: string;
  secondaryLocale: string;
  today: string;
}): string {
  const typeLabel = leaveTypeLabel(args.leaveType, args.primaryLocale);
  const typeLabelSec = leaveTypeLabel(args.leaveType, args.secondaryLocale);

  const blocks: Array<{ left: string; right: string }> = [
    // Title
    {
      left: `${args.orgName} — LEAVE ORDER`,
      right: `${args.orgName} — ՀՐԱՄԱՆ ԱՐՁԱԿՈՒՐԴԻ ՄԱՍԻՆ`,
    },
    // Order body
    {
      left: `By order of ${args.supervisorName}, ${args.supervisorPosition}, ${args.employeeName}, ${args.employeePosition} of the ${args.employeeDepartment} department, is granted ${typeLabel} leave for ${args.days} days (${args.startDate} – ${args.endDate}).`,
      right: `${args.supervisorName}-ի՝ ${args.supervisorPosition} հրամանով, ${args.employeeDepartment} բաժնի ${args.employeePosition} ${args.employeeName}-ին տրամադրվում է ${typeLabelSec} արձակուրդ՝ ${args.days} օրով (${args.startDate} – ${args.endDate})։`,
    },
    // Reason
    {
      left: `Reason: ${args.reason}`,
      right: `Պատճառ՝ ${args.reason}`,
    },
    // Date
    {
      left: `Date: ${args.today}`,
      right: `Ամսաթիվ՝ ${args.today}`,
    },
  ];

  return JSON.stringify({
    version: 2,
    source: 'catalog' as const,
    templateId: 'leave-order',
    title: 'Leave Order / Հրաման',
    blocks: blocks.map((b) => ({
      type: 'bilingual' as const,
      left: [{ type: 'paragraph' as const, text: b.left }],
      right: [{ type: 'paragraph' as const, text: b.right }],
      leftLabel: args.primaryLocale === 'hy' ? 'ՀԱՅԵՐԵՆ' : args.primaryLocale.toUpperCase(),
      rightLabel: args.secondaryLocale === 'hy' ? 'ՀԱՅԵՐԵՆ' : args.secondaryLocale.toUpperCase(),
    })),
    accent: 'emerald' as const,
    orgName: args.orgName,
    primaryLocale: args.primaryLocale,
    secondaryLocale: args.secondaryLocale,
    labels: {
      signature: args.primaryLocale === 'hy' ? 'Ստորագրություն' : 'Signature',
      name: args.primaryLocale === 'hy' ? 'Անուն' : 'Name',
      date: args.primaryLocale === 'hy' ? 'Ամսաթիվ' : 'Date',
      position: args.primaryLocale === 'hy' ? 'Պաշտոն' : 'Position',
    },
  });
}

// ─── Generate leave request document ───────────────────────────────────────

/**
 * Called after `createLeave` to generate the bilingual leave-request document
 * and send it to the supervisor for signature.
 */
export const generateLeaveRequestDocument = internalMutation({
  args: {
    leaveId: v.id('leaveRequests'),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');

    const leave = await ctx.db.get(args.leaveId);
    if (!leave) throw new Error('Leave request not found');
    if (leave.status !== 'pending') throw new Error('Leave is not pending');
    if (leave.leaveRequestDocumentId) return { documentId: leave.leaveRequestDocumentId };

    const user = await ctx.db.get(leave.userId);
    if (!user) throw new Error('User not found');

    const org = leave.organizationId ? await ctx.db.get(leave.organizationId) : null;
    if (!org) throw new Error('Organization not found');

    const secLocale = secondaryLocale(user);
    const now = Date.now();

    // Build the bilingual content
    const content = buildLeaveRequestContent({
      orgName: org.name ?? 'Organization',
      employeeName: user.name ?? 'Employee',
      employeePosition: user.position ?? 'Employee',
      employeeDepartment: user.department ?? 'General',
      leaveType: leave.type,
      startDate: leave.startDate,
      endDate: leave.endDate,
      days: leave.days,
      reason: leave.reason,
      primaryLocale: 'hy',
      secondaryLocale: secLocale,
      today: new Date(now).toLocaleDateString('en-GB'),
    });

    // The supervisor (reviewer) signs first, then the employee
    const signers: Array<{ userId: Id<'users'>; name: string; email: string; order: number }> = [];

    // Order 1: the supervisor (the nearest approver in the reporting line)
    if (leave.reviewedBy) {
      const reviewer = await ctx.db.get(leave.reviewedBy);
      if (reviewer) {
        signers.push({
          userId: reviewer._id,
          name: reviewer.name ?? '',
          email: reviewer.email ?? '',
          order: 1,
        });
      }
    }

    // Order 2: the employee
    signers.push({
      userId: user._id,
      name: user.name ?? '',
      email: user.email ?? '',
      order: signers.length + 1,
    });

    if (signers.length === 0) {
      throw new Error('No signers found for leave request document');
    }

    const documentNumber = await allocateDocumentNumber(ctx, leave.organizationId!);

    const signatureDocumentId = await insertSignatureDocument(ctx, {
      organizationId: leave.organizationId!,
      title: `Leave Request — ${user.name ?? 'Employee'} (${leave.startDate} → ${leave.endDate})`,
      content,
      accent: 'emerald',
      orgName: org.name ?? 'Organization',
      signatureBlock: true,
      fieldDefinitions: [
        { id: 'signature', label: 'Signature', type: 'signature', required: true },
      ],
      signers,
      createdBy: caller._id,
    });

    await ctx.db.patch(args.leaveId, {
      leaveRequestDocumentId: signatureDocumentId,
      updatedAt: now,
    });

    // Notify the supervisor about the document
    for (const signer of signers) {
      if (signer.userId === user._id) continue; // Don't notify the employee about their own doc
      await notify(ctx, {
        organizationId: leave.organizationId!,
        userId: signer.userId,
        type: 'system',
        titleKey: 'notifications.titles.documentAwaitingSignature',
        messageKey: 'notifications.messages.documentAwaitingSignature',
        params: { title: `Leave Request — ${user.name}` },
        fallbackTitle: '✍️ Leave request document awaiting signature',
        fallbackMessage: `Leave request for ${user.name} is waiting for your signature.`,
        relatedId: signatureDocumentId,
        route: '/signatures',
        createdAt: now,
      });
    }

    return { signatureDocumentId, documentNumber };
  },
});

// ─── Generate leave order document (after supervisor approval) ─────────────

/**
 * Called after `approveLeave` when the supervisor approves.
 * If HR exists, generates a leave-order document and sends it to HR for countersignature.
 * If no HR, the order is auto-recorded.
 */
export const generateLeaveOrderDocument = internalMutation({
  args: {
    leaveId: v.id('leaveRequests'),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');

    const leave = await ctx.db.get(args.leaveId);
    if (!leave) throw new Error('Leave request not found');
    if (leave.status !== 'approved') throw new Error('Leave must be approved');
    if (leave.leaveOrderDocumentId) return { documentId: leave.leaveOrderDocumentId };

    const user = await ctx.db.get(leave.userId);
    if (!user) throw new Error('User not found');

    const org = leave.organizationId ? await ctx.db.get(leave.organizationId) : null;
    if (!org) throw new Error('Organization not found');

    // Find HR users who can countersign
    const hrUsers = leave.organizationId ? await findOrgHrUsers(ctx, leave.organizationId) : [];

    // Filter out the reviewer (supervisor) from HR list to avoid self-signing
    const approverHrUsers = hrUsers.filter(
      (u) => u._id !== leave.reviewedBy && u._id !== leave.userId,
    );

    const secLocale = secondaryLocale(user);
    const now = Date.now();

    // Get supervisor info for the order
    const supervisor = leave.reviewedBy ? await ctx.db.get(leave.reviewedBy) : null;

    // Build the bilingual leave order content
    const content = buildLeaveOrderContent({
      orgName: org.name ?? 'Organization',
      employeeName: user.name ?? 'Employee',
      employeePosition: user.position ?? 'Employee',
      employeeDepartment: user.department ?? 'General',
      leaveType: leave.type,
      startDate: leave.startDate,
      endDate: leave.endDate,
      days: leave.days,
      reason: leave.reason,
      supervisorName: supervisor?.name ?? 'Supervisor',
      supervisorPosition: supervisor?.position ?? 'Supervisor',
      primaryLocale: 'hy',
      secondaryLocale: secLocale,
      today: new Date(now).toLocaleDateString('en-GB'),
    });

    if (approverHrUsers.length === 0) {
      // No HR available — record the order as auto-approved
      // The leave is already approved by the supervisor, so no further signature needed
      return { autoApproved: true, reason: 'no_hr' };
    }

    // Build signers: employee first, then HR
    const signers: Array<{ userId: Id<'users'>; name: string; email: string; order: number }> = [
      {
        userId: user._id,
        name: user.name ?? '',
        email: user.email ?? '',
        order: 1,
      },
    ];

    // Add HR as countersigner
    for (const hr of approverHrUsers.slice(0, 2)) {
      signers.push({
        userId: hr._id,
        name: hr.name ?? '',
        email: hr.email ?? '',
        order: signers.length + 1,
      });
    }

    const documentNumber = await allocateDocumentNumber(ctx, leave.organizationId!);

    const signatureDocumentId = await insertSignatureDocument(ctx, {
      organizationId: leave.organizationId!,
      title: `Leave Order — ${user.name ?? 'Employee'} (${leave.startDate} → ${leave.endDate})`,
      content,
      accent: 'emerald',
      orgName: org.name ?? 'Organization',
      signatureBlock: true,
      fieldDefinitions: [
        { id: 'signature', label: 'Signature', type: 'signature', required: true },
      ],
      signers,
      createdBy: caller._id,
    });

    await ctx.db.patch(args.leaveId, {
      leaveOrderDocumentId: signatureDocumentId,
      updatedAt: now,
    });

    // Notify all signers
    for (const signer of signers) {
      await notify(ctx, {
        organizationId: leave.organizationId!,
        userId: signer.userId,
        type: 'system',
        titleKey: 'notifications.titles.documentAwaitingSignature',
        messageKey: 'notifications.messages.documentAwaitingSignature',
        params: { title: `Leave Order — ${user.name}` },
        fallbackTitle: '✍️ Leave order document awaiting signature',
        fallbackMessage: `Leave order for ${user.name} is waiting for your signature.`,
        relatedId: signatureDocumentId,
        route: '/signatures',
        createdAt: now,
      });
    }

    return { signatureDocumentId, documentNumber, autoApproved: false };
  },
});

// ─── Query: get leave document state ───────────────────────────────────────

export const getLeaveDocuments = query({
  args: {
    leaveId: v.id('leaveRequests'),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return null;

    const leave = await ctx.db.get(args.leaveId);
    if (!leave) return null;

    const requestDoc = leave.leaveRequestDocumentId
      ? await ctx.db.get(leave.leaveRequestDocumentId)
      : null;
    const orderDoc = leave.leaveOrderDocumentId
      ? await ctx.db.get(leave.leaveOrderDocumentId)
      : null;

    return {
      leaveRequestDocument: requestDoc
        ? {
            id: requestDoc._id,
            title: requestDoc.title,
            status: requestDoc.status,
          }
        : null,
      leaveOrderDocument: orderDoc
        ? {
            id: orderDoc._id,
            title: orderDoc.title,
            status: orderDoc.status,
          }
        : null,
    };
  },
});

// ─── Release leave when signature is declined/cancelled ───────────────────

/**
 * Called from `declineDocument` / `cancelDocument` in `convex/signatures.ts`.
 * When a leave-order signature document (HR countersignature) is declined or
 * cancelled, the leave is marked as rejected and the balance is restored.
 *
 * When a leave-request signature document (supervisor signature) is declined,
 * the leave goes back to pending for re-assignment or is rejected.
 */
export async function releaseLeaveRow(
  ctx: MutationCtx,
  documentId: Id<'signatureDocuments'>,
): Promise<void> {
  // We need to search across all organizations, so we cannot use the
  // by_org index (it requires organizationId). A filter-based scan is
  // acceptable because leaveRequestDocumentId / leaveOrderDocumentId
  // mutations happen rarely (only on signature decline/cancel).
  const leaveAsRequest = await ctx.db
    .query('leaveRequests')
    .filter((q) => q.eq(q.field('leaveRequestDocumentId'), documentId))
    .first();

  if (leaveAsRequest && leaveAsRequest.status === 'pending') {
    // Supervisor declined the leave request document — reject the leave
    await rejectLeaveFromSignature(
      ctx,
      leaveAsRequest,
      'Supervisor declined the leave request document',
    );
    return;
  }

  const leaveAsOrder = await ctx.db
    .query('leaveRequests')
    .filter((q) => q.eq(q.field('leaveOrderDocumentId'), documentId))
    .first();

  if (leaveAsOrder && leaveAsOrder.status === 'approved') {
    // HR declined the leave order document — reject the leave
    await rejectLeaveFromSignature(ctx, leaveAsOrder, 'HR declined the leave order document');
    return;
  }
}

/**
 * Reject a leave from a signature decline/cancel event.
 * Restores the balance if it was deducted, notifies the employee, and logs it.
 */
async function rejectLeaveFromSignature(
  ctx: MutationCtx,
  leave: Doc<'leaveRequests'>,
  reason: string,
): Promise<void> {
  const now = Date.now();

  // Restore balance if it was already deducted (leave was approved)
  if (leave.status === 'approved') {
    const user = await ctx.db.get(leave.userId);
    if (user) {
      const { restoreLeaveBalance } = await import('./balances');
      await restoreLeaveBalance(ctx, leave.userId, user, leave.type, leave.days);
    }
  }

  // Update leave status to rejected
  await ctx.db.patch(leave._id, {
    status: 'rejected',
    reviewComment: reason,
    reviewedAt: now,
    updatedAt: now,
  });

  // Notify the employee
  await notify(ctx, {
    organizationId: leave.organizationId,
    userId: leave.userId,
    type: 'leave_rejected',
    titleKey: 'notifications.titles.leaveRejected',
    messageKey: 'notifications.messages.leaveRejectedBy',
    params: {
      type: leave.type,
      start: leave.startDate,
      end: leave.endDate,
      reviewerName: 'System',
      comment: reason,
    },
    fallbackTitle: '\u274c Leave Rejected',
    fallbackMessage: `Your ${leave.type} leave (${leave.startDate} \u2192 ${leave.endDate}) was rejected: ${reason}.`,
    relatedId: leave._id,
    route: '/leaves',
    createdAt: now,
  });

  // Audit log
  await ctx.db.insert('auditLogs', {
    organizationId: leave.organizationId,
    userId: leave.userId,
    action: 'leave_rejected',
    target: leave._id,
    details: JSON.stringify({
      type: leave.type,
      startDate: leave.startDate,
      endDate: leave.endDate,
      days: leave.days,
      reason,
      source: 'signature_decline',
    }),
    createdAt: now,
  });
}
