import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ── SUPERADMIN EMAIL ─────────────────────────────────────────────────────────
// Only this account can create organizations and access all tenants
const SUPERADMIN_EMAIL = "romangulanyan@gmail.com";

// ── Employee limits by plan ──────────────────────────────────────────────────
const PLAN_EMPLOYEE_LIMITS: Record<string, number> = {
  starter: 10,
  professional: 50,
  enterprise: 999999,
};

// ─────────────────────────────────────────────────────────────────────────────
// SUPERADMIN: Create a new organization
// ─────────────────────────────────────────────────────────────────────────────
export const createOrganization = mutation({
  args: {
    superadminUserId: v.id("users"),
    name: v.string(),
    slug: v.string(),
    plan: v.union(v.literal("starter"), v.literal("professional"), v.literal("enterprise")),
    timezone: v.optional(v.string()),
    country: v.optional(v.string()),
    industry: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Verify caller is superadmin
    const caller = await ctx.db.get(args.superadminUserId);
    if (!caller || caller.email.toLowerCase() !== SUPERADMIN_EMAIL) {
      throw new Error("Only the superadmin can create organizations");
    }

    // Normalize slug: lowercase, only letters/numbers/hyphens
    const slug = args.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    if (!slug) throw new Error("Invalid organization slug");

    // Check slug uniqueness
    const existing = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existing) throw new Error(`Organization with slug "${slug}" already exists`);

    const orgId = await ctx.db.insert("organizations", {
      name: args.name,
      slug,
      plan: args.plan,
      isActive: true,
      createdBySuperadmin: true,
      timezone: args.timezone ?? "UTC",
      country: args.country,
      industry: args.industry,
      employeeLimit: PLAN_EMPLOYEE_LIMITS[args.plan],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { orgId, slug };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// SUPERADMIN ONLY: List all organizations (for subscription management)
// ─────────────────────────────────────────────────────────────────────────────
export const listAll = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();
    
    // Only superadmin can access payment/subscription features
    const isSuperAdmin = currentUser?.email.toLowerCase() === SUPERADMIN_EMAIL;
    
    if (!currentUser || !isSuperAdmin) {
      return [];
    }

    const orgs = await ctx.db.query("organizations").collect();

    // Enrich with employee counts
    return await Promise.all(
      orgs.map(async (org) => {
        const employees = await ctx.db
          .query("users")
          .withIndex("by_org", (q) => q.eq("organizationId", org._id))
          .collect();

        return {
          ...org,
          employeeCount: employees.length,
        };
      })
    );
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// SUPERADMIN: Get all organizations
// ─────────────────────────────────────────────────────────────────────────────
export const getAllOrganizations = query({
  args: {},
  handler: async (ctx) => {
    // Get current user from Convex Auth
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    
    const caller = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();
    
    if (!caller || caller.email.toLowerCase() !== SUPERADMIN_EMAIL) {
      throw new Error("Superadmin only");
    }

    const orgs = await ctx.db.query("organizations").collect();

    // Enrich with employee counts and admin info
    return await Promise.all(
      orgs.map(async (org) => {
        const employees = await ctx.db
          .query("users")
          .withIndex("by_org", (q) => q.eq("organizationId", org._id))
          .collect();

        const admins = employees.filter((u) => u.role === "admin");
        const activeCount = employees.filter((u) => u.isActive && u.isApproved).length;

        return {
          ...org,
          totalEmployees: employees.length,
          activeEmployees: activeCount,
          adminNames: admins.map((a) => a.name),
        };
      })
    );
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// SUPERADMIN: Update organization plan / settings
// ─────────────────────────────────────────────────────────────────────────────
export const updateOrganization = mutation({
  args: {
    superadminUserId: v.id("users"),
    organizationId: v.id("organizations"),
    name: v.optional(v.string()),
    plan: v.optional(v.union(v.literal("starter"), v.literal("professional"), v.literal("enterprise"))),
    isActive: v.optional(v.boolean()),
    timezone: v.optional(v.string()),
    country: v.optional(v.string()),
    industry: v.optional(v.string()),
  },
  handler: async (ctx, { superadminUserId, organizationId, ...updates }) => {
    const caller = await ctx.db.get(superadminUserId);
    if (!caller || caller.email.toLowerCase() !== SUPERADMIN_EMAIL) {
      throw new Error("Only the superadmin can update organizations");
    }

    const patch: Record<string, unknown> = { ...updates, updatedAt: Date.now() };
    if (updates.plan) {
      patch.employeeLimit = PLAN_EMPLOYEE_LIMITS[updates.plan];
    }

    await ctx.db.patch(organizationId, patch);
    return organizationId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// SUPERADMIN: Assign first admin to an organization
// ─────────────────────────────────────────────────────────────────────────────
export const assignOrgAdmin = mutation({
  args: {
    superadminUserId: v.id("users"),
    userId: v.id("users"),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, { superadminUserId, userId, organizationId }) => {
    const caller = await ctx.db.get(superadminUserId);
    if (!caller || caller.email.toLowerCase() !== SUPERADMIN_EMAIL) {
      throw new Error("Only the superadmin can assign org admins");
    }

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    await ctx.db.patch(userId, {
      organizationId,
      role: "admin",
      isApproved: true,
      approvedAt: Date.now(),
    });

    return userId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: Search organizations by name/slug (for registration)
// ─────────────────────────────────────────────────────────────────────────────
export const searchOrganizations = query({
  args: { query: v.string() },
  handler: async (ctx, { query: searchQuery }) => {
    if (!searchQuery || searchQuery.trim().length < 2) return [];

    const q = searchQuery.toLowerCase().trim();

    // Try exact slug match first
    const bySlug = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (qb) => qb.eq("slug", q))
      .collect();

    // Get all active orgs and filter by name
    const all = await ctx.db
      .query("organizations")
      .withIndex("by_active", (qb) => qb.eq("isActive", true))
      .collect();

    const byName = all.filter(
      (org) =>
        org.name.toLowerCase().includes(q) ||
        org.slug.includes(q)
    );

    // Merge and deduplicate
    const merged = [...bySlug, ...byName];
    const seen = new Set<string>();
    const result = merged.filter((org) => {
      if (seen.has(org._id)) return false;
      seen.add(org._id);
      return org.isActive;
    });

    // Return only safe public fields
    return result.slice(0, 5).map((org) => ({
      _id: org._id,
      name: org.name,
      slug: org.slug,
      industry: org.industry,
      plan: org.plan,
    }));
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: Get organization by slug (for join flow)
// ─────────────────────────────────────────────────────────────────────────────
export const getOrganizationBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", slug.toLowerCase()))
      .unique();

    if (!org || !org.isActive) return null;

    return {
      _id: org._id,
      name: org.name,
      slug: org.slug,
      industry: org.industry,
      plan: org.plan,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEE: Submit a join request to an organization
// ─────────────────────────────────────────────────────────────────────────────
export const requestToJoinOrganization = mutation({
  args: {
    organizationId: v.id("organizations"),
    requestedByEmail: v.string(),
    requestedByName: v.string(),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);
    if (!org || !org.isActive) throw new Error("Organization not found or inactive");

    // Check for duplicate pending request from same email
    const existing = await ctx.db
      .query("organizationInvites")
      .withIndex("by_email", (q) => q.eq("requestedByEmail", args.requestedByEmail))
      .collect();

    const alreadyPending = existing.find(
      (inv) => inv.organizationId === args.organizationId && inv.status === "pending"
    );
    if (alreadyPending) throw new Error("You already have a pending request for this organization");

    // Check if user already belongs to this org
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.requestedByEmail))
      .unique();
    if (existingUser && existingUser.organizationId === args.organizationId) {
      throw new Error("You are already a member of this organization");
    }

    const inviteId = await ctx.db.insert("organizationInvites", {
      organizationId: args.organizationId,
      requestedByEmail: args.requestedByEmail,
      requestedByName: args.requestedByName,
      requestedAt: Date.now(),
      status: "pending",
      createdAt: Date.now(),
    });

    // Notify all org admins
    const admins = await ctx.db
      .query("users")
      .withIndex("by_org_role", (q) =>
        q.eq("organizationId", args.organizationId).eq("role", "admin")
      )
      .collect();

    for (const admin of admins) {
      await ctx.db.insert("notifications", {
        organizationId: args.organizationId,
        userId: admin._id,
        type: "join_request",
        title: "🙋 New Join Request",
        message: `${args.requestedByName} (${args.requestedByEmail}) wants to join ${org.name}.`,
        isRead: false,
        relatedId: inviteId,
        createdAt: Date.now(),
      });
    }

    return inviteId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// ORG ADMIN: Get all pending join requests for their org
// ─────────────────────────────────────────────────────────────────────────────
export const getJoinRequests = query({
  args: {
    adminId: v.id("users"),
    status: v.optional(v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"))),
  },
  handler: async (ctx, { adminId, status }) => {
    const admin = await ctx.db.get(adminId);
    if (!admin || (admin.role !== "admin" && admin.email.toLowerCase() !== SUPERADMIN_EMAIL)) {
      throw new Error("Only org admins can view join requests");
    }

    if (!admin.organizationId) {
      throw new Error("Admin must belong to an organization");
    }
    
    const orgId = admin.organizationId; // Already checked for null above

    let invites;

    if (status) {
      invites = await ctx.db
        .query("organizationInvites")
        .withIndex("by_org_status", (q) => q.eq("organizationId", orgId).eq("status", status))
        .order("desc")
        .collect();
    } else {
      invites = await ctx.db
        .query("organizationInvites")
        .withIndex("by_org", (q) => q.eq("organizationId", orgId))
        .order("desc")
        .collect();
    }

    return invites;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// ORG ADMIN: Approve a join request → create user account
// ─────────────────────────────────────────────────────────────────────────────
export const approveJoinRequest = mutation({
  args: {
    adminId: v.id("users"),
    inviteId: v.id("organizationInvites"),
    role: v.union(v.literal("employee"), v.literal("supervisor")),
    department: v.optional(v.string()),
    position: v.optional(v.string()),
    passwordHash: v.string(), // admin sets temp password; user changes on first login
  },
  handler: async (ctx, args) => {
    const admin = await ctx.db.get(args.adminId);
    if (!admin || (admin.role !== "admin" && admin.email.toLowerCase() !== SUPERADMIN_EMAIL)) {
      throw new Error("Only org admins can approve join requests");
    }

    const invite = await ctx.db.get(args.inviteId);
    if (!invite) throw new Error("Invite not found");
    if (invite.status !== "pending") throw new Error("This request has already been reviewed");
    
    if (!admin.organizationId) {
      throw new Error("Admin must belong to an organization");
    }
    
    if (invite.organizationId !== admin.organizationId) {
      throw new Error("This request belongs to a different organization");
    }

    // Check employee limit
    const org = await ctx.db.get(invite.organizationId);
    if (!org) throw new Error("Organization not found");

    const currentCount = await ctx.db
      .query("users")
      .withIndex("by_org_active", (q) =>
        q.eq("organizationId", invite.organizationId).eq("isActive", true)
      )
      .collect();

    if (currentCount.length >= org.employeeLimit) {
      throw new Error(
        `Employee limit reached (${org.employeeLimit}). Upgrade your plan to add more employees.`
      );
    }

    // Create user account
    const userId = await ctx.db.insert("users", {
      organizationId: invite.organizationId,
      name: invite.requestedByName,
      email: invite.requestedByEmail,
      passwordHash: args.passwordHash,
      role: args.role,
      employeeType: "staff",
      department: args.department,
      position: args.position,
      isActive: true,
      isApproved: true,
      approvedBy: args.adminId,
      approvedAt: Date.now(),
      travelAllowance: 20000,
      paidLeaveBalance: 24,
      sickLeaveBalance: 10,
      familyLeaveBalance: 5,
      createdAt: Date.now(),
    });

    // Update invite record
    await ctx.db.patch(args.inviteId, {
      status: "approved",
      reviewedBy: args.adminId,
      reviewedAt: Date.now(),
      userId,
    });

    // Notify the requester (they need to log in now)
    // We can't notify by userId yet since account was just created — 
    // notify via the newly created userId
    await ctx.db.insert("notifications", {
      organizationId: invite.organizationId,
      userId,
      type: "join_approved",
      title: "✅ Welcome to " + org.name + "!",
      message: `Your request to join ${org.name} has been approved by ${admin.name}. You can now log in.`,
      isRead: false,
      relatedId: args.inviteId,
      createdAt: Date.now(),
    });

    return { userId, inviteId: args.inviteId };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// ORG ADMIN: Reject a join request
// ─────────────────────────────────────────────────────────────────────────────
export const rejectJoinRequest = mutation({
  args: {
    adminId: v.id("users"),
    inviteId: v.id("organizationInvites"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await ctx.db.get(args.adminId);
    if (!admin || (admin.role !== "admin" && admin.email.toLowerCase() !== SUPERADMIN_EMAIL)) {
      throw new Error("Only org admins can reject join requests");
    }

    const invite = await ctx.db.get(args.inviteId);
    if (!invite) throw new Error("Invite not found");
    if (invite.status !== "pending") throw new Error("This request has already been reviewed");
    
    if (!admin.organizationId) {
      throw new Error("Admin must belong to an organization");
    }
    
    if (invite.organizationId !== admin.organizationId) {
      throw new Error("This request belongs to a different organization");
    }

    await ctx.db.patch(args.inviteId, {
      status: "rejected",
      reviewedBy: args.adminId,
      reviewedAt: Date.now(),
      rejectionReason: args.reason,
    });

    return args.inviteId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// ORG ADMIN: Generate an invite link token
// ─────────────────────────────────────────────────────────────────────────────
export const generateInviteToken = mutation({
  args: {
    adminId: v.id("users"),
    inviteEmail: v.optional(v.string()),
    expiryHours: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const admin = await ctx.db.get(args.adminId);
    if (!admin || (admin.role !== "admin" && admin.email.toLowerCase() !== SUPERADMIN_EMAIL)) {
      throw new Error("Only org admins can generate invite links");
    }

    // Generate a secure random token
    const token = Array.from({ length: 32 }, () =>
      Math.random().toString(36).charAt(2)
    ).join("");

    const expiryHours = args.expiryHours ?? 72;
    const expiry = Date.now() + expiryHours * 60 * 60 * 1000;

    if (!admin.organizationId) {
      throw new Error("Admin must belong to an organization");
    }

    const inviteId = await ctx.db.insert("organizationInvites", {
      organizationId: admin.organizationId,
      requestedByEmail: args.inviteEmail ?? "",
      requestedByName: "",
      requestedAt: Date.now(),
      status: "pending",
      inviteToken: token,
      inviteEmail: args.inviteEmail,
      inviteExpiry: expiry,
      createdAt: Date.now(),
    });

    return { token, inviteId, expiresAt: expiry };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: Validate invite token (used during registration)
// ─────────────────────────────────────────────────────────────────────────────
export const validateInviteToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const invite = await ctx.db
      .query("organizationInvites")
      .withIndex("by_token", (q) => q.eq("inviteToken", token))
      .unique();

    if (!invite) return { valid: false, reason: "Token not found" };
    if (invite.status === "approved") return { valid: false, reason: "Already used" };
    if (invite.inviteExpiry && invite.inviteExpiry < Date.now()) {
      return { valid: false, reason: "Token expired" };
    }

    const org = await ctx.db.get(invite.organizationId);
    if (!org || !org.isActive) return { valid: false, reason: "Organization inactive" };

    return {
      valid: true,
      organizationId: invite.organizationId,
      organizationName: org.name,
      organizationSlug: org.slug,
      prefilledEmail: invite.inviteEmail,
      inviteId: invite._id,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Get organization details (for logged-in users)
// ─────────────────────────────────────────────────────────────────────────────
export const getMyOrganization = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user || !user.organizationId) return null;

    const org = await ctx.db.get(user.organizationId);
    return org;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Get pending join request count for org admin badge
// ─────────────────────────────────────────────────────────────────────────────
export const getPendingJoinRequestCount = query({
  args: { adminId: v.id("users") },
  handler: async (ctx, { adminId }) => {
    const admin = await ctx.db.get(adminId);
    if (!admin || admin.role !== "admin") return 0;
    if (!admin.organizationId) return 0;

    const orgId = admin.organizationId; // Already checked for null above

    const pending = await ctx.db
      .query("organizationInvites")
      .withIndex("by_org_status", (q) =>
        q.eq("organizationId", orgId).eq("status", "pending")
      )
      .collect();

    return pending.length;
  },
});
