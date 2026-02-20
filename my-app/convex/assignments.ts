import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

export const listByEmployee = query({
  args: { employeeId: v.id("employees") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    return await ctx.db
      .query("assignments")
      .withIndex("by_employee", (q) => q.eq("employeeId", args.employeeId))
      .collect();
  },
});

export const listForMonth = query({
  args: { year: v.number(), month: v.number() }, // month 0-11
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const start = new Date(args.year, args.month, 1);
    const end = new Date(args.year, args.month + 1, 0);
    const assignments = await ctx.db
      .query("assignments")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject as Id<"users">))
      .collect();
    return assignments.filter((a) => {
      const d = new Date(a.date + "T12:00:00");
      return d >= start && d <= end;
    });
  },
});

export const assignRange = mutation({
  args: {
    employeeId: v.id("employees"),
    startDate: v.string(),
    endDate: v.string(),
    code: v.string(),
    comment: v.optional(v.string()),
    amount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const employee = await ctx.db.get(args.employeeId);
    if (!employee || employee.userId !== (identity.subject as Id<"users">))
      throw new Error("Not authorized");

    const start = new Date(args.startDate);
    const end = new Date(args.endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;
      await ctx.db.insert("assignments", {
        employeeId: args.employeeId,
        date: dateStr,
        code: args.code,
        comment: args.comment,
        amount: args.amount,
        userId: identity.subject as Id<"users">,
      });
    }
  },
});

export const deleteRange = mutation({
  args: {
    employeeId: v.id("employees"),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const employee = await ctx.db.get(args.employeeId);
    if (!employee || employee.userId !== (identity.subject as Id<"users">))
      throw new Error("Not authorized");

    const start = new Date(args.startDate);
    const end = new Date(args.endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;
      const existing = await ctx.db
        .query("assignments")
        .withIndex("by_employee_date", (q) =>
          q.eq("employeeId", args.employeeId).eq("date", dateStr)
        )
        .first();
      if (existing) {
        await ctx.db.delete(existing._id);
      }
    }
  },
});