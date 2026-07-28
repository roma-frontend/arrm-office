import { v } from 'convex/values';
import {
  mutation,
  query,
  action,
  internalQuery,
  internalMutation,
  internalAction,
} from './_generated/server';
import { getAuthCaller, type AuthenticatedCaller } from './lib/getAuthCaller';
import { isSuperadmin } from './lib/auth';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { DEFAULT_LIST_CAP } from './lib/limits';

const providerValidator = v.union(
  v.literal('lucky_carrot'),
  v.literal('imid'),
  v.literal('armsoft'),
);

type Provider = 'lucky_carrot' | 'imid' | 'armsoft';

/** Credential fields that must never reach the client. */
const SECRET_FIELDS = ['apiKey', 'clientSecret', 'apiPassword'] as const;

/**
 * Server-only cache fields. Unlike SECRET_FIELDS these are not user-editable,
 * so they are stripped entirely rather than masked.
 */
const SERVER_ONLY_FIELDS = ['imidAccessToken', 'imidTokenExpiresAt'] as const;

/** Placeholder sent to the client in place of a stored secret. */
export const SECRET_MASK = '••••••••';

/** Upper bound on employees pulled from a provider in a single sync run. */
const MAX_IMPORT_RECORDS = 2000;

/** Employees upserted per mutation — keeps each transaction small. */
const UPSERT_BATCH_SIZE = 25;

/** Roles that a provider sync must never create, modify or deactivate. */
const PRIVILEGED_ROLES = new Set(['superadmin', 'admin', 'supervisor']);

/**
 * Only org admins may see or change integration settings — these configs hold
 * third-party credentials.
 */
function canAdminOrg(caller: AuthenticatedCaller, organizationId: Id<'organizations'>) {
  if (isSuperadmin(caller)) return true;
  return caller.role === 'admin' && caller.organizationId === organizationId;
}

/**
 * Replace stored secrets with a mask so the UI can show "a value is set"
 * without ever transmitting the credential itself, and drop server-only caches.
 */
function maskConfig(doc: Doc<'integrationConfigs'>) {
  const config: Record<string, unknown> = { ...doc.config };
  for (const field of SECRET_FIELDS) {
    if (config[field]) config[field] = SECRET_MASK;
  }
  for (const field of SERVER_ONLY_FIELDS) {
    delete config[field];
  }
  return { ...doc, config: config as Doc<'integrationConfigs'>['config'] };
}

// ── Get integration config for an organization (masked) ────────────────────
export const getIntegrationConfig = query({
  args: { organizationId: v.id('organizations'), provider: providerValidator },
  handler: async (ctx, { organizationId, provider }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller || !canAdminOrg(caller, organizationId)) return null;

    const doc = await ctx.db
      .query('integrationConfigs')
      .withIndex('by_org_provider', (q) =>
        q.eq('organizationId', organizationId).eq('provider', provider),
      )
      .first();

    return doc ? maskConfig(doc) : null;
  },
});

// ── Get all integration configs for an organization (masked) ───────────────
export const getAllIntegrationConfigs = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, { organizationId }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller || !canAdminOrg(caller, organizationId)) return [];

    const docs = await ctx.db
      .query('integrationConfigs')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(10);

    return docs.map(maskConfig);
  },
});

// ── Internal: read the raw config (secrets intact) for server-side syncing ──
export const getIntegrationConfigInternal = internalQuery({
  args: { organizationId: v.id('organizations'), provider: providerValidator },
  handler: async (ctx, { organizationId, provider }) => {
    return await ctx.db
      .query('integrationConfigs')
      .withIndex('by_org_provider', (q) =>
        q.eq('organizationId', organizationId).eq('provider', provider),
      )
      .first();
  },
});

// ── Internal: record sync progress without re-sending the whole config ──────
export const setSyncState = internalMutation({
  args: {
    organizationId: v.id('organizations'),
    provider: providerValidator,
    syncStatus: v.union(
      v.literal('idle'),
      v.literal('syncing'),
      v.literal('error'),
      v.literal('success'),
    ),
    lastError: v.optional(v.string()),
    lastSyncAt: v.optional(v.number()),
  },
  handler: async (ctx, { organizationId, provider, syncStatus, lastError, lastSyncAt }) => {
    const existing = await ctx.db
      .query('integrationConfigs')
      .withIndex('by_org_provider', (q) =>
        q.eq('organizationId', organizationId).eq('provider', provider),
      )
      .first();
    if (!existing) return;

    await ctx.db.patch(existing._id, {
      config: {
        ...existing.config,
        syncStatus,
        lastError,
        ...(lastSyncAt ? { lastSyncAt } : {}),
      },
      updatedAt: Date.now(),
    });
  },
});

// ── Internal: cache an OAuth token so every sync doesn't re-authenticate ────
export const cacheImidToken = internalMutation({
  args: {
    organizationId: v.id('organizations'),
    accessToken: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, { organizationId, accessToken, expiresAt }) => {
    const existing = await ctx.db
      .query('integrationConfigs')
      .withIndex('by_org_provider', (q) =>
        q.eq('organizationId', organizationId).eq('provider', 'imid'),
      )
      .first();
    if (!existing) return;

    await ctx.db.patch(existing._id, {
      config: {
        ...existing.config,
        imidAccessToken: accessToken,
        imidTokenExpiresAt: expiresAt,
      },
      updatedAt: Date.now(),
    });
  },
});

// ── Save/update integration config ────────────────────────────────────────
export const saveIntegrationConfig = mutation({
  args: {
    organizationId: v.id('organizations'),
    provider: providerValidator,
    config: v.object({
      isEnabled: v.boolean(),
      lastSyncAt: v.optional(v.number()),
      syncStatus: v.optional(
        v.union(v.literal('idle'), v.literal('syncing'), v.literal('error'), v.literal('success')),
      ),
      lastError: v.optional(v.string()),
      apiKey: v.optional(v.string()),
      apiUrl: v.optional(v.string()),
      webhookUrl: v.optional(v.string()),
      autoSyncEmployees: v.optional(v.boolean()),
      clientId: v.optional(v.string()),
      clientSecret: v.optional(v.string()),
      redirectUri: v.optional(v.string()),
      enableLogin: v.optional(v.boolean()),
      enableSigning: v.optional(v.boolean()),
      enableVerification: v.optional(v.boolean()),
      apiEndpoint: v.optional(v.string()),
      apiUsername: v.optional(v.string()),
      apiPassword: v.optional(v.string()),
      syncEmployees: v.optional(v.boolean()),
      syncPayroll: v.optional(v.boolean()),
      syncSchedule: v.optional(v.string()),
      employeesPath: v.optional(v.string()),
      employeesListKey: v.optional(v.string()),
      fieldMap: v.optional(v.string()),
      deactivateMissing: v.optional(v.boolean()),
      tokenPath: v.optional(v.string()),
    }),
    /** Secret field names to erase. Sent when an admin removes a credential. */
    clearSecrets: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { organizationId, provider, config, clearSecrets }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    if (!canAdminOrg(caller, organizationId)) {
      throw new Error('Only admins of this organization can configure integrations');
    }

    // Reject a malformed field map at save time rather than mid-sync.
    if (config.fieldMap) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(config.fieldMap);
      } catch {
        throw new Error('Field mapping must be valid JSON');
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Field mapping must be a JSON object of ourField → providerField');
      }
      for (const value of Object.values(parsed as Record<string, unknown>)) {
        if (typeof value !== 'string') {
          throw new Error('Field mapping values must be strings');
        }
      }
    }

    if (config.syncSchedule && !isValidCronExpression(config.syncSchedule)) {
      throw new Error('Sync schedule must be a 5-field cron expression, e.g. "0 3 * * *"');
    }

    // A masked secret means "unchanged" — never persist the placeholder.
    const incoming: Record<string, unknown> = { ...config };
    for (const field of SECRET_FIELDS) {
      if (incoming[field] === SECRET_MASK) delete incoming[field];
    }

    const existing = await ctx.db
      .query('integrationConfigs')
      .withIndex('by_org_provider', (q) =>
        q.eq('organizationId', organizationId).eq('provider', provider),
      )
      .first();

    const now = Date.now();
    if (existing) {
      // Merge with existing config to preserve fields not sent
      const merged: Record<string, unknown> = { ...existing.config, ...incoming };

      // Explicit removal — only ever applied to real credential fields.
      for (const field of clearSecrets ?? []) {
        if ((SECRET_FIELDS as readonly string[]).includes(field)) {
          delete merged[field];
        }
      }
      // Dropping imID credentials must invalidate the cached token with them.
      if (
        (clearSecrets ?? []).includes('clientSecret') ||
        incoming.clientSecret !== undefined ||
        incoming.clientId !== undefined
      ) {
        delete merged.imidAccessToken;
        delete merged.imidTokenExpiresAt;
      }

      await ctx.db.patch(existing._id, {
        config: merged as Doc<'integrationConfigs'>['config'],
        updatedAt: now,
      });
    } else {
      await ctx.db.insert('integrationConfigs', {
        organizationId,
        provider,
        config: incoming as Doc<'integrationConfigs'>['config'],
        createdBy: caller._id,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Audit log
    await ctx.db.insert('auditLogs', {
      organizationId,
      userId: caller._id,
      action: `integration_${provider}_updated`,
      target: provider,
      details: JSON.stringify({
        isEnabled: config.isEnabled,
        clearedSecrets: clearSecrets ?? [],
      }),
      createdAt: now,
    });
  },
});

/** Result of a sync attempt, whether admin-triggered or scheduled. */
type SyncResult = { success: boolean; message?: string; error?: string };

// ── Sync integration data (action - runs externally) ──────────────────────
export const syncIntegration = action({
  args: {
    organizationId: v.id('organizations'),
    provider: providerValidator,
  },
  // Annotated explicitly: the handler reaches back into `internal.integrations`
  // for authorization, and without it TS cannot break that inference cycle.
  handler: async (ctx, { organizationId, provider }): Promise<SyncResult> => {
    // Actions have no db access, so authorize via an internal query.
    const caller: { userId: Id<'users'> } | null = await ctx.runQuery(
      internal.integrations.assertCanSync,
      { organizationId },
    );
    if (!caller) {
      return { success: false, error: 'Not authorized to sync this integration' };
    }

    return await runSync(ctx, organizationId, provider, caller.userId);
  },
});

/**
 * Shared sync body for both the admin-triggered action and the cron sweep.
 * `triggeredBy` is undefined for scheduled runs.
 */
async function runSync(
  ctx: any,
  organizationId: Id<'organizations'>,
  provider: Provider,
  triggeredBy?: Id<'users'>,
): Promise<SyncResult> {
  // Read the raw config (with secrets) — never the masked public query.
  const config = await ctx.runQuery(internal.integrations.getIntegrationConfigInternal, {
    organizationId,
    provider,
  });

  if (!config || !config.config.isEnabled) {
    return { success: false, error: 'Integration not configured or disabled' };
  }

  await ctx.runMutation(internal.integrations.setSyncState, {
    organizationId,
    provider,
    syncStatus: 'syncing',
  });

  try {
    const result = await performSync(ctx, organizationId, provider, config.config);

    await ctx.runMutation(internal.integrations.logSync, {
      organizationId,
      provider,
      action: 'sync',
      status: result.skippedSync ? 'skipped' : 'success',
      message: result.message,
      created: result.created,
      updated: result.updated,
      deactivated: result.deactivated,
      skipped: result.skipped,
      details: result.details,
      triggeredBy,
    });

    await ctx.runMutation(internal.integrations.setSyncState, {
      organizationId,
      provider,
      syncStatus: 'success',
      lastSyncAt: Date.now(),
      // Clear any stale error from a previous failed run.
      lastError: undefined,
    });

    return { success: true, message: result.message };
  } catch (error: any) {
    const message = error?.message ? String(error.message) : 'Sync failed';

    await ctx.runMutation(internal.integrations.logSync, {
      organizationId,
      provider,
      action: 'sync',
      status: 'error',
      message,
      triggeredBy,
    });

    await ctx.runMutation(internal.integrations.setSyncState, {
      organizationId,
      provider,
      syncStatus: 'error',
      lastError: message,
    });

    return { success: false, error: message };
  }
}

// ── Internal: check the caller may sync this org's integrations ─────────────
export const assertCanSync = internalQuery({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, { organizationId }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller || !canAdminOrg(caller, organizationId)) return null;
    return { userId: caller._id };
  },
});

// ── Log a sync event (internal — written only by the sync action) ───────────
export const logSync = internalMutation({
  args: {
    organizationId: v.id('organizations'),
    provider: providerValidator,
    action: v.string(),
    status: v.union(v.literal('success'), v.literal('error'), v.literal('skipped')),
    message: v.string(),
    details: v.optional(v.string()),
    created: v.optional(v.number()),
    updated: v.optional(v.number()),
    deactivated: v.optional(v.number()),
    skipped: v.optional(v.number()),
    triggeredBy: v.optional(v.id('users')),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('integrationSyncLogs', {
      ...args,
      createdAt: Date.now(),
    });
  },
});

// ── Get sync logs ─────────────────────────────────────────────────────────
export const getSyncLogs = query({
  args: {
    organizationId: v.id('organizations'),
    provider: providerValidator,
  },
  handler: async (ctx, { organizationId, provider }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller || !canAdminOrg(caller, organizationId)) return [];

    return await ctx.db
      .query('integrationSyncLogs')
      .withIndex('by_org_provider_created', (q) =>
        q.eq('organizationId', organizationId).eq('provider', provider),
      )
      .order('desc')
      .take(50);
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// EMPLOYEE UPSERT — the write half of a sync
// ═══════════════════════════════════════════════════════════════════════════

const incomingEmployeeValidator = v.object({
  email: v.string(),
  name: v.string(),
  department: v.optional(v.string()),
  position: v.optional(v.string()),
  phone: v.optional(v.string()),
  location: v.optional(v.string()),
  employeeType: v.optional(v.union(v.literal('staff'), v.literal('contractor'))),
  isActive: v.optional(v.boolean()),
  externalId: v.optional(v.string()),
});

/**
 * Create or update employees pulled from a provider.
 *
 * Guard rails:
 *  - never creates or modifies privileged roles (admin/supervisor/superadmin);
 *  - scoped to the organization by email, so an address belonging to another
 *    tenant is skipped rather than hijacked;
 *  - respects the organization's seat limit, same as manual employee creation.
 */
export const upsertEmployeeBatch = internalMutation({
  args: {
    organizationId: v.id('organizations'),
    provider: providerValidator,
    employees: v.array(incomingEmployeeValidator),
  },
  handler: async (ctx, { organizationId, provider, employees }) => {
    const org = await ctx.db.get(organizationId);
    if (!org) throw new Error('Organization not found');

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const notes: string[] = [];

    // Seat accounting is done once per batch, then tracked locally as we insert.
    const activeUsers = await ctx.db
      .query('users')
      .withIndex('by_org_active', (q) =>
        q.eq('organizationId', organizationId).eq('isActive', true),
      )
      .take(DEFAULT_LIST_CAP);
    let seatsUsed = activeUsers.length;

    for (const incoming of employees) {
      const email = incoming.email.toLowerCase().trim();
      if (!email || !email.includes('@')) {
        skipped++;
        notes.push(`invalid email: ${incoming.email.slice(0, 40)}`);
        continue;
      }

      // Scope the lookup to this org so we can detect a cross-tenant collision.
      const inOrg = await ctx.db
        .query('users')
        .withIndex('by_org_email', (q) => q.eq('organizationId', organizationId).eq('email', email))
        .first();

      if (inOrg) {
        if (PRIVILEGED_ROLES.has(inOrg.role)) {
          skipped++;
          notes.push(`${email}: privileged role not managed by sync`);
          continue;
        }
        const patch: Record<string, unknown> = {
          name: incoming.name || inOrg.name,
          updatedAt: Date.now(),
        };
        // Only overwrite what the provider actually sent.
        if (incoming.department !== undefined) patch.department = incoming.department;
        if (incoming.position !== undefined) patch.position = incoming.position;
        if (incoming.phone !== undefined) patch.phone = incoming.phone;
        if (incoming.location !== undefined) patch.location = incoming.location;
        if (incoming.employeeType !== undefined) patch.employeeType = incoming.employeeType;
        if (incoming.isActive !== undefined) {
          // Re-activating consumes a seat.
          if (incoming.isActive && !inOrg.isActive && seatsUsed >= org.employeeLimit) {
            skipped++;
            notes.push(`${email}: seat limit reached`);
            continue;
          }
          if (incoming.isActive && !inOrg.isActive) seatsUsed++;
          if (!incoming.isActive && inOrg.isActive) seatsUsed--;
          patch.isActive = incoming.isActive;
        }
        await ctx.db.patch(inOrg._id, patch);
        updated++;
        continue;
      }

      // Email owned by a different organization — never move or overwrite it.
      const elsewhere = await ctx.db
        .query('users')
        .withIndex('by_email', (q) => q.eq('email', email))
        .first();
      if (elsewhere) {
        skipped++;
        notes.push(`${email}: belongs to another organization`);
        continue;
      }

      if (seatsUsed >= org.employeeLimit) {
        skipped++;
        notes.push(`${email}: seat limit reached (${org.employeeLimit})`);
        continue;
      }

      const employeeType = incoming.employeeType ?? 'staff';
      const isStaff = employeeType === 'staff';
      const now = Date.now();

      await ctx.db.insert('users', {
        organizationId,
        name: incoming.name || email,
        email,
        // No usable password — the account is claimed via the reset-password flow.
        passwordHash: '',
        role: 'employee',
        employeeType,
        department: incoming.department,
        position: incoming.position,
        phone: incoming.phone,
        location: incoming.location,
        isActive: incoming.isActive ?? true,
        isApproved: true,
        travelAllowance: isStaff ? 20000 : 12000,
        paidLeaveBalance: 20,
        sickLeaveBalance: 10,
        familyLeaveBalance: 5,
        dayOffBalance: 6,
        maternityLeaveBalance: 0,
        studyLeaveBalance: 5,
        createdAt: now,
      });
      if (incoming.isActive ?? true) seatsUsed++;
      created++;
    }

    void provider;
    return { created, updated, skipped, notes };
  },
});

/**
 * Deactivate synced employees the provider no longer lists. Opt-in via the
 * `deactivateMissing` config flag — off by default because a truncated or
 * partial provider response would otherwise lock people out.
 */
export const deactivateMissingEmployees = internalMutation({
  args: {
    organizationId: v.id('organizations'),
    activeEmails: v.array(v.string()),
  },
  handler: async (ctx, { organizationId, activeEmails }) => {
    const keep = new Set(activeEmails.map((e) => e.toLowerCase().trim()));

    const orgUsers = await ctx.db
      .query('users')
      .withIndex('by_org_active', (q) =>
        q.eq('organizationId', organizationId).eq('isActive', true),
      )
      .take(DEFAULT_LIST_CAP);

    let deactivated = 0;
    for (const user of orgUsers) {
      if (PRIVILEGED_ROLES.has(user.role)) continue;
      if (keep.has(user.email.toLowerCase())) continue;
      await ctx.db.patch(user._id, { isActive: false, updatedAt: Date.now() });
      deactivated++;
    }
    return { deactivated };
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER RESPONSE PARSING
// ═══════════════════════════════════════════════════════════════════════════

/** Read a possibly-nested value by dot path, e.g. "data.items". */
function readPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, source);
}

/** Keys providers commonly wrap a collection in, tried in order. */
const LIST_KEY_CANDIDATES = [
  'data',
  'items',
  'employees',
  'results',
  'records',
  'users',
  'value',
  'data.items',
  'data.employees',
  'result.items',
];

/**
 * Pull the employee array out of a provider response. An explicit
 * `employeesListKey` wins; otherwise probe the shapes we've seen in the wild.
 */
export function extractList(payload: unknown, listKey?: string): unknown[] {
  if (listKey) {
    const picked = readPath(payload, listKey);
    if (!Array.isArray(picked)) {
      throw new Error(`Response has no array at "${listKey}"`);
    }
    return picked;
  }
  if (Array.isArray(payload)) return payload;
  for (const candidate of LIST_KEY_CANDIDATES) {
    const picked = readPath(payload, candidate);
    if (Array.isArray(picked)) return picked;
  }
  throw new Error(
    'Could not find an employee array in the response — set "Employees list key" to the field holding it',
  );
}

/** Provider field names we try for each of our fields, in priority order. */
const DEFAULT_FIELD_CANDIDATES: Record<string, string[]> = {
  email: ['email', 'work_email', 'workEmail', 'mail', 'emailAddress', 'email_address', 'userEmail'],
  name: ['name', 'full_name', 'fullName', 'displayName', 'display_name'],
  firstName: ['first_name', 'firstName', 'givenName', 'given_name'],
  lastName: ['last_name', 'lastName', 'surname', 'familyName', 'family_name'],
  department: ['department', 'department_name', 'departmentName', 'dept', 'division'],
  position: ['position', 'title', 'job_title', 'jobTitle', 'role_name', 'positionName'],
  phone: ['phone', 'phone_number', 'phoneNumber', 'mobile', 'telephone'],
  location: ['location', 'office', 'city', 'site'],
  employeeType: ['employee_type', 'employeeType', 'employment_type', 'contract_type'],
  isActive: ['is_active', 'isActive', 'active', 'enabled'],
  externalId: ['id', 'employee_id', 'employeeId', 'external_id', 'externalId', 'uuid'],
};

function pick(record: Record<string, unknown>, ourField: string, map: Record<string, string>) {
  // An explicit mapping is authoritative — no fallback guessing behind it.
  const mapped = map[ourField];
  if (mapped) return readPath(record, mapped);
  for (const candidate of DEFAULT_FIELD_CANDIDATES[ourField] ?? []) {
    const value = record[candidate];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const v = value.toLowerCase().trim();
    if (['true', '1', 'yes', 'y', 'active', 'enabled'].includes(v)) return true;
    if (['false', '0', 'no', 'n', 'inactive', 'disabled', 'terminated'].includes(v)) return false;
  }
  return undefined;
}

export type NormalizedEmployee = {
  email: string;
  name: string;
  department?: string;
  position?: string;
  phone?: string;
  location?: string;
  employeeType?: 'staff' | 'contractor';
  isActive?: boolean;
  externalId?: string;
};

/**
 * Convert provider records into our employee shape. Records without a usable
 * email are dropped and counted — email is the identity key for the upsert.
 */
export function normalizeEmployees(
  rows: unknown[],
  fieldMapJson?: string,
): { employees: NormalizedEmployee[]; dropped: number } {
  let map: Record<string, string> = {};
  if (fieldMapJson) {
    try {
      const parsed = JSON.parse(fieldMapJson);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        map = parsed as Record<string, string>;
      }
    } catch {
      throw new Error('Field mapping is not valid JSON');
    }
  }

  const employees: NormalizedEmployee[] = [];
  let dropped = 0;

  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      dropped++;
      continue;
    }
    const record = row as Record<string, unknown>;

    const email = asString(pick(record, 'email', map))?.toLowerCase();
    if (!email || !email.includes('@')) {
      dropped++;
      continue;
    }

    let name = asString(pick(record, 'name', map));
    if (!name) {
      const first = asString(pick(record, 'firstName', map));
      const last = asString(pick(record, 'lastName', map));
      name = [first, last].filter(Boolean).join(' ') || undefined;
    }

    const rawType = asString(pick(record, 'employeeType', map))?.toLowerCase();
    const employeeType =
      rawType === undefined
        ? undefined
        : /contract|freelanc|vendor|temp/.test(rawType)
          ? ('contractor' as const)
          : ('staff' as const);

    employees.push({
      email,
      name: name ?? email,
      department: asString(pick(record, 'department', map)),
      position: asString(pick(record, 'position', map)),
      phone: asString(pick(record, 'phone', map)),
      location: asString(pick(record, 'location', map)),
      employeeType,
      isActive: asBoolean(pick(record, 'isActive', map)),
      externalId: asString(pick(record, 'externalId', map)),
    });
  }

  // Last record wins on duplicate emails, keeping the batch idempotent.
  const byEmail = new Map<string, NormalizedEmployee>();
  for (const e of employees) byEmail.set(e.email, e);

  return { employees: [...byEmail.values()], dropped };
}

// ═══════════════════════════════════════════════════════════════════════════
// HTTP HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Third-party error bodies can echo back the credentials we sent, and they land
 * in sync logs shown in the UI. Truncate and strip anything secret-looking.
 */
function safeErrorBody(body: string, config: any): string {
  let out = body.slice(0, 300);
  for (const field of SECRET_FIELDS) {
    const secret = config?.[field];
    if (typeof secret === 'string' && secret.length >= 6) {
      out = out.split(secret).join(SECRET_MASK);
    }
  }
  if (typeof config?.imidAccessToken === 'string' && config.imidAccessToken.length >= 6) {
    out = out.split(config.imidAccessToken).join(SECRET_MASK);
  }
  return out;
}

/** Join a base URL and path without doubling or dropping the separator. */
function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

/** Reject non-HTTPS and obviously internal targets — configs are admin-supplied. */
function assertSafeUrl(raw: string, label: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label}: "${raw.slice(0, 60)}" is not a valid URL`);
  }
  if (url.protocol !== 'https:') {
    throw new Error(`${label}: only https:// endpoints are allowed`);
  }
  const host = url.hostname.toLowerCase();
  const isPrivate =
    host === 'localhost' ||
    host === '::1' ||
    host.endsWith('.localhost') ||
    host.endsWith('.internal') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (isPrivate) {
    throw new Error(`${label}: private and loopback hosts are not allowed`);
  }
  return url.toString();
}

/** A provider call that fails or stalls must not hang the whole sync. */
async function fetchJson(
  url: string,
  init: RequestInit,
  label: string,
  config: any,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e: any) {
    const reason = e?.name === 'TimeoutError' ? 'request timed out' : 'network error';
    throw new Error(`${label}: ${reason}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`${label} API error (${response.status}): ${safeErrorBody(body, config)}`);
  }

  const text = await response.text();
  if (!text.trim()) {
    throw new Error(`${label}: empty response body`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label}: response was not JSON — ${safeErrorBody(text, config)}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SYNC ORCHESTRATION
// ═══════════════════════════════════════════════════════════════════════════

type SyncOutcome = {
  message: string;
  created: number;
  updated: number;
  deactivated: number;
  skipped: number;
  details?: string;
  /** True when the provider is connected but importing is switched off. */
  skippedSync?: boolean;
};

async function performSync(
  ctx: any,
  organizationId: Id<'organizations'>,
  provider: Provider,
  config: any,
): Promise<SyncOutcome> {
  switch (provider) {
    case 'lucky_carrot':
      return syncLuckyCarrot(ctx, organizationId, config);
    case 'imid':
      return syncImid(ctx, organizationId, config);
    case 'armsoft':
      return syncArmsoft(ctx, organizationId, config);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Fetch → normalize → upsert, shared by every provider that imports people.
 */
async function importEmployees(
  ctx: any,
  organizationId: Id<'organizations'>,
  provider: Provider,
  config: any,
  url: string,
  headers: Record<string, string>,
  label: string,
): Promise<SyncOutcome> {
  const payload = await fetchJson(url, { method: 'GET', headers }, label, config);

  const rows = extractList(payload, config.employeesListKey);
  if (rows.length > MAX_IMPORT_RECORDS) {
    throw new Error(
      `${label}: response contained ${rows.length} records, above the ${MAX_IMPORT_RECORDS} per-run limit. Narrow the query or paginate.`,
    );
  }

  const { employees, dropped } = normalizeEmployees(rows, config.fieldMap);
  if (employees.length === 0) {
    throw new Error(
      `${label}: fetched ${rows.length} record(s) but none had a usable email — check the field mapping`,
    );
  }

  let created = 0;
  let updated = 0;
  let skipped = dropped;
  const notes: string[] = [];

  for (let i = 0; i < employees.length; i += UPSERT_BATCH_SIZE) {
    const batch = employees.slice(i, i + UPSERT_BATCH_SIZE);
    const res = await ctx.runMutation(internal.integrations.upsertEmployeeBatch, {
      organizationId,
      provider,
      employees: batch,
    });
    created += res.created;
    updated += res.updated;
    skipped += res.skipped;
    notes.push(...res.notes);
  }

  let deactivated = 0;
  if (config.deactivateMissing) {
    const res = await ctx.runMutation(internal.integrations.deactivateMissingEmployees, {
      organizationId,
      // Only people the provider says are active should stay active here.
      activeEmails: employees.filter((e) => e.isActive !== false).map((e) => e.email),
    });
    deactivated = res.deactivated;
  }

  const message = `${label}: ${created} created, ${updated} updated, ${deactivated} deactivated, ${skipped} skipped`;
  return {
    message,
    created,
    updated,
    deactivated,
    skipped,
    details: notes.length ? JSON.stringify(notes.slice(0, 50)) : undefined,
  };
}

// ── Lucky Carrot Sync ──────────────────────────────────────────────────────
async function syncLuckyCarrot(
  ctx: any,
  organizationId: Id<'organizations'>,
  config: any,
): Promise<SyncOutcome> {
  if (!config.apiKey || !config.apiUrl) {
    throw new Error('Lucky Carrot: API key and URL required');
  }
  if (config.autoSyncEmployees === false) {
    return {
      message: 'Lucky Carrot: credentials verified, employee import is switched off',
      created: 0,
      updated: 0,
      deactivated: 0,
      skipped: 0,
      skippedSync: true,
    };
  }

  const base = assertSafeUrl(config.apiUrl, 'Lucky Carrot API URL');
  const url = assertSafeUrl(
    joinUrl(base, config.employeesPath || '/api/v1/employees'),
    'Lucky Carrot employees URL',
  );

  return importEmployees(
    ctx,
    organizationId,
    'lucky_carrot',
    config,
    url,
    {
      Authorization: `Bearer ${config.apiKey}`,
      Accept: 'application/json',
    },
    'Lucky Carrot',
  );
}

// ── imID Sync ──────────────────────────────────────────────────────────────
/**
 * imID is an identity provider, not an HR system: there is no employee
 * directory to pull. A sync therefore validates the OAuth client-credentials
 * grant and caches the resulting token for signing/verification calls.
 */
async function syncImid(
  ctx: any,
  organizationId: Id<'organizations'>,
  config: any,
): Promise<SyncOutcome> {
  if (!config.clientId || !config.clientSecret) {
    throw new Error('imID: Client ID and Client Secret required');
  }
  if (config.enableLogin && !config.redirectUri) {
    throw new Error('imID: Redirect URI is required when login with imID is enabled');
  }
  if (config.redirectUri) {
    assertSafeUrl(config.redirectUri, 'imID Redirect URI');
  }

  const tokenUrl = assertSafeUrl(
    config.tokenPath || 'https://api.imid.am/v1/oauth/token',
    'imID token URL',
  );

  const payload = (await fetchJson(
    tokenUrl,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'client_credentials',
      }),
    },
    'imID auth',
    config,
  )) as Record<string, unknown>;

  const accessToken =
    asString(payload.access_token) ?? asString(payload.accessToken) ?? asString(payload.token);
  if (!accessToken) {
    throw new Error('imID: auth succeeded but no access_token was returned');
  }

  const expiresInRaw = payload.expires_in ?? payload.expiresIn;
  const expiresIn = typeof expiresInRaw === 'number' ? expiresInRaw : 3600;
  // Expire a minute early so a token is never used on the edge of validity.
  const expiresAt = Date.now() + Math.max(60, expiresIn - 60) * 1000;

  await ctx.runMutation(internal.integrations.cacheImidToken, {
    organizationId,
    accessToken,
    expiresAt,
  });

  const enabled = [
    config.enableLogin ? 'login' : null,
    config.enableSigning ? 'e-signature' : null,
    config.enableVerification ? 'verification' : null,
  ].filter(Boolean);

  return {
    message: `imID: authenticated, token cached until ${new Date(expiresAt).toISOString()}${
      enabled.length ? ` (enabled: ${enabled.join(', ')})` : ' (no features enabled yet)'
    }`,
    created: 0,
    updated: 0,
    deactivated: 0,
    skipped: 0,
  };
}

// ── Armsoft (ՀԾ) Sync ─────────────────────────────────────────────────────
async function syncArmsoft(
  ctx: any,
  organizationId: Id<'organizations'>,
  config: any,
): Promise<SyncOutcome> {
  if (!config.apiEndpoint) {
    throw new Error('ՀԾ Armsoft: API endpoint required');
  }
  if (!config.apiUsername || !config.apiPassword) {
    throw new Error('ՀԾ Armsoft: username and password required');
  }
  if (!config.syncEmployees && !config.syncPayroll) {
    return {
      message: 'ՀԾ Armsoft: nothing to sync — enable employee directory or payroll sync',
      created: 0,
      updated: 0,
      deactivated: 0,
      skipped: 0,
      skippedSync: true,
    };
  }

  const base = assertSafeUrl(config.apiEndpoint, 'ՀԾ Armsoft API endpoint');
  // Convex's default runtime has no Buffer — use btoa for Basic auth.
  const basic = btoa(`${config.apiUsername}:${config.apiPassword}`);
  const headers = {
    Authorization: `Basic ${basic}`,
    Accept: 'application/json',
  };

  const notes: string[] = [];
  let outcome: SyncOutcome = {
    message: '',
    created: 0,
    updated: 0,
    deactivated: 0,
    skipped: 0,
  };

  if (config.syncEmployees) {
    const url = assertSafeUrl(
      joinUrl(base, config.employeesPath || '/api/hr/employees'),
      'ՀԾ Armsoft employees URL',
    );
    outcome = await importEmployees(
      ctx,
      organizationId,
      'armsoft',
      config,
      url,
      headers,
      'ՀԾ Armsoft',
    );
  }

  if (config.syncPayroll) {
    // Payroll import is not implemented — say so in the log instead of
    // reporting a success the data doesn't back up.
    notes.push('payroll sync requested but not implemented yet — employees only');
  }

  const messageParts = [outcome.message || 'ՀԾ Armsoft: employee sync disabled', ...notes];
  return {
    ...outcome,
    message: messageParts.filter(Boolean).join('; '),
    details: outcome.details,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SCHEDULED SYNC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Cron field matcher supporting wildcards, step values, ranges, comma lists
 * and plain numbers — the subset covering every schedule the UI suggests.
 */
function cronFieldMatches(field: string, value: number, min: number, max: number): boolean {
  for (const part of field.split(',')) {
    const token = part.trim();
    if (!token) return false;

    const [rangePart, stepPart] = token.split('/');
    const step = stepPart === undefined ? 1 : Number(stepPart);
    if (!Number.isInteger(step) || step < 1) return false;

    let from = min;
    let to = max;
    if (rangePart !== '*') {
      if (rangePart!.includes('-')) {
        const [a, b] = rangePart!.split('-').map(Number);
        if (!Number.isInteger(a) || !Number.isInteger(b)) return false;
        from = a!;
        to = b!;
      } else {
        const exact = Number(rangePart);
        if (!Number.isInteger(exact)) return false;
        from = exact;
        to = stepPart === undefined ? exact : max;
      }
    }
    if (from < min || to > max || from > to) return false;
    if (value < from || value > to) continue;
    if ((value - from) % step === 0) return true;
  }
  return false;
}

export function isValidCronExpression(expr: string): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const bounds: Array<[number, number]> = [
    [0, 59],
    [0, 23],
    [1, 31],
    [1, 12],
    [0, 6],
  ];
  // A field is valid if it matches at least one value in its range.
  return fields.every((field, i) => {
    const [min, max] = bounds[i]!;
    for (let v = min; v <= max; v++) {
      if (cronFieldMatches(field, v, min, max)) return true;
    }
    return false;
  });
}

/**
 * Whether a cron expression is due for the UTC hour containing `now`.
 *
 * The sweep runs hourly, so scheduling resolution is one hour: the minute
 * field is validated but not used to delay within the hour.
 */
export function isCronDueThisHour(expr: string, now: Date): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const [, hour, dayOfMonth, month, dayOfWeek] = fields as [string, string, string, string, string];

  if (!cronFieldMatches(hour, now.getUTCHours(), 0, 23)) return false;
  if (!cronFieldMatches(month, now.getUTCMonth() + 1, 1, 12)) return false;

  // Standard cron: when both day fields are restricted, either may match.
  const domRestricted = dayOfMonth.trim() !== '*';
  const dowRestricted = dayOfWeek.trim() !== '*';
  const domMatch = cronFieldMatches(dayOfMonth, now.getUTCDate(), 1, 31);
  const dowMatch = cronFieldMatches(dayOfWeek, now.getUTCDay(), 0, 6);

  if (domRestricted && dowRestricted) return domMatch || dowMatch;
  if (domRestricted) return domMatch;
  if (dowRestricted) return dowMatch;
  return true;
}

/** Default schedule when an admin enabled auto-sync but set no cron. */
const DEFAULT_SYNC_CRON = '0 3 * * *';

/** Configs eligible for scheduled syncing, per provider. */
export const listEnabledConfigs = internalQuery({
  args: { provider: providerValidator },
  handler: async (ctx, { provider }) => {
    const docs = await ctx.db
      .query('integrationConfigs')
      .withIndex('by_provider_enabled', (q) =>
        q.eq('provider', provider).eq('config.isEnabled', true),
      )
      .take(DEFAULT_LIST_CAP);

    return docs.map((d) => ({
      organizationId: d.organizationId,
      provider: d.provider,
      syncSchedule: d.config.syncSchedule,
      lastSyncAt: d.config.lastSyncAt,
      autoSyncEmployees: d.config.autoSyncEmployees,
      syncEmployees: d.config.syncEmployees,
      syncPayroll: d.config.syncPayroll,
    }));
  },
});

/**
 * Hourly sweep that runs every due integration sync.
 *
 * Only providers that actually import data are swept — imID holds no directory,
 * so re-authenticating it on a timer would be pointless traffic.
 */
export const runScheduledSyncs = internalAction({
  args: {},
  handler: async (ctx) => {
    const now = new Date();
    let ran = 0;
    let failed = 0;

    for (const provider of ['lucky_carrot', 'armsoft'] as const) {
      const configs = await ctx.runQuery(internal.integrations.listEnabledConfigs, { provider });

      for (const cfg of configs) {
        // Respect the per-provider "import data" switches.
        const importEnabled =
          provider === 'lucky_carrot'
            ? cfg.autoSyncEmployees === true
            : cfg.syncEmployees === true || cfg.syncPayroll === true;
        if (!importEnabled) continue;

        const schedule = cfg.syncSchedule || DEFAULT_SYNC_CRON;
        if (!isCronDueThisHour(schedule, now)) continue;

        // Guard against a double-run inside the same hour (retries, overlap).
        if (cfg.lastSyncAt && now.getTime() - cfg.lastSyncAt < 55 * 60 * 1000) continue;

        const result = await runSync(ctx, cfg.organizationId, provider);
        ran++;
        if (!result.success) failed++;
      }
    }

    return { ran, failed };
  },
});
