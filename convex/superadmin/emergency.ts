import { v } from 'convex/values';
import { query, mutation } from '../_generated/server';
import { Id } from '../_generated/dataModel';
import { MAX_PAGE_SIZE } from '../pagination';
import { withAuth } from '../lib/withAuth';

// ─── EMERGENCY DASHBOARD ─────────────────────────────────────────────────────
/**
 * 🚨 Emergency Dashboard - Critical issues requiring immediate attention
 */
export const getEmergencyDashboard = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const twentyFourHoursAgo = now - 86400000;

    // Parallel fetch all critical data
    const [
      criticalTickets,
      activeIncidents,
      slaBreaches,
      failedLogins,
      systemAlerts,
      pendingOrgRequests,
    ] = await Promise.all([
      // Critical tickets in last hour
      ctx.db
        .query('supportTickets')
        .filter((q: any) =>
          q.and(
            q.eq(q.field('priority'), 'critical'),
            q.neq(q.field('status'), 'closed'),
            q.gt(q.field('createdAt'), oneHourAgo),
          ),
        )
        .order('desc')
        .take(MAX_PAGE_SIZE),

      // Active emergency incidents
      ctx.db
        .query('emergencyIncidents')
        .filter((q: any) => q.eq(q.field('status'), 'investigating'))
        .order('desc')
        .take(MAX_PAGE_SIZE),

      // SLA breaches in last 24h
      ctx.db
        .query('slaMetrics')
        .filter((q: any) =>
          q.and(
            q.eq(q.field('status'), 'breached'),
            q.gt(q.field('createdAt'), twentyFourHoursAgo),
          ),
        )
        .order('desc')
        .take(MAX_PAGE_SIZE),

      // Failed login attempts (potential attack)
      ctx.db
        .query('loginAttempts')
        .filter((q: any) =>
          q.and(q.eq(q.field('success'), false), q.gt(q.field('createdAt'), oneHourAgo)),
        )
        .order('desc')
        .take(MAX_PAGE_SIZE),

      // Organizations in maintenance mode
      ctx.db
        .query('maintenanceMode')
        .filter((q: any) => q.eq(q.field('isActive'), true))
        .order('desc')
        .take(MAX_PAGE_SIZE),

      // Pending organization requests
      ctx.db
        .query('organizationRequests')
        .withIndex('by_status', (q) => q.eq('status', 'pending'))
        .take(MAX_PAGE_SIZE),
    ]);

    // Enrich critical tickets
    const enrichedTickets = await Promise.all(
      criticalTickets.map(async (ticket) => {
        const creator = (await ctx.db.get(ticket.createdBy)) as any;
        const org = ticket.organizationId
          ? ((await ctx.db.get(ticket.organizationId)) as any)
          : null;
        return {
          ...ticket,
          creatorName: creator?.name || 'Unknown',
          organizationName: org?.name || null,
          minutesOpen: Math.round((now - ticket.createdAt) / 60000),
        };
      }),
    );

    // Enrich incidents
    const enrichedIncidents = await Promise.all(
      activeIncidents.map(async (incident) => {
        const creator = (await ctx.db.get(incident.createdBy)) as any;
        return {
          ...incident,
          creatorName: creator?.name || 'Unknown',
          minutesActive: Math.round((now - incident.startedAt) / 60000),
        };
      }),
    );

    // Analyze failed logins for potential attacks
    const failedLoginsByIP = failedLogins.reduce(
      (acc, attempt) => {
        const ip = attempt.ip || 'unknown';
        if (!acc[ip]) acc[ip] = [];
        acc[ip].push(attempt);
        return acc;
      },
      {} as Record<string, any[]>,
    );

    const suspiciousIPs = Object.entries(failedLoginsByIP)
      .filter(([_, attempts]) => attempts.length >= 5)
      .map(([ip, attempts]) => ({
        ip,
        attempts: attempts.length,
        userIds: [...new Set(attempts.map((a: any) => a.userId.toString()))],
      }));

    // Calculate priority score
    let priorityScore = 0;
    const issues: string[] = [];

    if (enrichedTickets.length > 0) {
      priorityScore += enrichedTickets.length * 10;
      issues.push(`${enrichedTickets.length} критических тикетов`);
    }

    if (enrichedIncidents.length > 0) {
      priorityScore += enrichedIncidents.length * 20;
      issues.push(`${enrichedIncidents.length} активных инцидента`);
    }

    if (slaBreaches.length > 10) {
      priorityScore += 15;
      issues.push(`${slaBreaches.length} SLA нарушений за 24ч`);
    }

    if (suspiciousIPs.length > 0) {
      priorityScore += suspiciousIPs.length * 5;
      issues.push(`${suspiciousIPs.length} подозрительных IP`);
    }

    let priorityLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (priorityScore >= 50) priorityLevel = 'critical';
    else if (priorityScore >= 30) priorityLevel = 'high';
    else if (priorityScore >= 10) priorityLevel = 'medium';

    return {
      criticalTickets: enrichedTickets,
      activeIncidents: enrichedIncidents,
      slaBreaches: slaBreaches.length,
      suspiciousIPs,
      maintenanceModeOrgs: systemAlerts.length,
      pendingOrgRequests: pendingOrgRequests.length,
      priorityLevel,
      priorityScore,
      issues,
      requiresAttention: priorityScore > 0,
    };
  },
});

// ─── CREATE EMERGENCY INCIDENT ───────────────────────────────────────────────
export const createIncident = mutation({
  args: {
    createdBy: v.id('users'),
    title: v.string(),
    description: v.string(),
    severity: v.union(
      v.literal('low'),
      v.literal('medium'),
      v.literal('high'),
      v.literal('critical'),
    ),
    affectedUsers: v.number(),
    affectedOrgs: v.number(),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const now = Date.now();

    const incidentId = await ctx.db.insert('emergencyIncidents', {
      organizationId: undefined,
      title: args.title,
      description: args.description,
      severity: args.severity,
      status: 'investigating',
      affectedUsers: args.affectedUsers,
      affectedOrgs: args.affectedOrgs,
      rootCause: undefined,
      resolution: undefined,
      startedAt: now,
      resolvedAt: undefined,
      createdBy: args.createdBy,
      createdAt: now,
      updatedAt: now,
    });

    // Notify all superadmins
    // NOTE: Using .collect() here because we must notify ALL superadmins of an emergency incident; truncating would miss critical recipients
    const superadmins = await ctx.db
      .query('users')
      .withIndex('by_role', (q) => q.eq('role', 'superadmin'))
      .collect();

    for (const admin of superadmins) {
      await ctx.db.insert('notifications', {
        organizationId: undefined,
        userId: admin._id,
        type: 'security_alert',
        title: `🚨 Чрезвычайная ситуация: ${args.severity}`,
        message: args.title,
        isRead: false,
        relatedId: `incident:${incidentId}`,
        route: '/security',
        createdAt: now,
      });
    }

    return incidentId;
  }),
});

// ─── UPDATE INCIDENT STATUS ──────────────────────────────────────────────────
export const updateIncidentStatus = mutation({
  args: {
    incidentId: v.id('emergencyIncidents'),
    status: v.union(
      v.literal('investigating'),
      v.literal('identified'),
      v.literal('monitoring'),
      v.literal('resolved'),
    ),
    userId: v.id('users'),
    rootCause: v.optional(v.string()),
    resolution: v.optional(v.string()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const now = Date.now();

    const updates: any = {
      status: args.status,
      updatedAt: now,
    };

    if (args.rootCause) updates.rootCause = args.rootCause;
    if (args.resolution) updates.resolution = args.resolution;
    if (args.status === 'resolved') {
      updates.resolvedAt = now;
    }

    await ctx.db.patch(args.incidentId, updates);

    return args.incidentId;
  }),
});
