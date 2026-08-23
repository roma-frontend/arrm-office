/**
 * Saved views — the *Payable Outstanding* tab, as opposed to plain *List*.
 *
 * A view is a named board state: which columns, grouped how, filtered to what.
 * The value is not the filtering — the board could already do that from the URL —
 * but the *name*: "check Payable Outstanding" is a sentence a team can say to each
 * other, where "filter by unpaid, group by status, sort by due date" is not.
 *
 * `state` is stored as `v.any()` and this module never inspects it. That is
 * deliberate and is explained in the schema: the client owns the shape,
 * `decodeTaskView` is written never to throw, and a strict validator here would
 * reject a view saved by a browser tab running yesterday's bundle. What the
 * server does enforce is the part it owns — who may see a view, who may change
 * one, and how large it may be.
 */

import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { SMALL_LIST_CAP } from './lib/limits';
import { assertModuleAccess } from './lib/entitlements';
import { assertOrgStaff, assertOrgScope, resolveOrgScope, scopeOwnsRecord } from './lib/orgAccess';
import type { OrgScope } from './lib/orgAccess';
import { sanitizeTitle } from './lib/sanitize';

const MAX_VIEW_NAME_LENGTH = 60;
const MAX_VIEWS_PER_SCOPE = 40;

/**
 * How much serialized state one view may carry.
 *
 * A view holds filters, column widths and an order — kilobytes, not megabytes.
 * The bound exists because `v.any()` accepts anything: without it, a saved view
 * is an unbounded write endpoint that any member can call, and a document large
 * enough to break every subsequent read of the tab list.
 */
const MAX_STATE_BYTES = 64 * 1024;

const viewTypeValidator = v.union(
  v.literal('list'),
  v.literal('board'),
  v.literal('table'),
  v.literal('calendar'),
  v.literal('timeline'),
);

const visibilityValidator = v.union(v.literal('private'), v.literal('team'));

/**
 * The state, checked for size and nothing else.
 *
 * `JSON.stringify` also rejects what Convex could not store anyway — a circular
 * structure — with a clear message instead of an internal error.
 */
function checkState(state: unknown): unknown {
  let encoded: string;
  try {
    encoded = JSON.stringify(state ?? {});
  } catch {
    throw new ConvexError('That view could not be saved');
  }
  if (encoded.length > MAX_STATE_BYTES) {
    throw new ConvexError('That view holds too much state to save');
  }
  return state ?? {};
}

function cleanViewName(raw: string): string {
  const name = sanitizeTitle(raw, MAX_VIEW_NAME_LENGTH);
  if (name === '') throw new ConvexError('A view needs a name');
  return name;
}

/**
 * Whether the caller may see a view.
 *
 * `team` views are the organization's; `private` ones belong to their author
 * alone. A superadmin reading across organizations sees both, which is consistent
 * with every other read in this codebase — but note that "private" here means
 * *not shared with my colleagues*, not *encrypted*, and the naming should not
 * promise more than that.
 */
function canSeeView(scope: OrgScope, view: Doc<'taskViews'>): boolean {
  if (!scopeOwnsRecord(scope, view)) return false;
  return view.visibility === 'team' || view.ownerId === scope.caller._id;
}

/**
 * Whether the caller may change or delete a view.
 *
 * The author always may. For a `team` view so may staff, because a shared tab
 * whose author has left the company would otherwise be unmaintainable — the
 * failure mode of the stricter rule is a board nobody can tidy.
 */
function canEditView(scope: OrgScope, view: Doc<'taskViews'>): boolean {
  if (!scopeOwnsRecord(scope, view)) return false;
  if (view.ownerId === scope.caller._id) return true;
  return view.visibility === 'team' && scope.isStaff;
}

// ── Reading ────────────────────────────────────────────────────────────────
/**
 * The tabs for one board, in the order they should appear.
 *
 * Scoped by project: a project's own views, or — with no `projectId` — the views
 * on the all-tasks board. The two do not mix, because a filter that means
 * something on the payables board is noise on somebody's personal task list.
 *
 * Returns `[]` for a caller with no organization rather than throwing, so the tab
 * strip disappears instead of taking the page down.
 */
export const listViews = query({
  args: {
    projectId: v.optional(v.id('projects')),
    organizationId: v.optional(v.id('organizations')),
  },
  handler: async (ctx, args) => {
    const scope = await resolveOrgScope(ctx, args.organizationId);
    if (!scope?.organizationId) return [];

    const views = await ctx.db
      .query('taskViews')
      .withIndex('by_org_project', (q) =>
        q.eq('organizationId', scope.organizationId!).eq('projectId', args.projectId),
      )
      .take(SMALL_LIST_CAP);

    return views
      .filter((view) => canSeeView(scope, view))
      .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
      .map((view) => ({ ...view, canEdit: canEditView(scope, view) }));
  },
});

// ── Writing ────────────────────────────────────────────────────────────────
/**
 * Save the current board state as a new tab.
 *
 * Open to any authenticated member, unlike the rest of the board's configuration.
 * A private view is a bookmark — refusing an employee their own saved filter would
 * be gatekeeping a preference. Sharing one with the team is a different act, and
 * `visibility: 'team'` is where the staff check lands.
 */
export const saveView = mutation({
  args: {
    name: v.string(),
    type: viewTypeValidator,
    state: v.any(),
    projectId: v.optional(v.id('projects')),
    icon: v.optional(v.string()),
    visibility: v.optional(visibilityValidator),
    organizationId: v.optional(v.id('organizations')),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'tasks');
    const scope = await assertOrgScope(ctx, args.organizationId);
    const organizationId = scope.organizationId;
    if (!organizationId) throw new ConvexError('An organization is required');

    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (!scopeOwnsRecord(scope, project)) throw new ConvexError('Project not found');
    }

    const visibility = args.visibility ?? 'private';
    if (visibility === 'team' && !scope.isStaff) {
      throw new ConvexError('Only admins and supervisors can share a view with the team');
    }

    const existing = await ctx.db
      .query('taskViews')
      .withIndex('by_org_project', (q) =>
        q.eq('organizationId', organizationId).eq('projectId', args.projectId),
      )
      .take(SMALL_LIST_CAP);

    // Counted per author, so one enthusiast cannot use up the board's allowance
    // for everybody else.
    const mine = existing.filter((view) => view.ownerId === scope.caller._id);
    if (mine.length >= MAX_VIEWS_PER_SCOPE) {
      throw new ConvexError(`You can save at most ${MAX_VIEWS_PER_SCOPE} views on one board`);
    }

    const now = Date.now();
    const viewId = await ctx.db.insert('taskViews', {
      organizationId,
      projectId: args.projectId,
      name: cleanViewName(args.name),
      icon: args.icon,
      type: args.type,
      state: checkState(args.state),
      visibility,
      ownerId: scope.caller._id,
      isDefault: false,
      order: existing.reduce((max, view) => Math.max(max, view.order), -1) + 1,
      createdAt: now,
      updatedAt: now,
    });

    return viewId;
  },
});

/**
 * Update a saved view: rename it, re-point it at the current board state, or
 * change who can see it.
 *
 * Each argument is independently optional, so "Update view" from the board sends
 * only `state` and does not have to echo back a name it never showed the user.
 */
export const updateView = mutation({
  args: {
    viewId: v.id('taskViews'),
    name: v.optional(v.string()),
    icon: v.optional(v.string()),
    type: v.optional(viewTypeValidator),
    state: v.optional(v.any()),
    visibility: v.optional(visibilityValidator),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'tasks');
    const view = await ctx.db.get(args.viewId);
    if (!view) throw new ConvexError('View not found');

    const scope = await assertOrgScope(ctx, view.organizationId);
    if (!canEditView(scope, view)) throw new ConvexError('You cannot change that view');

    if (args.visibility === 'team' && view.visibility !== 'team' && !scope.isStaff) {
      throw new ConvexError('Only admins and supervisors can share a view with the team');
    }

    const patch: Partial<Doc<'taskViews'>> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = cleanViewName(args.name);
    if (args.icon !== undefined) patch.icon = args.icon;
    if (args.type !== undefined) patch.type = args.type;
    if (args.state !== undefined) patch.state = checkState(args.state);
    if (args.visibility !== undefined) patch.visibility = args.visibility;

    await ctx.db.patch(args.viewId, patch);
  },
});

/**
 * Delete a saved view.
 *
 * A view holds no data of its own — every task it showed is untouched — so unlike
 * a custom field this genuinely is a delete rather than an archive. The one piece
 * of state that outlives it is `projects.defaultViewId`, cleared here so the
 * project does not open on a tab that no longer exists.
 */
export const deleteView = mutation({
  args: { viewId: v.id('taskViews') },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'tasks');
    const view = await ctx.db.get(args.viewId);
    if (!view) throw new ConvexError('View not found');

    const scope = await assertOrgScope(ctx, view.organizationId);
    if (!canEditView(scope, view)) throw new ConvexError('You cannot delete that view');

    if (view.projectId) {
      const project = await ctx.db.get(view.projectId);
      if (project?.defaultViewId === args.viewId) {
        await ctx.db.patch(view.projectId, { defaultViewId: undefined, updatedAt: Date.now() });
      }
    }

    await ctx.db.delete(args.viewId);
  },
});

/**
 * Choose the tab a board opens on.
 *
 * Staff-only, and only for a `team` view: this decides what a colleague sees when
 * they land on the project, which is not a personal preference. A private view
 * cannot be the default for the obvious reason that nobody else could open it.
 *
 * The flag is mirrored onto `projects.defaultViewId` as well as onto the view
 * itself. Two places, deliberately: the view's own flag is what the tab strip
 * reads while it already has the list in hand, and the project's field is what a
 * server-rendered page reads before any view has loaded.
 */
export const setDefaultView = mutation({
  args: { viewId: v.id('taskViews') },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'tasks');
    const view = await ctx.db.get(args.viewId);
    if (!view) throw new ConvexError('View not found');

    const scope = await assertOrgStaff(ctx, view.organizationId);
    if (!scopeOwnsRecord(scope, view)) throw new ConvexError('View not found');
    if (view.visibility !== 'team') {
      throw new ConvexError('Share the view with the team before making it the default');
    }

    const siblings = await ctx.db
      .query('taskViews')
      .withIndex('by_org_project', (q) =>
        q.eq('organizationId', view.organizationId).eq('projectId', view.projectId),
      )
      .take(SMALL_LIST_CAP);

    const now = Date.now();
    for (const sibling of siblings) {
      if (sibling.isDefault && sibling._id !== args.viewId) {
        await ctx.db.patch(sibling._id, { isDefault: false, updatedAt: now });
      }
    }
    await ctx.db.patch(args.viewId, { isDefault: true, updatedAt: now });

    if (view.projectId) {
      await ctx.db.patch(view.projectId, { defaultViewId: args.viewId, updatedAt: now });
    }
  },
});

/**
 * Reorder the tab strip.
 *
 * Staff-only and dense-renumbered server-side, for the same reasons as
 * `taskFields.reorderFields`: the client sends the order it displayed, the server
 * decides the numbers, and a concurrent edit cannot leave two tabs claiming the
 * same position.
 *
 * Ids the caller cannot edit are skipped rather than refused — a staff member
 * dragging the strip should not be blocked by a colleague's private view sitting
 * in it.
 */
export const reorderViews = mutation({
  args: {
    viewIds: v.array(v.id('taskViews')),
    projectId: v.optional(v.id('projects')),
    organizationId: v.optional(v.id('organizations')),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'tasks');
    const scope = await assertOrgStaff(ctx, args.organizationId);
    const organizationId = scope.organizationId;
    if (!organizationId) throw new ConvexError('An organization is required');
    if (args.viewIds.length > SMALL_LIST_CAP) {
      throw new ConvexError('Too many views in one reorder');
    }

    const views = await ctx.db
      .query('taskViews')
      .withIndex('by_org_project', (q) =>
        q.eq('organizationId', organizationId).eq('projectId', args.projectId),
      )
      .take(SMALL_LIST_CAP);
    const byId = new Map<string, Doc<'taskViews'>>(views.map((view) => [String(view._id), view]));

    const now = Date.now();
    let order = 0;
    let moved = 0;
    for (const viewId of args.viewIds) {
      const view = byId.get(String(viewId));
      if (!view || !canEditView(scope, view)) continue;
      if (view.order !== order) {
        await ctx.db.patch(view._id, { order, updatedAt: now });
        moved += 1;
      }
      order += 1;
    }

    return { moved };
  },
});

/**
 * The view a project should open on, resolved server-side.
 *
 * Used by the project page, which needs the answer before the tab strip has
 * loaded. Falls through: the project's chosen default → the first `team` view →
 * nothing, meaning "render the built-in list".
 */
export const getDefaultView = query({
  args: { projectId: v.optional(v.id('projects')) },
  handler: async (ctx, args) => {
    const scope = await resolveOrgScope(ctx);
    if (!scope?.organizationId) return null;

    const projectId: Id<'projects'> | undefined = args.projectId;
    if (projectId) {
      const project = await ctx.db.get(projectId);
      if (!scopeOwnsRecord(scope, project)) return null;
      if (project?.defaultViewId) {
        const chosen = await ctx.db.get(project.defaultViewId);
        if (chosen && canSeeView(scope, chosen)) return chosen;
      }
    }

    const views = await ctx.db
      .query('taskViews')
      .withIndex('by_org_project', (q) =>
        q.eq('organizationId', scope.organizationId!).eq('projectId', projectId),
      )
      .take(SMALL_LIST_CAP);

    return (
      views
        .filter((view) => view.isDefault && canSeeView(scope, view))
        .sort((a, b) => a.order - b.order)[0] ?? null
    );
  },
});
