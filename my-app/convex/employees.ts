import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    return await ctx.db
      .query("employees")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject as Id<"users">))
      .collect();
  },
});

export const create = mutation({
  args: { name: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("employees")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
    if (existing) throw new Error("Email already exists");

    await ctx.db.insert("employees", {
      name: args.name,
      email: args.email,
      userId: identity.subject as Id<"users">,
    });
  },
});

export const update = mutation({
  args: { id: v.id("employees"), name: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const employee = await ctx.db.get(args.id);
    if (!employee || employee.userId !== (identity.subject as Id<"users">))
      throw new Error("Not authorized");

    const existing = await ctx.db
      .query("employees")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
    if (existing && existing._id !== args.id)
      throw new Error("Email already exists");

    await ctx.db.patch(args.id, { name: args.name, email: args.email });
  },
});

export const remove = mutation({
  args: { id: v.id("employees") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const employee = await ctx.db.get(args.id);
    if (!employee || employee.userId !== (identity.subject as Id<"users">))
      throw new Error("Not authorized");

    // Also delete assignments
    const assignments = await ctx.db
      .query("assignments")
      .withIndex("by_employee", (q) => q.eq("employeeId", args.id))
      .collect();
    for (const a of assignments) {
      await ctx.db.delete(a._id);
    }
    await ctx.db.delete(args.id);
  },
});