/**
 * Custom fields — the columns an organization invents for itself.
 *
 * *Contact*, *Amount owed*, *Category*, *Confidence Level*: a column is a
 * definition here and a value in `tasks.customFields`, keyed by this row's id.
 * That indirection is the whole reason renaming a column, recolouring one of its
 * options or archiving it entirely never touches a task.
 *
 * Two scopes, distinguished by whether `projectId` is set: a field with no
 * project is offered on every board in the organization, a field with one belongs
 * to that project alone. Both live in this table because they are the same thing
 * with a different audience, and because the grid has to merge them anyway.
 *
 * Nothing here writes a *value* — that is `tasks.updateTaskFields`, which routes
 * through `buildCustomFieldsPatch`. This module only defines what a value may be.
 */

import { ConvexError, v } from 'convex/values';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { SMALL_LIST_CAP } from './lib/limits';
import { assertModuleAccess } from './lib/entitlements';
import { assertOrgStaff, resolveOrgScope, scopeOwnsRecord, type OrgScope } from './lib/orgAccess';
import {
  assertFieldCapacity,
  listFieldsFor,
  nextFieldOrder,
  uniqueFieldKey,
} from './lib/taskConfig';
import {
  MAX_FIELD_NAME_LENGTH,
  MAX_OPTION_LABEL_LENGTH,
  assertValidFieldDef,
  clampColumnWidth,
  fieldConfigValidator,
  fieldHasOptions,
  fieldOptionValidator,
  fieldTypeValidator,
} from './lib/taskCustomFields';
import { sanitizeTitle } from './lib/sanitize';

type AnyCtx = QueryCtx | MutationCtx;

/**
 * Confirms the project is one the caller may configure, and returns it.
 *
 * A `projectId` from another organization would otherwise create a field there —
 * or, on the reading side, disclose that organization's column names.
 */
async function assertProjectInScope(
  ctx: AnyCtx,
  scope: OrgScope,
  projectId: Id<'projects'>,
): Promise<Doc<'projects'>> {
  const project = await ctx.db.get(projectId);
  if (!project) throw new ConvexError('Project not found');
  if (!scopeOwnsRecord(scope, project)) {
    throw new ConvexError('That project belongs to another organization');
  }
  return project;
}

// ── Reading ────────────────────────────────────────────────────────────────
/**
 * The columns available on one board: the organization's, plus the project's.
 *
 * Open to any authenticated member, not just staff — a column definition is not
 * sensitive, and every reader of the grid needs it to render a cell at all.
 * Degrades to `[]` rather than throwing, so a session that loses access shows an
 * empty board instead of an error boundary.
 *
 * @param includeArchived staff-only, for the "show archived columns" toggle in
 *   the field manager. Silently ignored for everyone else rather than refused,
 *   because the grid passes the flag through from a saved view.
 */
export const listFields = query({
  args: {
    projectId: v.optional(v.id('projects')),
    organizationId: v.optional(v.id('organizations')),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const scope = await resolveOrgScope(ctx, args.organizationId);
    if (!scope?.organizationId) return [];

    let projectId = args.projectId;
    if (projectId) {
      const project = await ctx.db.get(projectId);
      if (!scopeOwnsRecord(scope, project)) projectId = undefined;
    }

    return listFieldsFor(ctx, scope.organizationId, projectId, {
      includeArchived: !!args.includeArchived && scope.isStaff,
    });
  },
});

// ── Writing ────────────────────────────────────────────────────────────────
/**
 * A new column.
 *
 * Staff rather than admin-only, for the same reason as status sets: the person
 * running a board is the one who knows it needs an *Amount owed* column, and
 * routing that through an administrator is how the feature goes unused. The blast
 * radius is bounded either way — a field defines a cell, it grants no access.
 *
 * The `key` is derived server-side from the name and made unique within the
 * scope, because it ends up in CSV headers where a duplicate is an ambiguity
 * rather than a cosmetic problem. The client never sends one.
 */
export const createField = mutation({
  args: {
    name: v.string(),
    type: fieldTypeValidator,
    /** Absent makes the field organization-wide; set scopes it to one project. */
    projectId: v.optional(v.id('projects')),
    options: v.optional(v.array(fieldOptionValidator)),
    config: v.optional(fieldConfigValidator),
    required: v.optional(v.boolean()),
    width: v.optional(v.number()),
    organizationId: v.optional(v.id('organizations')),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'tasks');
    const scope = await assertOrgStaff(ctx, args.organizationId);
    const organizationId = scope.organizationId;
    if (!organizationId) throw new ConvexError('An organization is required');

    if (args.projectId) await assertProjectInScope(ctx, scope, args.projectId);

    const name = sanitizeTitle(args.name, MAX_FIELD_NAME_LENGTH);
    const definition = {
      name,
      type: args.type,
      options: normalizeOptions(args.options, args.type),
      config: args.config,
      required: args.required,
    };
    assertValidFieldDef(definition);

    // Capacity and key uniqueness are per scope: a project's columns do not
    // consume the organization's allowance, and two projects may each have a
    // "Category" without either having to be renamed.
    const siblings = await listScope(ctx, organizationId, args.projectId);
    assertFieldCapacity(siblings);

    const now = Date.now();
    const fieldId = await ctx.db.insert('taskFields', {
      organizationId,
      projectId: args.projectId,
      name,
      key: uniqueFieldKey(
        name,
        siblings.map((f) => f.key),
      ),
      type: args.type,
      options: definition.options,
      config: args.config,
      required: args.required,
      order: nextFieldOrder(siblings),
      width: args.width === undefined ? undefined : clampColumnWidth(args.width),
      isActive: true,
      createdBy: scope.caller._id,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert('auditLogs', {
      organizationId,
      userId: scope.caller._id,
      action: 'task_field_created',
      target: fieldId,
      details: JSON.stringify({ name, type: args.type, projectId: args.projectId ?? null }),
      createdAt: now,
    });

    return fieldId;
  },
});

/**
 * Rename a column, retype it, or change its options.
 *
 * ## Why the type can change but the options cannot simply be dropped
 *
 * Values are already stored against this definition. Renaming is free — the
 * values are keyed by id, not by name. Changing the *type*, though, can leave a
 * stored value that the new type would never have accepted: a `number` column
 * turned into a `select` holds `1500` where an option id belongs.
 *
 * Rather than rewrite every task (an unbounded write in a mutation that is
 * supposed to save a small form) or refuse the edit outright (the editor would
 * then need to explain why a column can never be corrected), the invalid values
 * are left in place and ignored on read: `formatFieldValue` and `optionOf` both
 * return empty for a value the field cannot interpret. The next edit of that cell
 * replaces it through the normal gate. The type change is recorded in the audit
 * log so the trail exists if somebody asks where a column's numbers went.
 *
 * Removing an *option* is the same story in miniature and gets the same
 * treatment: tasks holding the removed option render as empty and keep their raw
 * value until touched.
 */
export const updateField = mutation({
  args: {
    fieldId: v.id('taskFields'),
    name: v.optional(v.string()),
    type: v.optional(fieldTypeValidator),
    options: v.optional(v.array(fieldOptionValidator)),
    config: v.optional(fieldConfigValidator),
    required: v.optional(v.boolean()),
    width: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'tasks');
    const field = await ctx.db.get(args.fieldId);
    if (!field) throw new ConvexError('Column not found');

    const scope = await assertOrgStaff(ctx, field.organizationId);
    if (!scopeOwnsRecord(scope, field)) {
      throw new ConvexError('That column belongs to another organization');
    }

    const type = args.type ?? field.type;
    const name =
      args.name === undefined ? field.name : sanitizeTitle(args.name, MAX_FIELD_NAME_LENGTH);

    // Retyping to something that takes no options must drop the old ones, or the
    // definition fails its own validation on the next save.
    let options = field.options;
    if (args.options !== undefined) {
      options = normalizeOptions(args.options, type);
    } else if (!fieldHasOptions(type)) {
      options = undefined;
    }

    const definition = {
      name,
      type,
      options,
      config: args.config === undefined ? field.config : args.config,
      required: args.required === undefined ? field.required : args.required,
    };
    assertValidFieldDef(definition);

    const now = Date.now();
    await ctx.db.patch(args.fieldId, {
      name,
      type,
      options,
      config: definition.config,
      required: definition.required,
      ...(args.width === undefined ? {} : { width: clampColumnWidth(args.width) }),
      updatedAt: now,
    });

    await ctx.db.insert('auditLogs', {
      organizationId: field.organizationId,
      userId: scope.caller._id,
      action: 'task_field_updated',
      target: args.fieldId,
      details: JSON.stringify({
        name,
        typeChanged: type === field.type ? null : { from: field.type, to: type },
        optionCount: options?.length ?? 0,
      }),
      createdAt: now,
    });
  },
});

/**
 * Hide a column, or bring it back.
 *
 * Never a delete. The values on existing tasks are somebody's data, and dropping
 * the definition would orphan every one of them with no way to tell what they
 * meant — an *Amount owed* of 1500 is worthless once nobody remembers it was a
 * currency. Archiving is reversible; deletion is not, so the destructive door
 * stays closed.
 */
export const archiveField = mutation({
  args: { fieldId: v.id('taskFields'), isActive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'tasks');
    const field = await ctx.db.get(args.fieldId);
    if (!field) throw new ConvexError('Column not found');

    const scope = await assertOrgStaff(ctx, field.organizationId);
    if (!scopeOwnsRecord(scope, field)) {
      throw new ConvexError('That column belongs to another organization');
    }

    const isActive = args.isActive ?? false;
    if (isActive && !field.isActive) {
      // Restoring competes for the same allowance as creating.
      assertFieldCapacity(await listScope(ctx, field.organizationId, field.projectId));
    }

    const now = Date.now();
    await ctx.db.patch(args.fieldId, { isActive, updatedAt: now });

    await ctx.db.insert('auditLogs', {
      organizationId: field.organizationId,
      userId: scope.caller._id,
      action: isActive ? 'task_field_restored' : 'task_field_archived',
      target: args.fieldId,
      details: JSON.stringify({ name: field.name, type: field.type }),
      createdAt: now,
    });
  },
});

/**
 * Reorder columns within one scope.
 *
 * The client sends the ids in their new order and the server renumbers, rather
 * than the client sending `order` values it computed. Positions are then always
 * dense and always agree with what was on screen, and a dropped concurrent edit
 * cannot leave two columns claiming position 3.
 *
 * Ids from another scope are ignored rather than rejected: the grid shows
 * organization and project columns interleaved, so a drag legitimately produces a
 * list spanning both, and each scope renumbers its own.
 */
export const reorderFields = mutation({
  args: {
    fieldIds: v.array(v.id('taskFields')),
    projectId: v.optional(v.id('projects')),
    organizationId: v.optional(v.id('organizations')),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'tasks');
    const scope = await assertOrgStaff(ctx, args.organizationId);
    const organizationId = scope.organizationId;
    if (!organizationId) throw new ConvexError('An organization is required');
    if (args.fieldIds.length > SMALL_LIST_CAP) {
      throw new ConvexError('Too many columns in one reorder');
    }

    const fields = await listFieldsFor(ctx, organizationId, args.projectId, {
      includeArchived: true,
    });
    const byId = new Map(fields.map((f) => [String(f._id), f]));

    const now = Date.now();
    // Renumber per scope, so an interleaved list does not give a project field
    // the position of an organization one.
    const cursors = new Map<string, number>();
    let moved = 0;

    for (const fieldId of args.fieldIds) {
      const field = byId.get(String(fieldId));
      if (!field) continue;
      const scopeKey = field.projectId ?? 'org';
      const order = cursors.get(scopeKey) ?? 0;
      cursors.set(scopeKey, order + 1);
      if (field.order !== order) {
        await ctx.db.patch(field._id, { order, updatedAt: now });
        moved += 1;
      }
    }

    return { moved };
  },
});

// ── Helpers ────────────────────────────────────────────────────────────────
/**
 * One scope's fields, archived included.
 *
 * Distinct from {@link listFieldsFor}, which merges the organization's fields
 * into a project's. Capacity, key uniqueness and ordering all apply per scope, so
 * they need the narrower read.
 */
async function listScope(
  ctx: AnyCtx,
  organizationId: Id<'organizations'>,
  projectId: Id<'projects'> | undefined,
): Promise<Doc<'taskFields'>[]> {
  return ctx.db
    .query('taskFields')
    .withIndex('by_org_project', (q) =>
      q.eq('organizationId', organizationId).eq('projectId', projectId),
    )
    .take(SMALL_LIST_CAP);
}

/**
 * Options as they should be stored: trimmed labels, dense order, no options at
 * all for a type that does not take them.
 *
 * Ids are the client's to choose and are kept verbatim — they are what the stored
 * values point at, so regenerating one would blank that option out of every task
 * that had it selected. `assertValidFieldDef` checks their shape and uniqueness.
 */
function normalizeOptions(
  options: Doc<'taskFields'>['options'],
  type: Doc<'taskFields'>['type'],
): Doc<'taskFields'>['options'] {
  if (!fieldHasOptions(type)) return undefined;
  return (options ?? []).map((option, index) => ({
    id: option.id,
    label: sanitizeTitle(option.label, MAX_OPTION_LABEL_LENGTH),
    color: option.color,
    order: index,
  }));
}
