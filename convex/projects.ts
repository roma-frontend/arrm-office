import { v } from 'convex/values';
import { mutation, query, type QueryCtx } from './_generated/server';
import { getAuthCaller, type AuthenticatedCaller } from './lib/getAuthCaller';
import { isSuperadmin } from './lib/auth';
import { getVisibleUserIds } from './lib/reportingLine';
import { DEFAULT_LIST_CAP } from './lib/limits';
import type { Doc, Id } from './_generated/dataModel';
import {
  assertModuleAccess,
  assertQuota,
  decrementUsage,
  incrementUsage,
} from './lib/entitlements';

// ── Access helpers ──────────────────────────────────────────────────────────
// Projects are org-scoped: a caller may only touch their own organization
// (superadmins are exempt). Mutations additionally require a managing role.

function canReadOrg(caller: AuthenticatedCaller, organizationId: Id<'organizations'> | undefined) {
  if (isSuperadmin(caller)) return true;
  // Unscoped records have no owning org to compare against — deny by default.
  if (!organizationId) return false;
  return caller.organizationId === organizationId;
}

function canManageOrg(
  caller: AuthenticatedCaller,
  organizationId: Id<'organizations'> | undefined,
) {
  if (isSuperadmin(caller)) return true;
  if (!organizationId || caller.organizationId !== organizationId) return false;
  return caller.role === 'admin' || caller.role === 'supervisor';
}

/**
 * Projects visible to the caller, by the same reporting-line rule the task
 * board uses (`tasks.getVisibleTasks`): staff (admin / superadmin) see the
 * whole org; everyone else sees projects they own, created or are a member
 * of — plus projects of their reporting subtree, so a manager sees what their
 * branch works on.
 */
async function filterVisibleProjects(
  ctx: QueryCtx,
  caller: AuthenticatedCaller,
  projects: Doc<'projects'>[],
): Promise<Doc<'projects'>[]> {
  if (caller.role === 'admin' || isSuperadmin(caller)) return projects;

  const visibleUsers = await getVisibleUserIds(ctx, caller);
  return projects.filter(
    (p) =>
      (p.ownerId !== undefined && visibleUsers.has(p.ownerId)) ||
      visibleUsers.has(p.createdBy) ||
      p.memberIds.some((m) => visibleUsers.has(m)),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PROJECTS
// ═══════════════════════════════════════════════════════════════════════════

// ── List projects for an organization ───────────────────────────────────────
export const listProjects = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, { organizationId }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller || !canReadOrg(caller, organizationId)) return [];

    const projects = await ctx.db
      .query('projects')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .order('desc')
      .take(DEFAULT_LIST_CAP);

    const visible = await filterVisibleProjects(ctx, caller, projects);

    // Enrich with owner names and task counts
    const enriched = await Promise.all(
      visible.map(async (project) => {
        const owner = project.ownerId ? await ctx.db.get(project.ownerId) : null;
        const tasks = await ctx.db
          .query('tasks')
          .withIndex('by_project', (q) => q.eq('projectId', project._id))
          .take(DEFAULT_LIST_CAP);
        // Include active recurring series linked to this project in the count.
        const recurringSeries = await ctx.db
          .query('recurringTasks')
          .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
          .take(DEFAULT_LIST_CAP);
        const projectRecurring = recurringSeries.filter((r) => r.projectId === project._id);
        const taskCount = tasks.length + projectRecurring.length;
        const completedTasks = tasks.filter((t) => t.status === 'completed').length;

        return {
          ...project,
          ownerName: owner?.name ?? 'Unassigned',
          ownerAvatar: owner?.avatarUrl ?? null,
          taskCount,
          completedTasks,
          progress: taskCount > 0 ? Math.round((completedTasks / taskCount) * 100) : 0,
        };
      }),
    );

    return enriched;
  },
});

// ── Get a single project by ID ──────────────────────────────────────────────
export const getProject = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return null;

    const project = await ctx.db.get(projectId);
    if (!project) return null;
    if (!canReadOrg(caller, project.organizationId)) return null;

    // Same reporting-line rule as the list: a project is only open to people
    // connected to it (owner / creator / member) or to their managers.
    const visibleProjects = await filterVisibleProjects(ctx, caller, [project]);
    if (visibleProjects.length === 0) return null;

    const owner = project.ownerId ? await ctx.db.get(project.ownerId) : null;
    const members = await Promise.all(project.memberIds.map((id) => ctx.db.get(id)));

    // Get tasks for this project
    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_project', (q) => q.eq('projectId', projectId))
      .order('desc')
      .take(DEFAULT_LIST_CAP);

    // Also get recurring tasks (series) linked to this project.
    // Recurring tasks are stored in a separate table; the hourly sweep
    // materialises them into `tasks` on each occurrence, but newly created
    // series appear in `recurringTasks` immediately and must be visible here.
    const recurringSeries = project.organizationId
      ? await ctx.db
          .query('recurringTasks')
          .withIndex('by_org', (q) => q.eq('organizationId', project.organizationId!))
          .order('desc')
          .take(DEFAULT_LIST_CAP)
      : [];
    const projectRecurring = recurringSeries.filter((r) => r.projectId === projectId);

    const enrichedTasks = await Promise.all(
      tasks.map(async (task) => {
        const assignedTo = task.assignedTo ? await ctx.db.get(task.assignedTo) : null;
        return {
          ...task,
          type: 'task' as const,
          assignedToUser: assignedTo
            ? { _id: assignedTo._id, name: assignedTo.name, avatarUrl: assignedTo.avatarUrl }
            : null,
        };
      }),
    );

    const enrichedRecurring = await Promise.all(
      projectRecurring.map(async (series) => {
        const assignedTo = await ctx.db.get(series.assignedTo);
        return {
          _id: series._id,
          title: series.title,
          description: series.description,
          assignedTo: series.assignedTo,
          assignedBy: series.assignedBy,
          status: series.isActive ? ('in_progress' as const) : ('cancelled' as const),
          priority: series.priority,
          tags: series.tags,
          projectId: series.projectId,
          createdAt: series.createdAt,
          updatedAt: series.updatedAt,
          type: 'recurring' as const,
          frequency: series.frequency,
          isActive: series.isActive,
          generatedCount: series.generatedCount ?? 0,
          assignedToUser: assignedTo
            ? { _id: assignedTo._id, name: assignedTo.name, avatarUrl: assignedTo.avatarUrl }
            : null,
        };
      }),
    );

    const allTasks = [...enrichedTasks, ...enrichedRecurring].sort(
      (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
    );

    return {
      ...project,
      ownerName: owner?.name ?? 'Unassigned',
      ownerAvatar: owner?.avatarUrl ?? null,
      members: members.map((m) => ({
        _id: m?._id,
        name: m?.name ?? 'Unknown',
        avatarUrl: m?.avatarUrl ?? null,
      })),
      // Unique assignees from tasks (people actually working on the project)
      assigneeCount: new Set(allTasks.map((t) => (t as any).assignedTo).filter(Boolean)).size,
      tasks: allTasks,
      taskCount: allTasks.length,
      completedTasks: allTasks.filter((t) => t.status === 'completed').length,
      progress:
        allTasks.length > 0
          ? Math.round(
              (allTasks.filter((t) => t.status === 'completed').length / allTasks.length) * 100,
            )
          : 0,
    };
  },
});

// ── Create a project ────────────────────────────────────────────────────────
export const createProject = mutation({
  args: {
    organizationId: v.id('organizations'),
    name: v.string(),
    description: v.optional(v.string()),
    priority: v.union(
      v.literal('low'),
      v.literal('medium'),
      v.literal('high'),
      v.literal('urgent'),
    ),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    deadline: v.optional(v.number()),
    ownerId: v.optional(v.id('users')),
    memberIds: v.array(v.id('users')),
    tags: v.optional(v.array(v.string())),
    templateId: v.optional(v.id('projectTemplates')),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'tasks');
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    if (!canManageOrg(caller, args.organizationId)) {
      throw new Error('Insufficient permissions to create projects');
    }
    if (!args.name.trim()) throw new Error('Project name is required');

    // Plan enforcement: each project consumes one slot of the `projects` quota.
    await assertQuota(ctx, 'tasks', 'projects', 1);

    const now = Date.now();
    const projectId = await ctx.db.insert('projects', {
      ...args,
      status: 'planning',
      createdBy: caller._id,
      createdAt: now,
      updatedAt: now,
    });

    // Audit log
    await ctx.db.insert('auditLogs', {
      organizationId: args.organizationId,
      userId: caller._id,
      action: 'project_created',
      target: projectId,
      details: JSON.stringify({
        name: args.name,
        priority: args.priority,
        memberCount: args.memberIds.length,
      }),
      createdAt: now,
    });

    await incrementUsage(ctx, args.organizationId, 'tasks', 'projects', 1);

    // If created from a template, create default tasks
    if (args.templateId) {
      const template = await ctx.db.get(args.templateId);
      // Only the org's own templates or shared public ones may be applied.
      if (template && (template.isPublic || template.organizationId === args.organizationId)) {
        for (const defaultTask of template.defaultTasks) {
          await ctx.db.insert('tasks', {
            organizationId: args.organizationId,
            projectId,
            title: defaultTask.title,
            description: defaultTask.description,
            assignedTo: caller._id, // Default to creator
            assignedBy: caller._id,
            status: 'pending',
            priority: defaultTask.priority,
            deadline: defaultTask.estimatedDays
              ? now + defaultTask.estimatedDays * 86400000
              : undefined,
            tags: template.tags,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    }

    return projectId;
  },
});

// ── Update a project ────────────────────────────────────────────────────────
export const updateProject = mutation({
  args: {
    projectId: v.id('projects'),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal('planning'),
        v.literal('active'),
        v.literal('on_hold'),
        v.literal('completed'),
        v.literal('cancelled'),
      ),
    ),
    priority: v.optional(
      v.union(v.literal('low'), v.literal('medium'), v.literal('high'), v.literal('urgent')),
    ),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    deadline: v.optional(v.number()),
    ownerId: v.optional(v.id('users')),
    memberIds: v.optional(v.array(v.id('users'))),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'tasks');
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');

    const { projectId, ...updates } = args;

    const project = await ctx.db.get(projectId);
    if (!project) throw new Error('Project not found');
    if (!canManageOrg(caller, project.organizationId)) {
      throw new Error('Insufficient permissions to update this project');
    }

    const filtered = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));

    await ctx.db.patch(projectId, { ...filtered, updatedAt: Date.now() });

    await ctx.db.insert('auditLogs', {
      organizationId: project.organizationId,
      userId: caller._id,
      action: 'project_updated',
      target: projectId,
      details: JSON.stringify({ updatedFields: Object.keys(filtered) }),
      createdAt: Date.now(),
    });
  },
});

// ── Delete a project ────────────────────────────────────────────────────────
export const deleteProject = mutation({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    await assertModuleAccess(ctx, 'tasks');
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');

    const project = await ctx.db.get(projectId);
    if (!project) throw new Error('Project not found');
    if (!canManageOrg(caller, project.organizationId)) {
      throw new Error('Insufficient permissions to delete this project');
    }

    // Unlink all tasks from this project
    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_project', (q) => q.eq('projectId', projectId))
      .take(DEFAULT_LIST_CAP);
    for (const task of tasks) {
      await ctx.db.patch(task._id, { projectId: undefined });
    }

    await ctx.db.delete(projectId);
    // A deleted project frees its quota slot (org is optional on the schema).
    if (project.organizationId) {
      await decrementUsage(ctx, project.organizationId, 'tasks', 'projects', 1);
    }

    await ctx.db.insert('auditLogs', {
      organizationId: project.organizationId,
      userId: caller._id,
      action: 'project_deleted',
      target: projectId,
      details: JSON.stringify({ name: project.name }),
      createdAt: Date.now(),
    });
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// PROJECT TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

// ── List templates for an organization ──────────────────────────────────────
export const listTemplates = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, { organizationId }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller || !canReadOrg(caller, organizationId)) return [];

    const orgTemplates = await ctx.db
      .query('projectTemplates')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(DEFAULT_LIST_CAP);

    const publicTemplates = await ctx.db
      .query('projectTemplates')
      .withIndex('by_public', (q) => q.eq('isPublic', true))
      .take(DEFAULT_LIST_CAP);

    const allTemplates = [...orgTemplates, ...publicTemplates];
    const unique = new Map<Id<'projectTemplates'>, Doc<'projectTemplates'>>();
    for (const t of allTemplates) {
      if (!unique.has(t._id)) unique.set(t._id, t);
    }

    return Array.from(unique.values()).map((t) => ({
      ...t,
      taskCount: t.defaultTasks.length,
    }));
  },
});

// ── Create a template ───────────────────────────────────────────────────────
export const createTemplate = mutation({
  args: {
    organizationId: v.id('organizations'),
    name: v.string(),
    description: v.optional(v.string()),
    defaultTasks: v.array(
      v.object({
        title: v.string(),
        description: v.optional(v.string()),
        priority: v.union(
          v.literal('low'),
          v.literal('medium'),
          v.literal('high'),
          v.literal('urgent'),
        ),
        estimatedDays: v.optional(v.number()),
      }),
    ),
    tags: v.optional(v.array(v.string())),
    isPublic: v.boolean(),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    if (!canManageOrg(caller, args.organizationId)) {
      throw new Error('Insufficient permissions to create templates');
    }

    const now = Date.now();
    return await ctx.db.insert('projectTemplates', {
      ...args,
      createdBy: caller._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// ── Delete a template ───────────────────────────────────────────────────────
export const deleteTemplate = mutation({
  args: { templateId: v.id('projectTemplates') },
  handler: async (ctx, { templateId }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');

    const template = await ctx.db.get(templateId);
    if (!template) return;
    if (!canManageOrg(caller, template.organizationId)) {
      throw new Error('Insufficient permissions to delete this template');
    }

    await ctx.db.delete(templateId);
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// PROJECT STATS
// ═══════════════════════════════════════════════════════════════════════════

// ── Get project dashboard stats ─────────────────────────────────────────────
export const getProjectStats = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, { organizationId }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller || !canReadOrg(caller, organizationId)) {
      return {
        total: 0,
        active: 0,
        planning: 0,
        completed: 0,
        onHold: 0,
        totalTasks: 0,
        completedTasks: 0,
        overallProgress: 0,
      };
    }

    const projects = await ctx.db
      .query('projects')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(DEFAULT_LIST_CAP);

    // Stats mirror the list: non-staff callers only see the projects their
    // reporting line is connected to.
    const visible = await filterVisibleProjects(ctx, caller, projects);

    const total = visible.length;
    const active = visible.filter((p) => p.status === 'active').length;
    const planning = visible.filter((p) => p.status === 'planning').length;
    const completed = visible.filter((p) => p.status === 'completed').length;
    const onHold = visible.filter((p) => p.status === 'on_hold').length;

    // Count all tasks across all projects
    let totalTasks = 0;
    let completedTasks = 0;
    for (const project of visible) {
      const tasks = await ctx.db
        .query('tasks')
        .withIndex('by_project', (q) => q.eq('projectId', project._id))
        .take(DEFAULT_LIST_CAP);
      totalTasks += tasks.length;
      completedTasks += tasks.filter((t) => t.status === 'completed').length;
    }

    return {
      total,
      active,
      planning,
      completed,
      onHold,
      totalTasks,
      completedTasks,
      overallProgress: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    };
  },
});
