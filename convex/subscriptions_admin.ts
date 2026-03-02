import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const SUPERADMIN_EMAIL = "romangulanyan@gmail.com";

// SUPERADMIN ONLY: Manually create/update subscription for Enterprise customers
export const createManualSubscription = mutation({
  args: {
    organizationId: v.id("organizations"),
    plan: v.union(v.literal("starter"), v.literal("professional"), v.literal("enterprise")),
    customPrice: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if user is superadmin
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();
    
    const isSuperAdmin = currentUser?.email.toLowerCase() === SUPERADMIN_EMAIL;
    
    if (!currentUser || !isSuperAdmin) {
      throw new Error("Not authorized - superadmin only");
    }

    // Check if organization exists
    const organization = await ctx.db.get(args.organizationId);
    if (!organization) {
      throw new Error("Organization not found");
    }

    // Check if subscription already exists for this organization
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .first();

    const now = Date.now();
    const subscriptionData = {
      organizationId: args.organizationId,
      plan: args.plan,
      status: "active" as const,
      stripeCustomerId: `manual_${args.organizationId}_${now}`,
      stripeSubscriptionId: `manual_sub_${args.organizationId}_${now}`,
      stripePriceId: args.plan === "enterprise" ? "enterprise_custom" : "",
      currentPeriodEnd: now + (365 * 24 * 60 * 60 * 1000), // 1 year
      currentPeriodStart: now,
      cancelAtPeriodEnd: false,
      createdAt: now,
      updatedAt: now,
      metadata: {
        manual: true,
        customPrice: args.customPrice,
        notes: args.notes,
        createdBy: currentUser._id,
        createdAt: now,
      },
    };

    if (existing) {
      await ctx.db.patch(existing._id, subscriptionData);
      // Update organization plan
      await ctx.db.patch(args.organizationId, { plan: args.plan });
      return { success: true, subscriptionId: existing._id, action: "updated" };
    } else {
      const id = await ctx.db.insert("subscriptions", subscriptionData);
      // Update organization plan
      await ctx.db.patch(args.organizationId, { plan: args.plan });
      return { success: true, subscriptionId: id, action: "created" };
    }
  },
});

// SUPERADMIN ONLY: List all subscriptions with organization details
export const listAllWithUsers = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();
    
    const isSuperAdmin = currentUser?.email.toLowerCase() === SUPERADMIN_EMAIL;
    
    if (!currentUser || !isSuperAdmin) return [];

    const subscriptions = await ctx.db.query("subscriptions").collect();
    
    const withOrganizations = await Promise.all(
      subscriptions.map(async (sub) => {
        const organization = sub.organizationId ? await ctx.db.get(sub.organizationId) : null;
        
        // Count employees in the organization
        let employeeCount = 0;
        if (organization) {
          const employees = await ctx.db
            .query("users")
            .withIndex("by_org", (q) => q.eq("organizationId", organization._id))
            .collect();
          employeeCount = employees.length;
        }
        
        return {
          ...sub,
          organizationName: organization?.name,
          organizationSlug: organization?.slug,
          employeeCount,
          isManual: sub.metadata?.manual || false,
        };
      })
    );

    return withOrganizations;
  },
});

// SUPERADMIN ONLY: Cancel subscription
export const cancelSubscription = mutation({
  args: { subscriptionId: v.id("subscriptions") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();
    
    const isSuperAdmin = currentUser?.email.toLowerCase() === SUPERADMIN_EMAIL;
    
    if (!currentUser || !isSuperAdmin) {
      throw new Error("Not authorized - superadmin only");
    }

    await ctx.db.patch(args.subscriptionId, {
      status: "canceled",
      cancelAtPeriodEnd: false,
    });

    return { success: true };
  },
});
