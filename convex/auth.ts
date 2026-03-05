import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ── Constants ────────────────────────────────────────────────────────────────
const SUPERADMIN_EMAIL = "romangulanyan@gmail.com";

// ── Helper: build safe user return object ────────────────────────────────────
function safeUser(user: {
  _id: string;
  name: string;
  email: string;
  role: string;
  organizationId: string;
  department?: string;
  position?: string;
  employeeType: string;
  avatarUrl?: string;
  travelAllowance: number;
  isApproved: boolean;
}) {
  return {
    userId: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
    department: user.department,
    position: user.position,
    employeeType: user.employeeType,
    avatarUrl: user.avatarUrl,
    travelAllowance: user.travelAllowance,
    isApproved: user.isApproved,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// REGISTER — two paths:
//   1. Superadmin email → role=superadmin, no org needed (org assigned later)
//   2. Everyone else → must provide organizationId (join existing) or create new
// ─────────────────────────────────────────────────────────────────────────────
export const register = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    password: v.string(),           // actually a hash from client
    phone: v.optional(v.string()),
    // Multi-tenant fields
    organizationId: v.optional(v.id("organizations")),   // join existing org
    inviteToken: v.optional(v.string()),                 // from invite link
    // Superadmin-only: create first org
    createOrgName: v.optional(v.string()),
    createOrgSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();
    const isSuperadmin = email === SUPERADMIN_EMAIL;

    // ── 1. Check email not already registered ──────────────────────────────
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (existing) throw new Error("Email already registered");

    // ── 2. Resolve organization ────────────────────────────────────────────
    let organizationId = args.organizationId;
    let isApproved = false;
    let role: "superadmin" | "admin" | "employee" | "supervisor" = "employee";

    if (isSuperadmin) {
      // Superadmin path: create a special "platform" org or join first org
      role = "superadmin";
      isApproved = true;

      // Superadmin must have an org (even a virtual one) — find or create
      const allOrgs = await ctx.db.query("organizations").collect();
      if (allOrgs.length === 0) {
        // Bootstrap: create the first platform organization
        if (!args.createOrgName || !args.createOrgSlug) {
          throw new Error("First registration requires organization name and slug");
        }
        const slug = args.createOrgSlug
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "");

        organizationId = await ctx.db.insert("organizations", {
          name: args.createOrgName,
          slug,
          plan: "enterprise",
          isActive: true,
          createdBySuperadmin: true,
          timezone: "UTC",
          employeeLimit: 999999,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      } else {
        // Superadmin joins the first org by default
        organizationId = allOrgs[0]._id;
      }
    } else {
      // Regular user path
      if (!organizationId && !args.inviteToken) {
        throw new Error("Please select an organization to join");
      }

      // Validate invite token if provided
      if (args.inviteToken) {
        const invite = await ctx.db
          .query("organizationInvites")
          .withIndex("by_token", (q) => q.eq("inviteToken", args.inviteToken!))
          .unique();

        if (!invite) throw new Error("Invalid invite link");
        if (invite.status === "approved") throw new Error("This invite link has already been used");
        if (invite.inviteExpiry && invite.inviteExpiry < Date.now()) {
          throw new Error("This invite link has expired");
        }

        organizationId = invite.organizationId;

        // Mark invite as used
        await ctx.db.patch(invite._id, {
          status: "approved",
          requestedByEmail: email,
          requestedByName: args.name,
          reviewedAt: Date.now(),
        });

        // Invited users are auto-approved
        isApproved = true;
      }

      if (!organizationId) throw new Error("Organization not found");

      // Verify org exists and is active
      const org = await ctx.db.get(organizationId);
      if (!org || !org.isActive) throw new Error("Organization is inactive or not found");

      // Check employee limit
      const currentMembers = await ctx.db
        .query("users")
        .withIndex("by_org_active", (q) =>
          q.eq("organizationId", organizationId!).eq("isActive", true)
        )
        .collect();
      if (isApproved && currentMembers.length >= org.employeeLimit) {
        throw new Error(
          `This organization has reached its employee limit (${org.employeeLimit}). Contact your administrator.`
        );
      }

      // Check if first member of the org → becomes admin
      const orgMembers = await ctx.db
        .query("users")
        .withIndex("by_org", (q) => q.eq("organizationId", organizationId!))
        .collect();

      if (orgMembers.length === 0) {
        // First person in org → auto-admin, auto-approved
        role = "admin";
        isApproved = true;
      }
    }

    if (!organizationId) throw new Error("Could not resolve organization");

    // ── 3. Create user ─────────────────────────────────────────────────────
    const userId = await ctx.db.insert("users", {
      organizationId,
      name: args.name,
      email,
      passwordHash: args.password,
      phone: args.phone,
      role,
      employeeType: "staff",
      department: role === "admin" || isSuperadmin ? "Management" : undefined,
      position: role === "admin" || isSuperadmin ? "Administrator" : undefined,
      isActive: true,
      isApproved,
      approvedAt: isApproved ? Date.now() : undefined,
      travelAllowance: 20000,
      paidLeaveBalance: 24,
      sickLeaveBalance: 10,
      familyLeaveBalance: 5,
      createdAt: Date.now(),
    });

    // ── 4. Notify org admins if user needs approval ────────────────────────
    if (!isApproved) {
      const org = await ctx.db.get(organizationId);
      const admins = await ctx.db
        .query("users")
        .withIndex("by_org_role", (q) =>
          q.eq("organizationId", organizationId!).eq("role", "admin")
        )
        .collect();

      for (const admin of admins) {
        await ctx.db.insert("notifications", {
          organizationId,
          userId: admin._id,
          type: "join_request",
          title: "🙋 New Join Request",
          message: `${args.name} (${email}) wants to join ${org?.name ?? "your organization"}.`,
          isRead: false,
          relatedId: userId,
          createdAt: Date.now(),
        });
      }
    }

    return { userId, role, needsApproval: !isApproved, organizationId };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN — validates credentials + organizationId scoping
// ─────────────────────────────────────────────────────────────────────────────
export const login = mutation({
  args: {
    email: v.string(),
    password: v.string(),
    sessionToken: v.string(),
    sessionExpiry: v.number(),
    isFaceLogin: v.optional(v.boolean()),
  },
  handler: async (ctx, { email, password: passwordHash, sessionToken, sessionExpiry, isFaceLogin }) => {
    console.log('[auth:login] 🔐 Login attempt:', {
      email,
      isFaceLogin,
      hasPassword: !!passwordHash,
    });
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email.toLowerCase().trim()))
      .unique();

    if (!user) {
      console.log('[auth:login] ❌ User not found:', email);
      throw new Error("Invalid email or password");
    }
    
    console.log('[auth:login] 👤 Found user:', {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      isApproved: user.isApproved,
    });
    
    if (!user.isActive) throw new Error("Your account has been deactivated. Contact your administrator.");
    if (!user.isApproved) {
      throw new Error(
        "Your account is pending approval from your organization administrator. Please wait."
      );
    }
    
    // Skip password check for Face ID login
    if (!isFaceLogin && user.passwordHash !== passwordHash) {
      console.log('[auth:login] ❌ Password mismatch for:', email);
      throw new Error("Invalid email or password");
    }

    // Verify org is still active (skip for superadmins who don't have an org)
    let org = null;
    if (user.organizationId) {
      org = await ctx.db.get(user.organizationId);
      if (!org || !org.isActive) {
        throw new Error("Your organization account is inactive. Contact support.");
      }
    }

    await ctx.db.patch(user._id, {
      sessionToken,
      sessionExpiry,
      lastLoginAt: Date.now(),
    });

    const userData = safeUser(user as Parameters<typeof safeUser>[0]);
    
    console.log('[auth:login] ✅ Login successful, returning:', {
      userId: userData.userId,
      name: userData.name,
      email: userData.email,
      role: userData.role,
    });
    
    return {
      userId: userData.userId,
      name: userData.name,
      email: userData.email,
      role: userData.role,
      organizationId: userData.organizationId,
      department: userData.department,
      position: userData.position,
      employeeType: userData.employeeType,
      avatarUrl: userData.avatarUrl,
      travelAllowance: userData.travelAllowance,
      isApproved: userData.isApproved,
      organizationName: org?.name || null,
      organizationSlug: org?.slug || null,
      organizationPlan: org?.plan || null,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// LOGOUT
// ─────────────────────────────────────────────────────────────────────────────
export const logout = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await ctx.db.patch(userId, {
      sessionToken: undefined,
      sessionExpiry: undefined,
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// VERIFY SESSION — returns user + org info
// ─────────────────────────────────────────────────────────────────────────────
export const verifySession = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const users = await ctx.db.query("users").collect();
    const user = users.find((u) => u.sessionToken === sessionToken);
    if (!user) return null;
    if (user.sessionExpiry && user.sessionExpiry < Date.now()) return null;

    let org = null;
    if (user.organizationId) {
      org = await ctx.db.get(user.organizationId);
    }

    return {
      ...safeUser(user as Parameters<typeof safeUser>[0]),
      organizationName: org?.name,
      organizationSlug: org?.slug,
      organizationPlan: org?.plan,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET SESSION (alias)
// ─────────────────────────────────────────────────────────────────────────────
export const getSession = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const users = await ctx.db.query("users").collect();
    const user = users.find((u) => u.sessionToken === sessionToken);
    if (!user) return null;
    if (user.sessionExpiry && user.sessionExpiry < Date.now()) return null;

    let org = null;
    if (user.organizationId) {
      org = await ctx.db.get(user.organizationId);
    }

    return {
      userId: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      organizationName: org?.name,
      organizationSlug: org?.slug,
      organizationPlan: org?.plan,
      department: user.department,
      position: user.position,
      employeeType: user.employeeType,
      avatar: user.avatarUrl,
      travelAllowance: user.travelAllowance,
      isApproved: user.isApproved,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// REQUEST PASSWORD RESET
// ─────────────────────────────────────────────────────────────────────────────
export const requestPasswordReset = mutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email.toLowerCase().trim()))
      .unique();

    if (!user) return { success: true }; // prevent email enumeration

    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    const expiry = Date.now() + 60 * 60 * 1000; // 1 hour

    await ctx.db.patch(user._id, {
      resetPasswordToken: token,
      resetPasswordExpiry: expiry,
    });

    return { success: true, token, name: user.name, email: user.email };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// RESET PASSWORD
// ─────────────────────────────────────────────────────────────────────────────
export const resetPassword = mutation({
  args: { token: v.string(), newPassword: v.string() },
  handler: async (ctx, { token, newPassword }) => {
    const users = await ctx.db.query("users").collect();
    const user = users.find((u) => u.resetPasswordToken === token);

    if (!user) throw new Error("Invalid or expired reset token");
    if (!user.resetPasswordExpiry || user.resetPasswordExpiry < Date.now()) {
      throw new Error("Reset token has expired. Please request a new one.");
    }

    await ctx.db.patch(user._id, {
      passwordHash: newPassword,
      resetPasswordToken: undefined,
      resetPasswordExpiry: undefined,
      sessionToken: undefined,
    });

    return { success: true };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// VERIFY RESET TOKEN
// ─────────────────────────────────────────────────────────────────────────────
export const verifyResetToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const users = await ctx.db.query("users").collect();
    const user = users.find((u) => u.resetPasswordToken === token);

    if (!user) return { valid: false };
    if (!user.resetPasswordExpiry || user.resetPasswordExpiry < Date.now()) {
      return { valid: false, expired: true };
    }

    return { valid: true, email: user.email, name: user.name };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// REGISTER WEBAUTHN CREDENTIAL
// ─────────────────────────────────────────────────────────────────────────────
export const registerWebauthn = mutation({
  args: {
    userId: v.id("users"),
    credentialId: v.string(),
    publicKey: v.string(),
    counter: v.number(),
    deviceName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("webauthnCredentials")
      .withIndex("by_credential_id", (q) => q.eq("credentialId", args.credentialId))
      .unique();
    if (existing) throw new Error("Credential already registered");

    return await ctx.db.insert("webauthnCredentials", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET WEBAUTHN CREDENTIAL
// ─────────────────────────────────────────────────────────────────────────────
export const getWebauthnCredential = query({
  args: { credentialId: v.string() },
  handler: async (ctx, { credentialId }) => {
    const cred = await ctx.db
      .query("webauthnCredentials")
      .withIndex("by_credential_id", (q) => q.eq("credentialId", credentialId))
      .unique();
    if (!cred) return null;
    const user = await ctx.db.get(cred.userId);
    return { ...cred, user };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN VIA WEBAUTHN
// ─────────────────────────────────────────────────────────────────────────────
export const loginWebauthn = mutation({
  args: {
    credentialId: v.string(),
    counter: v.number(),
    sessionToken: v.string(),
    sessionExpiry: v.number(),
  },
  handler: async (ctx, { credentialId, counter, sessionToken, sessionExpiry }) => {
    const cred = await ctx.db
      .query("webauthnCredentials")
      .withIndex("by_credential_id", (q) => q.eq("credentialId", credentialId))
      .unique();
    if (!cred) throw new Error("Credential not found");

    const user = await ctx.db.get(cred.userId);
    if (!user) throw new Error("User not found");
    if (!user.isActive) throw new Error("Account is deactivated");
    if (!user.isApproved) throw new Error("Account pending approval");

    // Verify org is still active (skip for superadmins who don't have an org)
    let org = null;
    if (user.organizationId) {
      org = await ctx.db.get(user.organizationId);
      if (!org || !org.isActive) throw new Error("Organization is inactive");
    }

    // Replay attack prevention
    if (counter <= cred.counter) throw new Error("Invalid authenticator counter");
    await ctx.db.patch(cred._id, { counter, lastUsedAt: Date.now() });

    await ctx.db.patch(user._id, {
      sessionToken,
      sessionExpiry,
      lastLoginAt: Date.now(),
    });

    return {
      ...safeUser(user as Parameters<typeof safeUser>[0]),
      organizationName: org?.name || null,
      organizationSlug: org?.slug || null,
      organizationPlan: org?.plan || null,
    };
  },
});
