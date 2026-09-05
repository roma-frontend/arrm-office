/**
 * Deep coverage tests for convex/projects.ts
 * Targets: updateProject, deleteProject, listTemplates, createTemplate,
 * deleteTemplate, getProjectStats — with happy-path flows.
 */

import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/getAuthCaller', () => ({
  getAuthCaller: jest.fn(),
}));

jest.mock('../../convex/lib/auth', () => ({
  isSuperadmin: jest.fn(),
}));

jest.mock('../../convex/lib/entitlements', () => ({
  assertModuleAccess: jest.fn(),
  decrementUsage: jest.fn(),
}));

let projects: any;
let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;
let mockDecrementUsage: jest.Mock;

const ORG = 'org_1';
const adminUser = {
  _id: 'user_admin',
  name: 'Admin',
  email: 'admin@x.com',
  role: 'admin',
  organizationId: ORG,
};

function makeCtx(tableRows: Record<string, any[]> = {}) {
  const insertedById = new Map<string, any>();

  // Seed insertedById with pre-existing rows
  for (const arr of Object.values(tableRows)) {
    for (const row of arr as any[]) {
      if (row._id) insertedById.set(row._id, row);
    }
  }

  function chain(table: string) {
    const rows = tableRows[table] ?? [];
    let eqFilters: Record<string, unknown> = {};
    let orderDir: 'asc' | 'desc' = 'asc';
    const c: any = {
      withIndex: (idxName: string, cb: any) => {
        const cap = {
          eq: (k: string, v: unknown) => {
            eqFilters[k] = v;
            return cap;
          },
        };
        if (cb) cb(cap);
        return c;
      },
      eq: (k: string, v: unknown) => {
        eqFilters[k] = v;
        return c;
      },
      order: (dir: string) => {
        orderDir = dir as any;
        return c;
      },
      filter: () => c,
      take: async () => {
        let filtered = rows.filter((r) => {
          for (const [k, v] of Object.entries(eqFilters)) {
            if (r[k] !== v) return false;
          }
          return true;
        });
        if (orderDir === 'desc') filtered = [...filtered].reverse();
        return filtered;
      },
      first: async () => {
        const filtered = rows.filter((r) => {
          for (const [k, v] of Object.entries(eqFilters)) {
            if (r[k] !== v) return false;
          }
          return true;
        });
        return filtered[0] ?? null;
      },
      unique: async () => {
        const filtered = rows.filter((r) => {
          for (const [k, v] of Object.entries(eqFilters)) {
            if (r[k] !== v) return false;
          }
          return true;
        });
        return filtered[0] ?? null;
      },
    };
    return c;
  }

  return {
    db: {
      get: async (id: string) => {
        for (const arr of Object.values(tableRows)) {
          const found = (arr as any[]).find((r: any) => r._id === id);
          if (found) return found;
        }
        return null;
      },
      insert: async (table: string, doc: Record<string, unknown>) => {
        const arr = (tableRows[table] ??= []);
        const id = `auto-${table}-${arr.length}`;
        const full = { _id: id, ...doc };
        arr.push(full);
        insertedById.set(id, full);
        return id;
      },
      patch: async (id: string, patchDoc: Record<string, unknown>) => {
        const row = insertedById.get(id);
        if (row) Object.assign(row, patchDoc);
      },
      delete: async (id: string) => {
        for (const table of Object.keys(tableRows)) {
          const idx = tableRows[table].findIndex((r: any) => r._id === id);
          if (idx >= 0) {
            tableRows[table].splice(idx, 1);
            break;
          }
        }
      },
      query: (table: string) => chain(table),
    },
    insertedById,
    tableRows,
  };
}

beforeAll(() => {
  jest.isolateModules(() => {
    mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
    mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
    mockDecrementUsage = jest.requireMock('../../convex/lib/entitlements').decrementUsage;
    projects = require('../../convex/projects');
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller.mockResolvedValue(adminUser);
  mockIsSuperadmin.mockReturnValue(false);
  mockDecrementUsage.mockResolvedValue(undefined);
});

// ─── updateProject ──────────────────────────────────────────────────────────

describe('updateProject', () => {
  it('updates project fields and creates audit log', async () => {
    const rows: any = {
      projects: [{ _id: 'proj_1', organizationId: ORG, name: 'Old Name' }],
    };
    const ctx = makeCtx(rows);
    await projects.updateProject.handler(ctx, {
      projectId: 'proj_1' as any,
      name: 'New Name',
      status: 'active',
      priority: 'high',
    });
    const proj = ctx.tableRows['projects'][0];
    expect(proj.name).toBe('New Name');
    expect(proj.status).toBe('active');
    expect(proj.priority).toBe('high');
    expect(proj.updatedAt).toBeDefined();
    // Audit log
    const logs = ctx.tableRows['auditLogs'] ?? [];
    expect(logs.length).toBe(1);
    expect(logs[0].action).toBe('project_updated');
  });

  it('skips undefined fields in patch', async () => {
    const rows: any = {
      projects: [{ _id: 'proj_2', organizationId: ORG, name: 'Original', status: 'planning' }],
    };
    const ctx = makeCtx(rows);
    await projects.updateProject.handler(ctx, {
      projectId: 'proj_2' as any,
      name: 'Updated',
    });
    const proj = ctx.tableRows['projects'][0];
    expect(proj.name).toBe('Updated');
    expect(proj.status).toBe('planning'); // unchanged
  });

  it('throws when project not found', async () => {
    const ctx = makeCtx({});
    await expect(
      projects.updateProject.handler(ctx, { projectId: 'ghost' as any, name: 'X' }),
    ).rejects.toThrow('Project not found');
  });

  it('throws when caller has no manage permission', async () => {
    mockGetAuthCaller.mockResolvedValue({ ...adminUser, organizationId: 'other_org' });
    const rows: any = {
      projects: [{ _id: 'proj_3', organizationId: ORG, name: 'X' }],
    };
    const ctx = makeCtx(rows);
    await expect(
      projects.updateProject.handler(ctx, { projectId: 'proj_3' as any, name: 'Hack' }),
    ).rejects.toThrow();
  });
});

// ─── deleteProject ──────────────────────────────────────────────────────────

describe('deleteProject', () => {
  it('deletes project and unlinks tasks', async () => {
    const rows: any = {
      projects: [{ _id: 'proj_del', organizationId: ORG, name: 'To Delete' }],
      tasks: [
        { _id: 't1', projectId: 'proj_del', title: 'Task 1' },
        { _id: 't2', projectId: 'proj_del', title: 'Task 2' },
        { _id: 't3', projectId: 'other', title: 'Other Task' },
      ],
    };
    const ctx = makeCtx(rows);
    await projects.deleteProject.handler(ctx, { projectId: 'proj_del' as any });
    // Project deleted
    expect(ctx.tableRows['projects'].find((r: any) => r._id === 'proj_del')).toBeUndefined();
    // Tasks unlinked
    expect(ctx.tableRows['tasks'].find((r: any) => r._id === 't1')?.projectId).toBeUndefined();
    expect(ctx.tableRows['tasks'].find((r: any) => r._id === 't2')?.projectId).toBeUndefined();
    expect(ctx.tableRows['tasks'].find((r: any) => r._id === 't3')?.projectId).toBe('other');
    // Quota freed
    expect(mockDecrementUsage).toHaveBeenCalled();
  });

  it('creates audit log on delete', async () => {
    const rows: any = {
      projects: [{ _id: 'proj_aud', organizationId: ORG, name: 'Audit Project' }],
    };
    const ctx = makeCtx(rows);
    await projects.deleteProject.handler(ctx, { projectId: 'proj_aud' as any });
    const logs = ctx.tableRows['auditLogs'] ?? [];
    expect(logs.length).toBe(1);
    expect(logs[0].action).toBe('project_deleted');
  });

  it('throws when project not found', async () => {
    const ctx = makeCtx({});
    await expect(projects.deleteProject.handler(ctx, { projectId: 'nope' as any })).rejects.toThrow(
      'Project not found',
    );
  });
});

// ─── listTemplates ──────────────────────────────────────────────────────────

describe('listTemplates', () => {
  it('returns org templates with task count', async () => {
    const rows: any = {
      projectTemplates: [
        {
          _id: 'tpl_1',
          organizationId: ORG,
          name: 'Onboarding',
          isPublic: false,
          defaultTasks: [{ title: 'Step 1' }, { title: 'Step 2' }],
        },
      ],
    };
    const ctx = makeCtx(rows);
    const result = await projects.listTemplates.handler(ctx, { organizationId: ORG });
    expect(result.length).toBe(1);
    expect(result[0].taskCount).toBe(2);
  });

  it('deduplicates templates that appear in both org and public', async () => {
    const rows: any = {
      projectTemplates: [
        {
          _id: 'tpl_shared',
          organizationId: ORG,
          name: 'Shared',
          isPublic: true,
          defaultTasks: [],
        },
      ],
    };
    const ctx = makeCtx(rows);
    const result = await projects.listTemplates.handler(ctx, { organizationId: ORG });
    expect(result.length).toBe(1);
  });

  it('returns empty for non-org member', async () => {
    mockGetAuthCaller.mockResolvedValue({ ...adminUser, organizationId: 'other_org' });
    const ctx = makeCtx({
      projectTemplates: [
        { _id: 'tpl_x', organizationId: ORG, name: 'X', isPublic: false, defaultTasks: [] },
      ],
    });
    const result = await projects.listTemplates.handler(ctx, { organizationId: ORG });
    expect(result).toEqual([]);
  });
});

// ─── createTemplate ─────────────────────────────────────────────────────────

describe('createTemplate', () => {
  it('creates a template with default tasks', async () => {
    const ctx = makeCtx({});
    const id = await projects.createTemplate.handler(ctx, {
      organizationId: ORG,
      name: 'New Template',
      defaultTasks: [{ title: 'Task 1', priority: 'medium' }],
      isPublic: true,
    });
    expect(id).toBeDefined();
    expect(ctx.tableRows['projectTemplates'].length).toBe(1);
    const tpl = ctx.tableRows['projectTemplates'][0];
    expect(tpl.name).toBe('New Template');
    expect(tpl.createdBy).toBe(adminUser._id);
  });

  it('throws for non-admin', async () => {
    mockGetAuthCaller.mockResolvedValue({ ...adminUser, organizationId: 'other_org' });
    const ctx = makeCtx({});
    await expect(
      projects.createTemplate.handler(ctx, {
        organizationId: ORG,
        name: 'Nope',
        defaultTasks: [],
        isPublic: false,
      }),
    ).rejects.toThrow();
  });
});

// ─── deleteTemplate ─────────────────────────────────────────────────────────

describe('deleteTemplate', () => {
  it('deletes a template', async () => {
    const rows: any = {
      projectTemplates: [{ _id: 'tpl_del', organizationId: ORG, name: 'Delete Me' }],
    };
    const ctx = makeCtx(rows);
    await projects.deleteTemplate.handler(ctx, { templateId: 'tpl_del' as any });
    expect(ctx.tableRows['projectTemplates'].length).toBe(0);
  });

  it('silently no-ops for nonexistent template', async () => {
    const ctx = makeCtx({});
    await expect(
      projects.deleteTemplate.handler(ctx, { templateId: 'ghost' as any }),
    ).resolves.not.toThrow();
  });

  it('throws for non-admin', async () => {
    mockGetAuthCaller.mockResolvedValue({ ...adminUser, organizationId: 'other_org' });
    const rows: any = {
      projectTemplates: [{ _id: 'tpl_x', organizationId: ORG, name: 'X' }],
    };
    const ctx = makeCtx(rows);
    await expect(
      projects.deleteTemplate.handler(ctx, { templateId: 'tpl_x' as any }),
    ).rejects.toThrow();
  });
});

// ─── getProjectStats ────────────────────────────────────────────────────────

describe('getProjectStats', () => {
  it('returns correct stats for projects with tasks', async () => {
    const rows: any = {
      projects: [
        { _id: 'p1', organizationId: ORG, status: 'active' },
        { _id: 'p2', organizationId: ORG, status: 'active' },
        { _id: 'p3', organizationId: ORG, status: 'completed' },
        { _id: 'p4', organizationId: ORG, status: 'planning' },
        { _id: 'p5', organizationId: ORG, status: 'on_hold' },
      ],
      tasks: [
        { _id: 't1', projectId: 'p1', status: 'completed' },
        { _id: 't2', projectId: 'p1', status: 'in_progress' },
        { _id: 't3', projectId: 'p3', status: 'completed' },
      ],
    };
    const ctx = makeCtx(rows);
    const result = await projects.getProjectStats.handler(ctx, { organizationId: ORG });
    expect(result.total).toBe(5);
    expect(result.active).toBe(2);
    expect(result.completed).toBe(1);
    expect(result.planning).toBe(1);
    expect(result.onHold).toBe(1);
    expect(result.totalTasks).toBe(3);
    expect(result.completedTasks).toBe(2);
    expect(result.overallProgress).toBe(67); // 2/3 = 66.67 → 67
  });

  it('returns zero stats when no projects', async () => {
    const ctx = makeCtx({});
    const result = await projects.getProjectStats.handler(ctx, { organizationId: ORG });
    expect(result.total).toBe(0);
    expect(result.overallProgress).toBe(0);
  });

  it('returns zeros for non-org member', async () => {
    mockGetAuthCaller.mockResolvedValue({ ...adminUser, organizationId: 'other_org' });
    const ctx = makeCtx({
      projects: [{ _id: 'p1', organizationId: ORG, status: 'active' }],
    });
    const result = await projects.getProjectStats.handler(ctx, { organizationId: ORG });
    expect(result.total).toBe(0);
  });
});
