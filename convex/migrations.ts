import { mutation } from "./_generated/server";

// Migration: Approve all existing users
export const approveAllExistingUsers = mutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    
    let approved = 0;
    for (const user of users) {
      // If user doesn't have isApproved field or it's false, approve them
      if (user.isApproved === undefined || user.isApproved === false) {
        await ctx.db.patch(user._id, {
          isApproved: true,
          approvedAt: Date.now(),
        });
        approved++;
      }
    }
    
    return { 
      success: true, 
      message: `Approved ${approved} users`,
      total: users.length 
    };
  },
});

