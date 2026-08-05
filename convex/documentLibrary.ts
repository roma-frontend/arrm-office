import { v } from 'convex/values';
import { query } from './_generated/server';
import { isSuperadmin } from './lib/auth';
import { getAuthCaller } from './lib/getAuthCaller';

/**
 * Assemble the merge-source data for a single employee: their `users` record
 * joined with their `employeeProfiles` record and their `organizations` record.
 *
 * The client feeds the returned object (plus a `now` timestamp and the current
 * admin as signatory) into `resolveTokens` from `src/lib/documentTokens`.
 * Returns `null` if the employee doesn't exist.
 *
 * ACCESS: the payload contains passport data, social card number, date of birth
 * and salary, so it is restricted to same-org admins/supervisors, superadmins,
 * and the employee themself. Returns `null` rather than throwing so the document
 * screens degrade to an empty state instead of an error boundary.
 */
export const getEmployeeMergeData = query({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    const caller = await getAuthCaller(ctx);
    if (!caller) return null;
    const allowed =
      isSuperadmin(caller) ||
      caller._id === args.userId ||
      ((caller.role === 'admin' || caller.role === 'supervisor') &&
        !!caller.organizationId &&
        caller.organizationId === user.organizationId);
    if (!allowed) return null;

    const profile = await ctx.db
      .query('employeeProfiles')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .first();

    const organization = user.organizationId ? await ctx.db.get(user.organizationId) : null;

    return {
      employee: {
        name: user.name,
        email: user.email,
        phone: user.phone ?? null,
        department: user.department ?? null,
        position: user.position ?? null,
        location: user.location ?? null,
        dateOfBirth: user.dateOfBirth ?? null,
        nationality: profile?.nationality ?? null,
        passportNumber: profile?.passportNumber ?? null,
        passportIssuedBy: profile?.passportIssuedBy ?? null,
        passportIssueDate: profile?.passportIssueDate ?? null,
        passportExpiryDate: profile?.passportExpiryDate ?? null,
        socialCardNumber: profile?.socialCardNumber ?? null,
        baseSalary: profile?.baseSalary ?? null,
        salaryCurrency: profile?.salaryCurrency ?? null,
        // Employment start date. There is no dedicated `hireDate` column — the
        // Add Employee wizard writes the chosen registration date into
        // `createdAt`, which is what the hiring order and contract must print.
        hireDate: user.createdAt ?? null,
        // Drives the second column of a bilingual document.
        language: user.language ?? null,
      },
      organization: {
        name: organization?.name ?? null,
        country: organization?.country ?? null,
        industry: organization?.industry ?? null,
        logoUrl: organization?.logoUrl ?? null,
        primaryColor: organization?.primaryColor ?? null,
      },
    };
  },
});
