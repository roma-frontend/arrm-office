import GitHub from "@auth/core/providers/github";
import Google from "@auth/core/providers/google";
import Microsoft from "@auth/core/providers/microsoft-entra-id";
import { convexAuth } from "@convex-dev/auth/server";

const SUPERADMIN_EMAIL = "romangulanyan@gmail.com";

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    // Uncomment when you have Microsoft credentials
    // Microsoft({
    //   clientId: process.env.AUTH_MICROSOFT_ID,
    //   clientSecret: process.env.AUTH_MICROSOFT_SECRET,
    //   tenantId: process.env.AUTH_MICROSOFT_TENANT_ID || "common",
    // }),
    // Uncomment when you have GitHub credentials
    // GitHub({
    //   clientId: process.env.AUTH_GITHUB_ID,
    //   clientSecret: process.env.AUTH_GITHUB_SECRET,
    // }),
  ],
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      // Check if user exists
      const existingUser = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", args.existingUserId ? undefined : args.email!))
        .first();

      if (existingUser) {
        // Update last login
        await ctx.db.patch(existingUser._id, {
          updatedAt: Date.now(),
        });
        return existingUser._id;
      }

      // Create new user from OAuth
      const email = args.email!.toLowerCase().trim();
      const isSuperadmin = email === SUPERADMIN_EMAIL;

      // For OAuth users, they need to be invited to an organization
      // or be the superadmin creating the first org
      const allOrgs = await ctx.db.query("organizations").collect();
      
      let organizationId;
      let role: "superadmin" | "admin" | "employee" = "employee";
      let isApproved = false;

      if (isSuperadmin && allOrgs.length > 0) {
        // Superadmin joins first org
        organizationId = allOrgs[0]._id;
        role = "superadmin";
        isApproved = true;
      } else {
        // Regular OAuth users need an organization
        // For now, throw error - they should use invite link
        throw new Error("OAuth login requires an organization invite. Please contact your administrator.");
      }

      // Create user
      const userId = await ctx.db.insert("users", {
        name: args.name ?? args.email!.split("@")[0],
        email: email,
        role: role,
        organizationId: organizationId!,
        department: role === "admin" || isSuperadmin ? "Management" : undefined,
        position: role === "admin" || isSuperadmin ? "Administrator" : undefined,
        employeeType: "full_time",
        travelAllowance: 0,
        isActive: true,
        isApproved: isApproved,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        avatarUrl: args.image,
      });

      return userId;
    },
  },
});
