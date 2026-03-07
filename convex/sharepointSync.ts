import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ─────────────────────────────────────────────────────────────────────────────
// UPSERT SHAREPOINT USER — create or update a user from SharePoint data
// ─────────────────────────────────────────────────────────────────────────────
export const upsertSharePointUser = mutation({
  args: {
    adminId: v.id("users"),
    organizationId: v.id("organizations"),
    email: v.string(),
    name: v.string(),
    department: v.optional(v.string()),
    position: v.optional(v.string()),
    phone: v.optional(v.string()),
    location: v.optional(v.string()),
    employeeType: v.union(v.literal("staff"), v.literal("contractor")),
  },
  handler: async (ctx, args) => {
    // Verify admin
    const admin = await ctx.db.get(args.adminId);
    if (!admin) throw new Error("Admin not found");
    if (admin.role !== "admin" && admin.role !== "superadmin") {
      throw new Error("Only admins can sync SharePoint users");
    }

    const emailLower = args.email.toLowerCase().trim();

    // Check if user already exists in this org
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", emailLower))
      .first();

    if (existing) {
      // Update existing user — only patch fields that come from SharePoint
      await ctx.db.patch(existing._id, {
        name: args.name,
        department: args.department,
        position: args.position,
        phone: args.phone,
        location: args.location,
        employeeType: args.employeeType,
        isActive: true, // Re-activate if previously deactivated
      });
      return { action: "updated" as const, userId: existing._id };
    }

    // Create new user with default balances
    const isStaff = args.employeeType === "staff";
    const now = Date.now();

    // Generate a random placeholder password hash (user will need to set real password)
    const randomHash = `sharepoint_sync_${now}_${Math.random().toString(36).slice(2)}`;

    const userId = await ctx.db.insert("users", {
      organizationId: args.organizationId,
      name: args.name,
      email: emailLower,
      passwordHash: randomHash,
      role: "employee",
      employeeType: args.employeeType,
      department: args.department,
      position: args.position,
      phone: args.phone,
      location: args.location,
      isActive: true,
      isApproved: true,
      travelAllowance: isStaff ? 20000 : 12000,
      paidLeaveBalance: 20,
      sickLeaveBalance: 10,
      familyLeaveBalance: 5,
      createdAt: now,
    });

    return { action: "created" as const, userId };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// DEACTIVATE SHAREPOINT USERS — set isActive=false for users not in the list
// ─────────────────────────────────────────────────────────────────────────────
export const deactivateSharePointUsers = mutation({
  args: {
    adminId: v.id("users"),
    organizationId: v.id("organizations"),
    activeEmails: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    // Verify admin
    const admin = await ctx.db.get(args.adminId);
    if (!admin) throw new Error("Admin not found");
    if (admin.role !== "admin" && admin.role !== "superadmin") {
      throw new Error("Only admins can deactivate users");
    }

    const activeEmailSet = new Set(
      args.activeEmails.map((e) => e.toLowerCase().trim())
    );

    // Get all active users in the org
    const orgUsers = await ctx.db
      .query("users")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    let deactivated = 0;

    for (const user of orgUsers) {
      // Skip admins and superadmins — they are not managed by SharePoint sync
      if (user.role === "admin" || user.role === "superadmin" || user.role === "supervisor") {
        continue;
      }
      // If user email is NOT in the SharePoint list, deactivate
      if (!activeEmailSet.has(user.email.toLowerCase())) {
        await ctx.db.patch(user._id, { isActive: false });
        deactivated++;
      }
    }

    return { deactivated };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// LOG SYNC — record a sync attempt
// ─────────────────────────────────────────────────────────────────────────────
export const logSync = mutation({
  args: {
    organizationId: v.id("organizations"),
    triggeredBy: v.id("users"),
    created: v.number(),
    updated: v.number(),
    deactivated: v.number(),
    errors: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("sharepointSyncLogs", {
      organizationId: args.organizationId,
      triggeredBy: args.triggeredBy,
      created: args.created,
      updated: args.updated,
      deactivated: args.deactivated,
      errors: args.errors,
      syncedAt: Date.now(),
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET LAST SYNC — for showing "last synced at" in the UI
// ─────────────────────────────────────────────────────────────────────────────
export const getLastSync = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const logs = await ctx.db
      .query("sharepointSyncLogs")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .order("desc")
      .take(1);

    return logs[0] || null;
  },
});
