import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

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

// Migration: Clean up reactions with invalid field names
export const cleanReactionsFieldNames = mutation({
  args: {},
  handler: async (ctx) => {
    const messages = await ctx.db.query("chatMessages").collect();
    
    let cleaned = 0;
    let processed = 0;
    
    for (const msg of messages) {
      if (!msg.reactions) continue;
      
      processed++;
      const rawReactions = msg.reactions;
      
      if (typeof rawReactions !== 'object') {
        // Invalid reactions data, clear it
        await ctx.db.patch(msg._id, { reactions: {} });
        cleaned++;
        continue;
      }
      
      const cleanedReactions: Record<string, Id<"users">[]> = {};
      let needsCleaning = false;
      
      for (const [key, value] of Object.entries(rawReactions)) {
        // Check if key has invalid characters
        const hasInvalidChars = /[\s\x00-\x1F\x7F-\x9F]/.test(key);
        
        if (hasInvalidChars) {
          needsCleaning = true;
        }
        
        // Remove all whitespace and control characters from keys
        const cleanKey = key.replace(/[\s\x00-\x1F\x7F-\x9F]/g, '');
        
        if (cleanKey && Array.isArray(value) && value.length > 0) {
          // If we already have this clean key, merge the user arrays
          if (cleanedReactions[cleanKey]) {
            const existingUsers = cleanedReactions[cleanKey];
            const newUsers = value as Id<"users">[];
            // Merge and deduplicate
            cleanedReactions[cleanKey] = [...new Set([...existingUsers, ...newUsers])];
          } else {
            cleanedReactions[cleanKey] = value as Id<"users">[];
          }
        }
      }
      
      if (needsCleaning) {
        await ctx.db.patch(msg._id, { reactions: cleanedReactions });
        cleaned++;
      }
    }
    
    return {
      success: true,
      message: `Cleaned ${cleaned} messages with invalid reaction keys out of ${processed} messages with reactions`,
      total: messages.length,
      cleaned,
      processed,
    };
  },
});

