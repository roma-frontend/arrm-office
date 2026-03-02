import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ── Security helpers ──────────────────────────────────────────────────────────
const SUPERADMIN_EMAIL = "romangulanyan@gmail.com";

/** Verify caller has admin/superadmin role and return their organizationId */
async function requireAdmin(ctx: { db: { get: (id: unknown) => Promise<unknown> } }, adminId: string) {
  const admin = await (ctx.db as { get: (id: string) => Promise<{ role: string; organizationId: string; email: string } | null> }).get(adminId);
  if (!admin) throw new Error("Admin not found");
  if (admin.role !== "admin" && admin.role !== "superadmin") {
    throw new Error("Only org admins can perform this action");
  }
  return admin;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET ALL USERS — scoped to caller's organization
// ─────────────────────────────────────────────────────────────────────────────
export const getAllUsers = query({
  args: { requesterId: v.id("users") },
  handler: async (ctx, { requesterId }) => {
    const requester = await ctx.db.get(requesterId);
    if (!requester) throw new Error("Requester not found");

    // Superadmin sees all users across all orgs (with org info)
    if (requester.email.toLowerCase() === SUPERADMIN_EMAIL) {
      return await ctx.db.query("users").collect();
    }

    // Everyone else only sees their organization
    if (!requester.organizationId) {
      throw new Error("User does not belong to an organization");
    }

    return await ctx.db
      .query("users")
      .withIndex("by_org", (q) => q.eq("organizationId", requester.organizationId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET CURRENT USER — for client-side auth state
// ─────────────────────────────────────────────────────────────────────────────
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) return null;
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();
    
    return user;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// CREATE OAUTH USER — for Google OAuth sign in
// ─────────────────────────────────────────────────────────────────────────────
export const createOAuthUser = mutation({
  args: {
    email: v.string(),
    name: v.string(),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, { email, name, avatarUrl }) => {
    const emailLower = email.toLowerCase().trim();
    
    // Check if user already exists
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", emailLower))
      .first();
    
    if (existing) {
      // Update avatar if provided
      if (avatarUrl && !existing.avatarUrl) {
        await ctx.db.patch(existing._id, { avatarUrl, updatedAt: Date.now() });
      }
      return existing._id;
    }
    
    // For new OAuth users, check if they are superadmin
    const isSuperAdmin = emailLower === SUPERADMIN_EMAIL;
    
    // Get first organization or create error
    const allOrgs = await ctx.db.query("organizations").collect();
    
    if (allOrgs.length === 0) {
      throw new Error("No organization found. Please create an organization first.");
    }
    
    const organizationId = allOrgs[0]._id;
    
    // Create new OAuth user
    const userId = await ctx.db.insert("users", {
      organizationId,
      name,
      email: emailLower,
      passwordHash: "", // OAuth users don't have password
      role: isSuperAdmin ? "superadmin" : "employee",
      employeeType: "full_time",
      department: isSuperAdmin ? "Management" : undefined,
      position: isSuperAdmin ? "Administrator" : undefined,
      isActive: true,
      isApproved: isSuperAdmin, // Superadmin auto-approved
      approvedAt: isSuperAdmin ? Date.now() : undefined,
      travelAllowance: 20000,
      paidLeaveBalance: 24,
      sickLeaveBalance: 10,
      familyLeaveBalance: 5,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      avatarUrl,
    });
    
    return userId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET USER BY EMAIL — only within same org
// ─────────────────────────────────────────────────────────────────────────────
export const getUserByEmail = query({
  args: { email: v.string(), requesterId: v.optional(v.id("users")) },
  handler: async (ctx, { email, requesterId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email.toLowerCase()))
      .unique();

    if (!user) return null;

    // If requester provided, verify same org
    if (requesterId) {
      const requester = await ctx.db.get(requesterId);
      if (
        requester &&
        requester.organizationId !== user.organizationId &&
        requester.email.toLowerCase() !== SUPERADMIN_EMAIL
      ) {
        return null; // Cross-org access denied
      }
    }

    return user;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET USER BY ID — only within same org
// ─────────────────────────────────────────────────────────────────────────────
export const getUserById = query({
  args: { userId: v.id("users"), requesterId: v.optional(v.id("users")) },
  handler: async (ctx, { userId, requesterId }) => {
    const user = await ctx.db.get(userId);
    if (!user) return null;

    if (requesterId) {
      const requester = await ctx.db.get(requesterId);
      if (
        requester &&
        requester.organizationId !== user.organizationId &&
        requester.email.toLowerCase() !== SUPERADMIN_EMAIL
      ) {
        throw new Error("Access denied: cross-organization access is not allowed");
      }
    }

    return user;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// CREATE USER (admin only) — auto-scoped to admin's org
// ─────────────────────────────────────────────────────────────────────────────
export const createUser = mutation({
  args: {
    adminId: v.id("users"),
    name: v.string(),
    email: v.string(),
    passwordHash: v.string(),
    role: v.union(v.literal("admin"), v.literal("supervisor"), v.literal("employee")),
    employeeType: v.union(v.literal("staff"), v.literal("contractor")),
    department: v.optional(v.string()),
    position: v.optional(v.string()),
    phone: v.optional(v.string()),
    supervisorId: v.optional(v.id("users")),
  },
  handler: async (ctx, { adminId, ...args }) => {
    const admin = await ctx.db.get(adminId);
    if (!admin || (admin.role !== "admin" && admin.email.toLowerCase() !== SUPERADMIN_EMAIL)) {
      throw new Error("Only org admins can create users");
    }

    const email = args.email.toLowerCase().trim();

    // Check email uniqueness globally
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (existing) throw new Error("A user with this email already exists");

    // Check employee limit for this org
    const orgId = admin.organizationId;
    if (!orgId) throw new Error("Admin must belong to an organization");
    
    const org = await ctx.db.get(orgId);
    if (!org) throw new Error("Organization not found");

    const currentCount = await ctx.db
      .query("users")
      .withIndex("by_org_active", (q) =>
        q.eq("organizationId", orgId).eq("isActive", true)
      )
      .collect();

    if (currentCount.length >= org.employeeLimit) {
      throw new Error(
        `Employee limit reached (${org.employeeLimit}). Upgrade your plan to add more employees.`
      );
    }

    const travelAllowance = args.employeeType === "contractor" ? 12000 : 20000;

    const userId = await ctx.db.insert("users", {
      organizationId: orgId, // ← always scoped to admin's org
      name: args.name,
      email,
      passwordHash: args.passwordHash,
      role: args.role,
      employeeType: args.employeeType,
      department: args.department,
      position: args.position,
      phone: args.phone,
      supervisorId: args.supervisorId,
      isActive: true,
      isApproved: true,
      approvedBy: adminId,
      approvedAt: Date.now(),
      travelAllowance,
      paidLeaveBalance: 24,
      sickLeaveBalance: 10,
      familyLeaveBalance: 5,
      createdAt: Date.now(),
    });

    // Notify org admins (within same org)
    const admins = await ctx.db
      .query("users")
      .withIndex("by_org_role", (q) =>
        q.eq("organizationId", orgId).eq("role", "admin")
      )
      .collect();

    for (const a of admins) {
      await ctx.db.insert("notifications", {
        organizationId: admin.organizationId,
        userId: a._id,
        type: "employee_added",
        title: "👤 New Employee Added",
        message: `${args.name} (${args.role}) has been added to ${org.name}.`,
        isRead: false,
        relatedId: userId,
        createdAt: Date.now(),
      });
    }

    return userId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE USER — only within same org
// ─────────────────────────────────────────────────────────────────────────────
export const updateUser = mutation({
  args: {
    adminId: v.id("users"),
    userId: v.id("users"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    role: v.optional(v.union(v.literal("admin"), v.literal("supervisor"), v.literal("employee"))),
    employeeType: v.optional(v.union(v.literal("staff"), v.literal("contractor"))),
    department: v.optional(v.string()),
    position: v.optional(v.string()),
    phone: v.optional(v.string()),
    location: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    supervisorId: v.optional(v.id("users")),
    isActive: v.optional(v.boolean()),
    paidLeaveBalance: v.optional(v.number()),
    sickLeaveBalance: v.optional(v.number()),
    familyLeaveBalance: v.optional(v.number()),
  },
  handler: async (ctx, { adminId, userId, ...updates }) => {
    const admin = await ctx.db.get(adminId);
    if (!admin || (admin.role !== "admin" && admin.email.toLowerCase() !== SUPERADMIN_EMAIL)) {
      throw new Error("Only org admins can update users");
    }

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    // Verify same organization
    if (
      admin.organizationId !== user.organizationId &&
      admin.email.toLowerCase() !== SUPERADMIN_EMAIL
    ) {
      throw new Error("Access denied: cannot update users from another organization");
    }

    const employeeType = updates.employeeType ?? user.employeeType;
    const travelAllowance = employeeType === "contractor" ? 12000 : 20000;

    await ctx.db.patch(userId, { ...updates, travelAllowance });
    return userId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE USER — soft delete, only within same org
// ─────────────────────────────────────────────────────────────────────────────
export const deleteUser = mutation({
  args: {
    adminId: v.id("users"),
    userId: v.id("users"),
  },
  handler: async (ctx, { adminId, userId }) => {
    const admin = await ctx.db.get(adminId);
    if (!admin || (admin.role !== "admin" && admin.email.toLowerCase() !== SUPERADMIN_EMAIL)) {
      throw new Error("Only org admins can delete users");
    }

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    // Cross-org protection
    if (
      admin.organizationId !== user.organizationId &&
      admin.email.toLowerCase() !== SUPERADMIN_EMAIL
    ) {
      throw new Error("Access denied: cannot delete users from another organization");
    }

    if (user.role === "admin" && user.email.toLowerCase() === admin.email.toLowerCase()) {
      throw new Error("Cannot delete your own admin account");
    }

    await ctx.db.patch(userId, { isActive: false });
    return userId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET SUPERVISORS — scoped to org
// ─────────────────────────────────────────────────────────────────────────────
export const getSupervisors = query({
  args: { requesterId: v.id("users") },
  handler: async (ctx, { requesterId }) => {
    const requester = await ctx.db.get(requesterId);
    if (!requester) throw new Error("Not found");

    // Superadmin sees all supervisors/admins across all orgs
    if (requester.email.toLowerCase() === SUPERADMIN_EMAIL) {
      const allUsers = await ctx.db.query("users").collect();
      return allUsers.filter(u => 
        u.isActive && (u.role === "supervisor" || u.role === "admin" || u.role === "superadmin")
      );
    }

    const orgId = requester.organizationId;
    if (!orgId) return [];

    const supervisors = await ctx.db
      .query("users")
      .withIndex("by_org_role", (q) => q.eq("organizationId", orgId).eq("role", "supervisor"))
      .collect();

    const admins = await ctx.db
      .query("users")
      .withIndex("by_org_role", (q) => q.eq("organizationId", orgId).eq("role", "admin"))
      .collect();

    return [...supervisors, ...admins].filter((u) => u.isActive);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// APPROVE USER — scoped to org
// ─────────────────────────────────────────────────────────────────────────────
export const approveUser = mutation({
  args: {
    adminId: v.id("users"),
    userId: v.id("users"),
  },
  handler: async (ctx, { adminId, userId }) => {
    const admin = await ctx.db.get(adminId);
    if (!admin || (admin.role !== "admin" && admin.email.toLowerCase() !== SUPERADMIN_EMAIL)) {
      throw new Error("Only org admins can approve users");
    }

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    if (
      admin.organizationId !== user.organizationId &&
      admin.email.toLowerCase() !== SUPERADMIN_EMAIL
    ) {
      throw new Error("Access denied: cross-organization operation");
    }

    if (user.isApproved) throw new Error("User already approved");

    let org = null;
    if (user.organizationId) {
      org = await ctx.db.get(user.organizationId);
    }

    await ctx.db.patch(userId, {
      isApproved: true,
      approvedBy: adminId,
      approvedAt: Date.now(),
    });

    await ctx.db.insert("notifications", {
      organizationId: user.organizationId,
      userId,
      type: "join_approved",
      title: "✅ Account Approved",
      message: `Your account has been approved by ${admin.name}. Welcome to ${org?.name ?? "the team"}!`,
      isRead: false,
      createdAt: Date.now(),
    });

    return userId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// REJECT USER — scoped to org
// ─────────────────────────────────────────────────────────────────────────────
export const rejectUser = mutation({
  args: {
    adminId: v.id("users"),
    userId: v.id("users"),
  },
  handler: async (ctx, { adminId, userId }) => {
    const admin = await ctx.db.get(adminId);
    if (!admin || (admin.role !== "admin" && admin.email.toLowerCase() !== SUPERADMIN_EMAIL)) {
      throw new Error("Only org admins can reject users");
    }

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    if (
      admin.organizationId !== user.organizationId &&
      admin.email.toLowerCase() !== SUPERADMIN_EMAIL
    ) {
      throw new Error("Access denied: cross-organization operation");
    }

    await ctx.db.delete(userId);
    return userId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET PENDING APPROVAL USERS — scoped to org
// ─────────────────────────────────────────────────────────────────────────────
export const getPendingApprovalUsers = query({
  args: { adminId: v.id("users") },
  handler: async (ctx, { adminId }) => {
    const admin = await ctx.db.get(adminId);
    if (!admin || (admin.role !== "admin" && admin.email.toLowerCase() !== SUPERADMIN_EMAIL)) {
      throw new Error("Only org admins can view pending users");
    }

    // Superadmin sees all pending users across all orgs
    if (admin.email.toLowerCase() === SUPERADMIN_EMAIL) {
      const allUsers = await ctx.db.query("users").collect();
      return allUsers.filter(u => !u.isApproved);
    }

    if (!admin.organizationId) return [];

    return await ctx.db
      .query("users")
      .withIndex("by_org_approval", (q) =>
        q.eq("organizationId", admin.organizationId).eq("isApproved", false)
      )
      .collect();
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT LOG — scoped to org
// ─────────────────────────────────────────────────────────────────────────────
export const logAudit = mutation({
  args: {
    userId: v.id("users"),
    action: v.string(),
    target: v.optional(v.string()),
    details: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    await ctx.db.insert("auditLogs", {
      organizationId: user.organizationId,
      userId: args.userId,
      action: args.action,
      target: args.target,
      details: args.details,
      createdAt: Date.now(),
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET AUDIT LOGS — scoped to org
// ─────────────────────────────────────────────────────────────────────────────
export const getAuditLogs = query({
  args: { adminId: v.id("users") },
  handler: async (ctx, { adminId }) => {
    const admin = await ctx.db.get(adminId);
    if (!admin || (admin.role !== "admin" && admin.email.toLowerCase() !== SUPERADMIN_EMAIL)) {
      throw new Error("Only org admins can view audit logs");
    }

    return await ctx.db
      .query("auditLogs")
      .withIndex("by_org", (q) => q.eq("organizationId", admin.organizationId))
      .order("desc")
      .take(200);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE PRESENCE STATUS
// ─────────────────────────────────────────────────────────────────────────────
export const updatePresenceStatus = mutation({
  args: {
    userId: v.id("users"),
    status: v.union(
      v.literal("available"),
      v.literal("in_meeting"),
      v.literal("in_call"),
      v.literal("out_of_office"),
      v.literal("busy"),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { presenceStatus: args.status });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE AVATAR
// ─────────────────────────────────────────────────────────────────────────────
export const updateAvatar = mutation({
  args: { userId: v.id("users"), avatarUrl: v.string() },
  handler: async (ctx, { userId, avatarUrl }) => {
    await ctx.db.patch(userId, { avatarUrl });
    return userId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE SESSION
// ─────────────────────────────────────────────────────────────────────────────
export const updateSession = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    sessionExpiry: v.number(),
  },
  handler: async (ctx, { userId, sessionToken, sessionExpiry }) => {
    await ctx.db.patch(userId, {
      sessionToken,
      sessionExpiry,
      lastLoginAt: Date.now(),
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// CLEAR SESSION
// ─────────────────────────────────────────────────────────────────────────────
export const clearSession = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await ctx.db.patch(userId, {
      sessionToken: undefined,
      sessionExpiry: undefined,
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// WEBAUTHN helpers
// ─────────────────────────────────────────────────────────────────────────────
export const setWebauthnChallenge = mutation({
  args: { userId: v.id("users"), challenge: v.string() },
  handler: async (ctx, { userId, challenge }) => {
    await ctx.db.patch(userId, { webauthnChallenge: challenge });
  },
});

export const getWebauthnCredentials = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("webauthnCredentials")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const addWebauthnCredential = mutation({
  args: {
    userId: v.id("users"),
    credentialId: v.string(),
    publicKey: v.string(),
    counter: v.number(),
    deviceName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("webauthnCredentials", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const updateWebauthnCounter = mutation({
  args: { credentialId: v.string(), counter: v.number() },
  handler: async (ctx, { credentialId, counter }) => {
    const cred = await ctx.db
      .query("webauthnCredentials")
      .withIndex("by_credential_id", (q) => q.eq("credentialId", credentialId))
      .unique();
    if (!cred) throw new Error("Credential not found");
    await ctx.db.patch(cred._id, { counter, lastUsedAt: Date.now() });
  },
});

export const getWebauthnCredential = query({
  args: { credentialId: v.string() },
  handler: async (ctx, { credentialId }) => {
    return await ctx.db
      .query("webauthnCredentials")
      .withIndex("by_credential_id", (q) => q.eq("credentialId", credentialId))
      .unique();
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// SEED ADMIN (bootstrap — creates first superadmin)
// ─────────────────────────────────────────────────────────────────────────────
export const seedAdmin = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    passwordHash: v.string(),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, { name, email, passwordHash, organizationId }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email.toLowerCase()))
      .unique();
    if (existing) return existing._id;

    return await ctx.db.insert("users", {
      organizationId,
      name,
      email: email.toLowerCase(),
      passwordHash,
      role: email.toLowerCase() === SUPERADMIN_EMAIL ? "superadmin" : "admin",
      employeeType: "staff",
      department: "Management",
      position: "Administrator",
      isActive: true,
      isApproved: true,
      approvedAt: Date.now(),
      travelAllowance: 20000,
      paidLeaveBalance: 24,
      sickLeaveBalance: 10,
      familyLeaveBalance: 5,
      createdAt: Date.now(),
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE OWN PROFILE (users can update their own profile without admin)
// ─────────────────────────────────────────────────────────────────────────────
export const updateOwnProfile = mutation({
  args: {
    userId: v.id("users"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    location: v.optional(v.string()),
    // Productivity Settings
    focusModeEnabled: v.optional(v.boolean()),
    workHoursStart: v.optional(v.string()),
    workHoursEnd: v.optional(v.string()),
    breakRemindersEnabled: v.optional(v.boolean()),
    breakInterval: v.optional(v.number()),
    dailyTaskGoal: v.optional(v.number()),
    // Localization Settings
    language: v.optional(v.string()),
    timezone: v.optional(v.string()),
    dateFormat: v.optional(v.string()),
    timeFormat: v.optional(v.string()),
    firstDayOfWeek: v.optional(v.string()),
    // Dashboard Settings
    defaultView: v.optional(v.string()),
    dataRefreshRate: v.optional(v.string()),
    compactMode: v.optional(v.boolean()),
  },
  handler: async (ctx, { userId, ...updates }) => {
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    
    await ctx.db.patch(userId, updates);
    return userId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE AVATAR
// ─────────────────────────────────────────────────────────────────────────────
export const deleteAvatar = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    
    // Remove avatar URL from database
    await ctx.db.patch(userId, { 
      avatarUrl: undefined 
    });
    
    return userId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// MIGRATE FACE TO AVATAR (utility)
// ─────────────────────────────────────────────────────────────────────────────
export const migrateFaceToAvatar = mutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    let count = 0;
    for (const user of users) {
      if (!user.avatarUrl && user.faceImageUrl) {
        await ctx.db.patch(user._id, { avatarUrl: user.faceImageUrl });
        count++;
      }
    }
    return { migrated: count };
  },
});

// List all users - SCOPED TO ORGANIZATION (admin sees only their org, superadmin sees all)
export const listAll = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();
    
    if (!currentUser) return [];
    
    // Superadmin sees all users across all organizations
    if (currentUser.email.toLowerCase() === SUPERADMIN_EMAIL) {
      return await ctx.db.query("users").collect();
    }
    
    // Admin sees only users from their organization
    if (currentUser.role === "admin") {
      if (!currentUser.organizationId) return [];
      
      return await ctx.db
        .query("users")
        .withIndex("by_org", (q) => q.eq("organizationId", currentUser.organizationId))
        .collect();
    }
    
    return [];
  },
});
