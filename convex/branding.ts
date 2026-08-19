import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getAuthCaller } from './lib/getAuthCaller';

/**
 * Save (upsert) branding settings for the caller's organization.
 * Only admins and superadmins may modify branding.
 */
export const saveBranding = mutation({
  args: {
    primaryColor: v.string(),
    secondaryColor: v.string(),
    accentColor: v.string(),
    // Dark theme overrides (optional)
    primaryColorDark: v.optional(v.string()),
    secondaryColorDark: v.optional(v.string()),
    accentColorDark: v.optional(v.string()),
    // Typography
    headingFont: v.optional(v.string()),
    bodyFont: v.optional(v.string()),
    // Custom CSS
    customCss: v.optional(v.string()),
    // Assets
    logoUrl: v.optional(v.string()),
    faviconUrl: v.optional(v.string()),
    brandName: v.optional(v.string()),
    // White-label
    enableWhiteLabel: v.boolean(),
    hidePoweredBy: v.boolean(),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    if (caller.role !== 'admin' && caller.role !== 'superadmin') {
      throw new Error('Only admins can modify branding');
    }

    const organizationId = caller.organizationId;
    if (!organizationId) throw new Error('No organization');

    const now = Date.now();
    const existing = await ctx.db
      .query('orgBranding')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .unique();

    const data = {
      primaryColor: args.primaryColor,
      secondaryColor: args.secondaryColor,
      accentColor: args.accentColor,
      primaryColorDark: args.primaryColorDark,
      secondaryColorDark: args.secondaryColorDark,
      accentColorDark: args.accentColorDark,
      headingFont: args.headingFont,
      bodyFont: args.bodyFont,
      customCss: args.customCss,
      logoUrl: args.logoUrl,
      faviconUrl: args.faviconUrl,
      brandName: args.brandName,
      enableWhiteLabel: args.enableWhiteLabel,
      hidePoweredBy: args.hidePoweredBy,
    };

    if (existing) {
      await ctx.db.patch(existing._id, { ...data, updatedAt: now });
      return { id: existing._id, updated: true };
    }

    const id = await ctx.db.insert('orgBranding', {
      organizationId,
      ...data,
      createdAt: now,
      updatedAt: now,
    });
    return { id, updated: false };
  },
});

/**
 * Reset branding to defaults for the caller's organization.
 */
export const resetBranding = mutation({
  args: {},
  handler: async (ctx) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    if (caller.role !== 'admin' && caller.role !== 'superadmin') {
      throw new Error('Only admins can modify branding');
    }
    const organizationId = caller.organizationId;
    if (!organizationId) throw new Error('No organization');

    const existing = await ctx.db
      .query('orgBranding')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return { success: true };
  },
});

/**
 * Get branding settings for the caller's organization.
 * Returns null if no branding has been configured (caller should use defaults).
 */
export const getBranding = query({
  args: {},
  handler: async (ctx) => {
    const caller = await getAuthCaller(ctx);
    if (!caller?.organizationId) return null;

    const branding = await ctx.db
      .query('orgBranding')
      .withIndex('by_org', (q) => q.eq('organizationId', caller.organizationId!))
      .unique();

    if (!branding) return null;

    return {
      primaryColor: branding.primaryColor,
      secondaryColor: branding.secondaryColor,
      accentColor: branding.accentColor,
      primaryColorDark: branding.primaryColorDark,
      secondaryColorDark: branding.secondaryColorDark,
      accentColorDark: branding.accentColorDark,
      headingFont: branding.headingFont,
      bodyFont: branding.bodyFont,
      customCss: branding.customCss,
      logoUrl: branding.logoUrl,
      faviconUrl: branding.faviconUrl,
      brandName: branding.brandName,
      enableWhiteLabel: branding.enableWhiteLabel,
      hidePoweredBy: branding.hidePoweredBy,
    };
  },
});

/**
 * Get branding for a specific organization (public — used by careers/landing).
 */
export const getBrandingByOrg = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, args) => {
    const branding = await ctx.db
      .query('orgBranding')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .unique();

    if (!branding) return null;

    return {
      primaryColor: branding.primaryColor,
      secondaryColor: branding.secondaryColor,
      accentColor: branding.accentColor,
      primaryColorDark: branding.primaryColorDark,
      secondaryColorDark: branding.secondaryColorDark,
      accentColorDark: branding.accentColorDark,
      headingFont: branding.headingFont,
      bodyFont: branding.bodyFont,
      customCss: branding.customCss,
      logoUrl: branding.logoUrl,
      faviconUrl: branding.faviconUrl,
      brandName: branding.brandName,
      enableWhiteLabel: branding.enableWhiteLabel,
      hidePoweredBy: branding.hidePoweredBy,
    };
  },
});
