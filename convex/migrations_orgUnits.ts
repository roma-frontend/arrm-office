/**
 * Backfill of the department/position links on employee records.
 *
 * History: `users.department` / `users.position` are free-text labels, while
 * `users.departmentId` / `users.positionId` are the real links. Only the admin
 * form ever wrote the ids, so employees created by the SharePoint/HR sync, imID,
 * self-registration or the recruitment hire flow carried a name with no link.
 * Those people are missing from department head-counts
 * (`departments.list` counts by id) even though the UI shows a department name
 * for them. All creation paths now write both halves; this migration repairs the
 * records that already exist.
 *
 * Operator-only (`internalMutation`), run with `npx convex run`:
 *
 *   # 1. See what would change — writes nothing:
 *   npx convex run migrations_orgUnits:backfillOrgUnitLinks '{"dryRun":true}'
 *
 *   # 2. Same, but also list the departments that would have to be created:
 *   npx convex run migrations_orgUnits:backfillOrgUnitLinks '{"dryRun":true,"createMissing":true}'
 *
 *   # 3. Apply (optionally one organization at a time):
 *   npx convex run migrations_orgUnits:backfillOrgUnitLinks '{"createMissing":true}'
 *   npx convex run migrations_orgUnits:backfillOrgUnitLinks '{"organizationId":"..."}'
 *
 * `dryRun` defaults to **true**: an accidental invocation reports instead of
 * writing. Matching is case-insensitive and whitespace-tolerant, the same rule
 * the runtime helper uses, so the migration and normal operation agree.
 */
import { internalMutation } from './_generated/server';
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { DEFAULT_LIST_CAP, XLARGE_LIST_CAP } from './lib/limits';

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

interface OrgReport {
  organizationId: string;
  organizationName: string;
  employeesScanned: number;
  departmentLinked: number;
  positionLinked: number;
  departmentsCreated: string[];
  positionsCreated: string[];
  /** Names present on employees with no matching record and creation disabled. */
  unmatchedDepartments: string[];
  unmatchedPositions: string[];
  /** Ids pointing at a deleted record — re-linked when possible, else cleared. */
  danglingDepartmentIds: number;
  danglingPositionIds: number;
}

export const backfillOrgUnitLinks = internalMutation({
  args: {
    /** Report only. Defaults to true — pass `false` to write. */
    dryRun: v.optional(v.boolean()),
    /** Create departments/positions that exist as text but not as records. */
    createMissing: v.optional(v.boolean()),
    /** Limit the run to one organization. */
    organizationId: v.optional(v.id('organizations')),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun !== false;
    const createMissing = args.createMissing === true;
    const now = Date.now();

    const organizations = args.organizationId
      ? [await ctx.db.get(args.organizationId)].filter((o): o is Doc<'organizations'> => o !== null)
      : await ctx.db.query('organizations').take(DEFAULT_LIST_CAP);

    const reports: OrgReport[] = [];

    for (const org of organizations) {
      const report: OrgReport = {
        organizationId: org._id,
        organizationName: org.name,
        employeesScanned: 0,
        departmentLinked: 0,
        positionLinked: 0,
        departmentsCreated: [],
        positionsCreated: [],
        unmatchedDepartments: [],
        unmatchedPositions: [],
        danglingDepartmentIds: 0,
        danglingPositionIds: 0,
      };

      const users = await ctx.db
        .query('users')
        .withIndex('by_org', (q) => q.eq('organizationId', org._id))
        .take(XLARGE_LIST_CAP);

      const departments = await ctx.db
        .query('departments')
        .withIndex('by_org', (q) => q.eq('organizationId', org._id))
        .take(DEFAULT_LIST_CAP);
      const positions = await ctx.db
        .query('positions')
        .withIndex('by_org', (q) => q.eq('organizationId', org._id))
        .take(DEFAULT_LIST_CAP);

      // Maps mutate as records get created, so later employees reuse them
      // instead of creating a second copy of the same department.
      const deptByName = new Map(departments.map((d) => [normalize(d.name), d._id]));
      const deptIds = new Set<string>(departments.map((d) => d._id as string));
      const posByTitle = new Map(positions.map((p) => [normalize(p.title), p._id]));
      const posIds = new Set<string>(positions.map((p) => p._id as string));
      // Dry-run bookkeeping: names we would create, so the same one is not
      // reported twice and the counters match what a real run would do.
      const plannedDepartments = new Set<string>();
      const plannedPositions = new Set<string>();

      for (const user of users) {
        if (user.role === 'superadmin') continue;
        report.employeesScanned += 1;

        const patch: {
          departmentId?: Id<'departments'>;
          positionId?: Id<'positions'>;
          updatedAt?: number;
        } = {};
        let clearDepartmentId = false;
        let clearPositionId = false;

        // ── Department ──────────────────────────────────────────
        const deptIdIsDangling = !!user.departmentId && !deptIds.has(user.departmentId as string);
        if (deptIdIsDangling) report.danglingDepartmentIds += 1;

        if ((!user.departmentId || deptIdIsDangling) && user.department?.trim()) {
          const name = user.department.trim();
          const key = normalize(name);
          const existing = deptByName.get(key);

          if (existing) {
            patch.departmentId = existing;
            report.departmentLinked += 1;
          } else if (createMissing) {
            if (dryRun) {
              if (!plannedDepartments.has(key)) {
                plannedDepartments.add(key);
                report.departmentsCreated.push(name);
              }
              report.departmentLinked += 1;
            } else {
              const departmentId = await ctx.db.insert('departments', {
                organizationId: org._id,
                name,
                isActive: true,
                createdAt: now,
                updatedAt: now,
              });
              deptByName.set(key, departmentId);
              deptIds.add(departmentId as string);
              report.departmentsCreated.push(name);
              patch.departmentId = departmentId;
              report.departmentLinked += 1;
            }
          } else {
            if (!report.unmatchedDepartments.includes(name)) {
              report.unmatchedDepartments.push(name);
            }
            // Nothing to link to: at least stop pointing at a deleted record.
            if (deptIdIsDangling) clearDepartmentId = true;
          }
        } else if (deptIdIsDangling) {
          clearDepartmentId = true;
        }

        // ── Position ────────────────────────────────────────────
        const posIdIsDangling = !!user.positionId && !posIds.has(user.positionId as string);
        if (posIdIsDangling) report.danglingPositionIds += 1;

        if ((!user.positionId || posIdIsDangling) && user.position?.trim()) {
          const title = user.position.trim();
          const key = normalize(title);
          const existing = posByTitle.get(key);

          if (existing) {
            patch.positionId = existing;
            report.positionLinked += 1;
          } else if (createMissing) {
            if (dryRun) {
              if (!plannedPositions.has(key)) {
                plannedPositions.add(key);
                report.positionsCreated.push(title);
              }
              report.positionLinked += 1;
            } else {
              const positionId = await ctx.db.insert('positions', {
                organizationId: org._id,
                departmentId: patch.departmentId ?? user.departmentId,
                title,
                isActive: true,
                createdAt: now,
                updatedAt: now,
              });
              posByTitle.set(key, positionId);
              posIds.add(positionId as string);
              report.positionsCreated.push(title);
              patch.positionId = positionId;
              report.positionLinked += 1;
            }
          } else {
            if (!report.unmatchedPositions.includes(title)) {
              report.unmatchedPositions.push(title);
            }
            if (posIdIsDangling) clearPositionId = true;
          }
        } else if (posIdIsDangling) {
          clearPositionId = true;
        }

        if (dryRun) continue;
        if (patch.departmentId || patch.positionId || clearDepartmentId || clearPositionId) {
          await ctx.db.patch(user._id, {
            ...patch,
            // `undefined` removes the field in Convex — intentional here.
            ...(clearDepartmentId ? { departmentId: undefined } : {}),
            ...(clearPositionId ? { positionId: undefined } : {}),
            updatedAt: now,
          });
        }
      }

      reports.push(report);
    }

    const totals = reports.reduce(
      (acc, r) => ({
        employeesScanned: acc.employeesScanned + r.employeesScanned,
        departmentLinked: acc.departmentLinked + r.departmentLinked,
        positionLinked: acc.positionLinked + r.positionLinked,
        departmentsCreated: acc.departmentsCreated + r.departmentsCreated.length,
        positionsCreated: acc.positionsCreated + r.positionsCreated.length,
        danglingDepartmentIds: acc.danglingDepartmentIds + r.danglingDepartmentIds,
        danglingPositionIds: acc.danglingPositionIds + r.danglingPositionIds,
      }),
      {
        employeesScanned: 0,
        departmentLinked: 0,
        positionLinked: 0,
        departmentsCreated: 0,
        positionsCreated: 0,
        danglingDepartmentIds: 0,
        danglingPositionIds: 0,
      },
    );

    return { dryRun, createMissing, totals, organizations: reports };
  },
});
