import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import bcrypt from "bcryptjs";
import { api } from "./_generated/api";

export const getUserByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
  },
});

// Internal mutation to actually insert the user
export const insertUser = mutation({
  args: { name: v.string(), email: v.string(), hashedPassword: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
    if (existing) throw new Error("Email already exists");
    await ctx.db.insert("users", {
      email: args.email,
      password: args.hashedPassword,
      name: args.name,
    });
  },
});

// Action – can perform non‑deterministic work
export const createUser = action({
  args: { name: v.string(), email: v.string(), password: v.string() },
  handler: async (ctx, args) => {
    const hashed = await bcrypt.hash(args.password, 10);
    await ctx.runMutation(api.users.insertUser, {
      name: args.name,
      email: args.email,
      hashedPassword: hashed,
    });
  },
});