/**
 * Tests for convex/taskFields — custom field CRUD with mocked Convex context.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mocks ────────────────────────────────────────────────────────────────────
jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler }: any) => ({ handler }),
  query: ({ handler }: any) => ({ handler }),
  internalMutation: ({ handler }: any) => ({ handler }),
}));

jest.mock('../../convex/lib/entitlements', () => ({
  assertModuleAccess: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../convex/lib/orgAccess', () => ({
  assertOrgStaff: jest.fn(),
  resolveOrgScope: jest.fn(),
  scopeOwnsRecord: jest.fn(),
}));

jest.mock('../../convex/lib/taskConfig', () => ({
  listFieldsFor: jest.fn().mockResolvedValue([]),
  assertFieldCapacity: jest.fn(),
  uniqueFieldKey: jest.fn((_name: string, taken: string[]) => {
    const base = _name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    let key = base;
    let i = 2;
    while (taken.includes(key)) {
      key = `${base}_${i}`;
      i++;
    }
    return key;
  }),
  nextFieldOrder: jest.fn(
    (fields: any[]) => fields.reduce((max, f) => Math.max(max, f.order), -1) + 1,
  ),
}));

jest.mock('../../convex/lib/taskCustomFields', () => {
  const { v } = require('convex/values');
  return {
    fieldKeyFromName: jest.fn((name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_')),
    validateFieldValue: jest.fn((_field: any, value: any) => value),
    CLEAR_FIELD_VALUE: '__clear__',
    MAX_FIELDS_PER_SCOPE: 60,
    MAX_FIELD_NAME_LENGTH: 60,
    MAX_OPTION_LABEL_LENGTH: 40,
    clampColumnWidth: jest.fn((w: number) => Math.min(600, Math.max(80, w))),
    defaultFieldWidth: jest.fn(() => 150),
    assertValidFieldDef: jest.fn(),
    fieldHasOptions: jest.fn(() => false),
    fieldTypeValidator: v.string(),
    fieldOptionValidator: v.object({
      id: v.string(),
      label: v.string(),
      color: v.optional(v.string()),
    }),
    fieldConfigValidator: v.optional(v.any()),
  };
});

jest.mock('../../convex/lib/sanitize', () => ({
  sanitizeTitle: jest.fn((s: string) => s.trim()),
}));

jest.mock('../../convex/lib/limits', () => ({
  SMALL_LIST_CAP: 100,
  DEFAULT_LIST_CAP: 500,
  XLARGE_LIST_CAP: 8000,
}));

// ── Module under test ────────────────────────────────────────────────────────
let handlers: Record<string, (ctx: any, args: any) => Promise<any>> = {};

beforeEach(() => {
  jest.clearAllMocks();
  jest.isolateModules(() => {
    const mod = require('../../convex/taskFields');
    for (const [name, def] of Object.entries(mod)) {
      if (def && typeof def === 'object' && typeof (def as any).handler === 'function') {
        handlers[name] = (def as any).handler;
      }
    }
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────
const ORG = 'org-1';
const USER = 'user-1';
const FIELD_ID = 'field-1';

const orgAccess = jest.requireMock('../../convex/lib/orgAccess') as Record<string, jest.Mock>;

function mockStaffScope() {
  const scope = { organizationId: ORG, caller: callerDoc(), isStaff: true, isAdmin: false };
  orgAccess.assertOrgStaff.mockResolvedValue(scope);
  orgAccess.resolveOrgScope.mockResolvedValue(scope);
  orgAccess.scopeOwnsRecord.mockReturnValue(true);
  return scope;
}

function callerDoc(overrides: Record<string, unknown> = {}) {
  return { _id: USER, role: 'admin', organizationId: ORG, name: 'Admin', ...overrides };
}

function fieldDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: FIELD_ID,
    organizationId: ORG,
    projectId: undefined,
    name: 'Sprint Points',
    key: 'sprint_points',
    type: 'number',
    options: [],
    config: { precision: 0 },
    required: false,
    order: 0,
    width: 120,
    isActive: true,
    createdBy: USER,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function makeCtx(dbOverrides: Record<string, jest.Mock> = {}) {
  const get = dbOverrides.get ?? jest.fn();
  const insert = dbOverrides.insert ?? jest.fn().mockResolvedValue('new_id');
  const patch = dbOverrides.patch ?? jest.fn().mockResolvedValue(undefined);
  const remove = dbOverrides.delete ?? jest.fn().mockResolvedValue(undefined);
  const take = dbOverrides.take ?? jest.fn().mockResolvedValue([]);
  const first = dbOverrides.first ?? jest.fn().mockResolvedValue(null);
  const order = jest.fn().mockReturnValue({ take, first });
  const withIndex = jest.fn().mockReturnValue({ order, take, first });
  const query = jest.fn().mockReturnValue({ withIndex, order, take, first });
  const db = { get, insert, patch, delete: remove, query };
  return { ctx: { db }, get, insert, patch, remove, query, withIndex, take, first };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('createField', () => {
  it('creates a field and returns its id', async () => {
    mockStaffScope();
    const { ctx, insert } = makeCtx();

    const id = await handlers.createField(ctx, {
      name: 'Sprint Points',
      type: 'number',
    });

    expect(id).toBe('new_id');
    expect(insert).toHaveBeenCalledWith(
      'taskFields',
      expect.objectContaining({
        name: 'Sprint Points',
        type: 'number',
        organizationId: ORG,
        isActive: true,
      }),
    );
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({
        action: 'task_field_created',
      }),
    );
  });

  it('assigns order based on existing fields', async () => {
    mockStaffScope();
    jest.requireMock('../../convex/lib/taskConfig').nextFieldOrder.mockReturnValue(3);
    const { ctx, insert } = makeCtx();

    const id = await handlers.createField(ctx, {
      name: 'Priority',
      type: 'select',
    });

    expect(id).toBe('new_id');
  });

  it('validates field capacity', async () => {
    mockStaffScope();
    const { ctx } = makeCtx();
    jest.requireMock('../../convex/lib/taskConfig').assertFieldCapacity.mockImplementation(() => {
      throw new Error('at most');
    });

    await expect(handlers.createField(ctx, { name: 'New', type: 'text' })).rejects.toThrow(
      'at most',
    );
  });
});

describe('updateField', () => {
  it('updates field name', async () => {
    mockStaffScope();
    const { ctx, patch } = makeCtx();
    ctx.db.get.mockResolvedValue(fieldDoc());

    await handlers.updateField(ctx, {
      fieldId: FIELD_ID,
      name: 'Story Points',
    });

    expect(patch).toHaveBeenCalledWith(
      FIELD_ID,
      expect.objectContaining({
        name: 'Story Points',
      }),
    );
  });

  it('throws for non-existent field', async () => {
    mockStaffScope();
    const { ctx } = makeCtx();
    ctx.db.get.mockResolvedValue(null);

    await expect(handlers.updateField(ctx, { fieldId: FIELD_ID, name: 'X' })).rejects.toThrow(
      'not found',
    );
  });

  it('updates type', async () => {
    mockStaffScope();
    const { ctx, patch } = makeCtx();
    ctx.db.get.mockResolvedValue(fieldDoc());

    await handlers.updateField(ctx, {
      fieldId: FIELD_ID,
      type: 'text',
    });

    expect(patch).toHaveBeenCalledWith(
      FIELD_ID,
      expect.objectContaining({
        type: 'text',
      }),
    );
  });

  it('updates required flag', async () => {
    mockStaffScope();
    const { ctx, patch } = makeCtx();
    ctx.db.get.mockResolvedValue(fieldDoc());

    await handlers.updateField(ctx, {
      fieldId: FIELD_ID,
      required: true,
    });

    expect(patch).toHaveBeenCalledWith(
      FIELD_ID,
      expect.objectContaining({
        required: true,
      }),
    );
  });
});

describe('archiveField', () => {
  it('sets isActive to false', async () => {
    mockStaffScope();
    const { ctx, patch } = makeCtx();
    ctx.db.get.mockResolvedValue(fieldDoc());

    await handlers.archiveField(ctx, { fieldId: FIELD_ID });

    expect(patch).toHaveBeenCalledWith(
      FIELD_ID,
      expect.objectContaining({
        isActive: false,
      }),
    );
  });

  it('throws for non-existent field', async () => {
    mockStaffScope();
    const { ctx } = makeCtx();
    ctx.db.get.mockResolvedValue(null);

    await expect(handlers.archiveField(ctx, { fieldId: FIELD_ID })).rejects.toThrow('not found');
  });
});

describe('reorderFields', () => {
  it('reorders fields and returns count', async () => {
    mockStaffScope();
    const { ctx, patch } = makeCtx();
    const fields = [fieldDoc({ _id: 'f1', order: 0 }), fieldDoc({ _id: 'f2', order: 1 })];
    ctx.db.query().withIndex().take.mockResolvedValue(fields);

    const result = await handlers.reorderFields(ctx, {
      fieldIds: ['f2', 'f1'],
    });

    expect(result).toEqual({ moved: expect.any(Number) });
  });

  it('reorders successfully', async () => {
    mockStaffScope();
    const { ctx, patch } = makeCtx();
    const fields = [fieldDoc({ _id: 'f1', order: 0 }), fieldDoc({ _id: 'f2', order: 1 })];
    ctx.db.query().withIndex().take.mockResolvedValue(fields);

    const result = await handlers.reorderFields(ctx, { fieldIds: ['f1', 'f2'] });

    expect(result).toEqual({ moved: expect.any(Number) });
  });
});
