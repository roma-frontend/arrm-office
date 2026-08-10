/**
 * Integration tests for the document builder (Convex functions).
 *
 * Runs the real mutations against convex-test's in-memory database. The
 * properties under test are the ones that make the feature trustworthy rather
 * than merely functional:
 *
 *   - authorization comes from the session, and one organization cannot see or
 *     touch another's templates;
 *   - a published version is immutable, so a document issued last year still
 *     renders the text that was signed;
 *   - the mandatory language cannot be dropped at issue time;
 *   - registration numbers are allocated once, per series, without gaps;
 *   - a frozen (sent) document refuses every edit.
 */
import { describe, it, expect } from '@jest/globals';
import { convexTest } from 'convex-test';

import schema from '../../convex/schema';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { normalizeSeries, DEFAULT_DOCUMENT_SERIES } from '../../convex/lib/documentNumbers';

// convex-test normally discovers functions via `import.meta.glob`, which ts-jest
// does not provide - the module map is therefore spelled out. The `_generated`
// entry is what convex-test uses to locate the modules root.
const modules = {
  './_generated/api.ts': () => import('../../convex/_generated/api'),
  './documentBlueprints.ts': () => import('../../convex/documentBlueprints'),
  './issuedDocuments.ts': () => import('../../convex/issuedDocuments'),
  './signatures.ts': () => import('../../convex/signatures'),
} as unknown as Record<string, () => Promise<unknown>>;

type Ctx = Awaited<ReturnType<typeof seed>>;

async function insertOrg(
  ctx: { db: { insert: (table: 'organizations', doc: never) => Promise<Id<'organizations'>> } },
  name: string,
): Promise<Id<'organizations'>> {
  return await ctx.db.insert('organizations', {
    name,
    slug: `${name.toLowerCase()}-${Math.random().toString(36).slice(2)}`,
    plan: 'professional',
    isActive: true,
    createdBySuperadmin: false,
    employeeLimit: 100,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as never);
}

async function seed() {
  const t = convexTest(schema, modules);

  const ids = await t.run(async (ctx) => {
    const organizationId = await insertOrg(ctx, 'Acme');
    const otherOrgId = await insertOrg(ctx, 'Globex');

    const baseUser = {
      passwordHash: 'x',
      employeeType: 'staff' as const,
      isActive: true,
      isApproved: true,
      travelAllowance: 0,
      paidLeaveBalance: 10,
      sickLeaveBalance: 5,
      familyLeaveBalance: 5,
      createdAt: Date.now(),
    };

    const adminId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Admin',
      email: 'admin@acme.test',
      role: 'admin',
    });
    const supervisorId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Manager',
      email: 'manager@acme.test',
      role: 'supervisor',
    });
    const employeeId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Anna Petrosyan',
      email: 'employee@acme.test',
      role: 'employee',
      position: 'Developer',
    });
    const outsiderId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId: otherOrgId,
      name: 'Outsider',
      email: 'outsider@globex.test',
      role: 'admin',
    });

    return { organizationId, otherOrgId, adminId, supervisorId, employeeId, outsiderId };
  });

  return { t, ...ids };
}

const asAdmin = (c: Ctx) => c.t.withIdentity({ email: 'admin@acme.test' });
const asSupervisor = (c: Ctx) => c.t.withIdentity({ email: 'manager@acme.test' });
const asEmployee = (c: Ctx) => c.t.withIdentity({ email: 'employee@acme.test' });
const asOutsider = (c: Ctx) => c.t.withIdentity({ email: 'outsider@globex.test' });

/** Minimal valid blueprint payload. */
function blueprintArgs(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Employment contract',
    category: 'hiring' as const,
    accent: 'blue' as const,
    titles: { hy: 'ՊԱՅՄԱՆԱԳԻՐ', ru: 'ДОГОВОР' },
    segments: [
      { id: 's1', kind: 'section' as const, text: { hy: 'ՊԱՅՄԱՆՆԵՐ', ru: 'УСЛОВИЯ' } },
      {
        id: 's2',
        kind: 'paragraph' as const,
        text: { hy: 'Աշխատողը {{employee.fullName}}', ru: 'Работник {{employee.fullName}}' },
      },
    ],
    signature: true,
    ...overrides,
  };
}

async function createPublished(c: Ctx, overrides: Record<string, unknown> = {}) {
  const blueprintId = await asAdmin(c).mutation(api.documentBlueprints.create, {
    organizationId: c.organizationId,
    ...blueprintArgs(overrides),
  });
  await asAdmin(c).mutation(api.documentBlueprints.publish, { blueprintId });
  return blueprintId;
}

async function issueTo(
  c: Ctx,
  blueprintId: Id<'documentBlueprints'>,
  extra: Record<string, unknown> = {},
) {
  const result = await asAdmin(c).mutation(api.issuedDocuments.issue, {
    organizationId: c.organizationId,
    recipientIds: [c.employeeId],
    source: 'blueprint',
    blueprintId,
    primaryLocale: 'hy',
    secondaryLocale: 'ru',
    title: 'ՊԱՅՄԱՆԱԳԻՐ / ДОГОВОР',
    ...extra,
  });
  const id = result.ids[0];
  if (!id) throw new Error('nothing was issued');
  return id;
}

// ═══════════════════════════════════════════════════════════════════════════
// Blueprints
// ═══════════════════════════════════════════════════════════════════════════

describe('documentBlueprints authorization', () => {
  it('refuses an unauthenticated caller', async () => {
    const c = await seed();
    await expect(
      c.t.mutation(api.documentBlueprints.create, {
        organizationId: c.organizationId,
        ...blueprintArgs(),
      }),
    ).rejects.toThrow(/not authorized/i);
  });

  it('refuses a plain employee', async () => {
    const c = await seed();
    await expect(
      asEmployee(c).mutation(api.documentBlueprints.create, {
        organizationId: c.organizationId,
        ...blueprintArgs(),
      }),
    ).rejects.toThrow(/staff access required/i);
  });

  it('lets a supervisor author templates but not delete them', async () => {
    const c = await seed();
    const blueprintId = await asSupervisor(c).mutation(api.documentBlueprints.create, {
      organizationId: c.organizationId,
      ...blueprintArgs(),
    });
    // Deleting is admin-only; archiving is the path open to supervisors.
    await expect(
      asSupervisor(c).mutation(api.documentBlueprints.remove, { blueprintId }),
    ).rejects.toThrow(/admin access required/i);
    await asSupervisor(c).mutation(api.documentBlueprints.setArchived, {
      blueprintId,
      archived: true,
    });
  });

  it('hides another organization templates', async () => {
    const c = await seed();
    const blueprintId = await createPublished(c);

    expect(await asOutsider(c).query(api.documentBlueprints.get, { blueprintId })).toBeNull();
    expect(await asOutsider(c).query(api.documentBlueprints.list, {})).toEqual([]);
    await expect(
      asOutsider(c).mutation(api.documentBlueprints.update, { blueprintId, name: 'Hijacked' }),
    ).rejects.toThrow();
  });

  it('returns an empty list rather than throwing for an employee', async () => {
    const c = await seed();
    await createPublished(c);
    expect(await asEmployee(c).query(api.documentBlueprints.list, {})).toEqual([]);
  });
});

describe('documentBlueprints lifecycle', () => {
  it('creates a draft that is invisible to issuers until published', async () => {
    const c = await seed();
    const blueprintId = await asAdmin(c).mutation(api.documentBlueprints.create, {
      organizationId: c.organizationId,
      ...blueprintArgs(),
    });

    const draft = await asAdmin(c).query(api.documentBlueprints.get, { blueprintId });
    expect(draft?.status).toBe('draft');
    expect(draft?.version).toBe(0);
    // Published-only listing skips it.
    expect(await asAdmin(c).query(api.documentBlueprints.list, {})).toEqual([]);
    expect(
      (await asAdmin(c).query(api.documentBlueprints.list, { includeUnpublished: true })).length,
    ).toBe(1);

    await expect(
      asAdmin(c).mutation(api.issuedDocuments.issue, {
        organizationId: c.organizationId,
        recipientIds: [c.employeeId],
        source: 'blueprint',
        blueprintId,
        primaryLocale: 'hy',
        title: 'x',
      }),
    ).rejects.toThrow(/not been published/i);
  });

  it('snapshots the content on publish and bumps the version', async () => {
    const c = await seed();
    const blueprintId = await createPublished(c);

    const published = await asAdmin(c).query(api.documentBlueprints.get, { blueprintId });
    expect(published?.status).toBe('published');
    expect(published?.version).toBe(1);
    expect(published?.versions).toHaveLength(1);

    await asAdmin(c).mutation(api.documentBlueprints.publish, { blueprintId });
    const twice = await asAdmin(c).query(api.documentBlueprints.get, { blueprintId });
    expect(twice?.version).toBe(2);
    expect(twice?.versions.map((v) => v.version)).toEqual([2, 1]);
  });

  it('refuses to publish while the mandatory language has gaps', async () => {
    const c = await seed();
    const blueprintId = await asAdmin(c).mutation(api.documentBlueprints.create, {
      organizationId: c.organizationId,
      ...blueprintArgs({
        requiredLocale: 'hy',
        segments: [
          { id: 's1', kind: 'paragraph', text: { ru: 'Только по-русски' } },
          { id: 's2', kind: 'paragraph', text: { hy: 'Հայերեն' } },
        ],
      }),
    });

    await expect(
      asAdmin(c).mutation(api.documentBlueprints.publish, { blueprintId }),
    ).rejects.toThrow(/1 segment\(s\) have no HY text/i);
  });

  it('rejects empty content and duplicate segment ids', async () => {
    const c = await seed();

    await expect(
      asAdmin(c).mutation(api.documentBlueprints.create, {
        organizationId: c.organizationId,
        ...blueprintArgs({ segments: [] }),
      }),
    ).rejects.toThrow(/at least one segment/i);

    await expect(
      asAdmin(c).mutation(api.documentBlueprints.create, {
        organizationId: c.organizationId,
        ...blueprintArgs({
          segments: [
            { id: 'same', kind: 'paragraph', text: { hy: 'a' } },
            { id: 'same', kind: 'paragraph', text: { hy: 'b' } },
          ],
        }),
      }),
    ).rejects.toThrow(/duplicate segment id/i);

    await expect(
      asAdmin(c).mutation(api.documentBlueprints.create, {
        organizationId: c.organizationId,
        ...blueprintArgs({ titles: {} }),
      }),
    ).rejects.toThrow(/heading in at least one language/i);
  });

  it('refuses to edit an archived template until it is restored', async () => {
    const c = await seed();
    const blueprintId = await createPublished(c);

    await asAdmin(c).mutation(api.documentBlueprints.setArchived, { blueprintId, archived: true });
    await expect(
      asAdmin(c).mutation(api.documentBlueprints.update, { blueprintId, name: 'New name' }),
    ).rejects.toThrow(/archived/i);

    // Restoring a template that was published returns it to published.
    await asAdmin(c).mutation(api.documentBlueprints.setArchived, { blueprintId, archived: false });
    const restored = await asAdmin(c).query(api.documentBlueprints.get, { blueprintId });
    expect(restored?.status).toBe('published');
  });

  it('duplicates with fresh segment ids and no version history', async () => {
    const c = await seed();
    const blueprintId = await createPublished(c);

    const copyId = await asAdmin(c).mutation(api.documentBlueprints.duplicate, { blueprintId });
    const copy = await asAdmin(c).query(api.documentBlueprints.get, { blueprintId: copyId });

    expect(copy?.status).toBe('draft');
    expect(copy?.version).toBe(0);
    expect(copy?.name).toContain('(copy)');
    // Sharing ids with the original would confuse a Word re-import.
    const original = await asAdmin(c).query(api.documentBlueprints.get, { blueprintId });
    const originalIds = original?.segments.map((s) => s.id) ?? [];
    for (const id of copy?.segments.map((s) => s.id) ?? []) {
      expect(originalIds).not.toContain(id);
    }
  });

  it('refuses to delete a template that documents were issued from', async () => {
    const c = await seed();
    const blueprintId = await createPublished(c);
    await issueTo(c, blueprintId);

    await expect(
      asAdmin(c).mutation(api.documentBlueprints.remove, { blueprintId }),
    ).rejects.toThrow(/archive it instead/i);
  });

  it('normalises the number series', () => {
    expect(normalizeSeries('ord')).toBe('ORD');
    expect(normalizeSeries('  nda ')).toBe('NDA');
    expect(normalizeSeries('')).toBe(DEFAULT_DOCUMENT_SERIES);
    expect(normalizeSeries('way-too-long-series')).toBe(DEFAULT_DOCUMENT_SERIES);
    expect(normalizeSeries('1BAD')).toBe(DEFAULT_DOCUMENT_SERIES);
  });
});

describe('documentBlueprints validation and edge paths', () => {
  it('rejects oversized and structurally invalid segment payloads', async () => {
    const c = await seed();

    // More than MAX_SEGMENTS (120).
    await expect(
      asAdmin(c).mutation(api.documentBlueprints.create, {
        organizationId: c.organizationId,
        ...blueprintArgs({
          segments: Array.from({ length: 121 }, (_, i) => ({
            id: `s${i}`,
            kind: 'paragraph',
            text: { hy: 'x' },
          })),
        }),
      }),
    ).rejects.toThrow(/cannot exceed 120 segments/i);

    // A single segment text longer than MAX_SEGMENT_CHARS (4000).
    await expect(
      asAdmin(c).mutation(api.documentBlueprints.create, {
        organizationId: c.organizationId,
        ...blueprintArgs({
          segments: [{ id: 's1', kind: 'paragraph', text: { hy: 'a'.repeat(4001) } }],
        }),
      }),
    ).rejects.toThrow(/cannot exceed 4000 characters/i);

    // A blank segment id.
    await expect(
      asAdmin(c).mutation(api.documentBlueprints.create, {
        organizationId: c.organizationId,
        ...blueprintArgs({
          segments: [{ id: '   ', kind: 'paragraph', text: { hy: 'x' } }],
        }),
      }),
    ).rejects.toThrow(/every segment needs an id/i);

    // All texts blank — nothing readable would ever print.
    await expect(
      asAdmin(c).mutation(api.documentBlueprints.create, {
        organizationId: c.organizationId,
        ...blueprintArgs({
          segments: [{ id: 's1', kind: 'paragraph', text: { hy: '  ' } }],
        }),
      }),
    ).rejects.toThrow(/text in at least one language/i);
  });

  it('rejects a name that is empty or too long', async () => {
    const c = await seed();

    await expect(
      asAdmin(c).mutation(api.documentBlueprints.create, {
        organizationId: c.organizationId,
        ...blueprintArgs({ name: '   ' }),
      }),
    ).rejects.toThrow(/needs a name/i);

    await expect(
      asAdmin(c).mutation(api.documentBlueprints.create, {
        organizationId: c.organizationId,
        ...blueprintArgs({ name: 'n'.repeat(121) }),
      }),
    ).rejects.toThrow(/name is too long/i);
  });

  it('reads a published version snapshot by blueprint and version', async () => {
    const c = await seed();
    const blueprintId = await createPublished(c);

    const snapshot = await asAdmin(c).query(api.documentBlueprints.getVersion, {
      blueprintId,
      version: 1,
    });
    expect(snapshot?.version).toBe(1);
    expect(snapshot?.blueprintId).toBe(blueprintId);
    expect(snapshot?.segments).toHaveLength(2);

    // A version that was never published does not exist.
    expect(
      await asAdmin(c).query(api.documentBlueprints.getVersion, { blueprintId, version: 99 }),
    ).toBeNull();

    // Another organization cannot read the snapshot.
    expect(
      await asOutsider(c).query(api.documentBlueprints.getVersion, {
        blueprintId,
        version: 1,
      }),
    ).toBeNull();
  });

  it('updates name, titles, locales and series of a published blueprint', async () => {
    const c = await seed();
    const blueprintId = await createPublished(c);

    await asAdmin(c).mutation(api.documentBlueprints.update, {
      blueprintId,
      name: '  Renewed contract  ',
      titles: { hy: 'ՆՈՐ ՎԵՐՆԱԳԻՐ', ru: 'НОВЫЙ ЗАГОЛОВОК' },
      requiredLocale: 'hy',
      defaultPrimaryLocale: 'hy',
      defaultSecondaryLocale: 'de',
      series: 'nda',
    });

    const row = await asAdmin(c).query(api.documentBlueprints.get, { blueprintId });
    expect(row?.name).toBe('Renewed contract'); // trimmed
    expect(row?.titles).toEqual({ hy: 'ՆՈՐ ՎԵՐՆԱԳԻՐ', ru: 'НОВЫЙ ЗАГОЛОВОК' });
    expect(row?.requiredLocale).toBe('hy');
    expect(row?.defaultPrimaryLocale).toBe('hy');
    expect(row?.defaultSecondaryLocale).toBe('de');
    expect(row?.series).toBe('NDA'); // normalized
  });

  it('clears the series and validates updates before applying them', async () => {
    const c = await seed();
    const blueprintId = await createPublished(c);

    // Empty series clears it; an invalid code falls back to the default.
    await asAdmin(c).mutation(api.documentBlueprints.update, { blueprintId, series: '' });
    let row = await asAdmin(c).query(api.documentBlueprints.get, { blueprintId });
    expect(row?.series).toBeUndefined();

    await asAdmin(c).mutation(api.documentBlueprints.update, { blueprintId, series: '!!bad' });
    row = await asAdmin(c).query(api.documentBlueprints.get, { blueprintId });
    expect(row?.series).toBe(DEFAULT_DOCUMENT_SERIES);

    // A renamed blueprint cannot lose its heading entirely.
    await expect(
      asAdmin(c).mutation(api.documentBlueprints.update, { blueprintId, titles: {} }),
    ).rejects.toThrow(/heading in at least one language/i);

    // An empty renamed name is refused as well.
    await expect(
      asAdmin(c).mutation(api.documentBlueprints.update, { blueprintId, name: '  ' }),
    ).rejects.toThrow(/needs a name/i);

    // A blank description clears the stored one.
    await asAdmin(c).mutation(api.documentBlueprints.update, {
      blueprintId,
      description: '   ',
    });
    row = await asAdmin(c).query(api.documentBlueprints.get, { blueprintId });
    expect(row?.description).toBeUndefined();
  });

  it('requires an organization in scope to create a blueprint', async () => {
    const c = await seed();
    await c.t.run(async (ctx) => {
      await ctx.db.insert('users', {
        passwordHash: 'x',
        employeeType: 'staff',
        isActive: true,
        isApproved: true,
        travelAllowance: 0,
        paidLeaveBalance: 10,
        sickLeaveBalance: 5,
        familyLeaveBalance: 5,
        createdAt: Date.now(),
        name: 'Super',
        email: 'super@acme.test',
        role: 'superadmin',
      });
    });

    // A superadmin with no requested org has nothing to own the blueprint in.
    await expect(
      c.t.withIdentity({ email: 'super@acme.test' }).mutation(api.documentBlueprints.create, {
        name: 'Orphan',
        category: 'other',
        accent: 'slate',
        titles: { en: 'Orphan' },
        segments: [{ id: 's1', kind: 'paragraph', text: { en: 'x' } }],
        signature: false,
      }),
    ).rejects.toThrow(/no organization in scope/i);
  });

  it('deletes a never-issued blueprint together with its version snapshots', async () => {
    const c = await seed();
    const blueprintId = await createPublished(c);

    const result = await asAdmin(c).mutation(api.documentBlueprints.remove, { blueprintId });
    expect(result).toEqual({ ok: true });

    expect(await asAdmin(c).query(api.documentBlueprints.get, { blueprintId })).toBeNull();
    expect(
      await asAdmin(c).query(api.documentBlueprints.getVersion, { blueprintId, version: 1 }),
    ).toBeNull();
  });

  it('degrades to empty results for an employee browsing single records', async () => {
    const c = await seed();
    const blueprintId = await createPublished(c);

    expect(await asEmployee(c).query(api.documentBlueprints.get, { blueprintId })).toBeNull();
    expect(
      await asEmployee(c).query(api.documentBlueprints.getVersion, { blueprintId, version: 1 }),
    ).toBeNull();
  });

  it('treats a missing blueprint as not found in every mutation', async () => {
    const c = await seed();
    // A real, well-formed id that no longer exists: create, then delete it.
    const doomedId = await asAdmin(c).mutation(api.documentBlueprints.create, {
      organizationId: c.organizationId,
      ...blueprintArgs(),
    });
    await asAdmin(c).mutation(api.documentBlueprints.remove, { blueprintId: doomedId });

    await expect(
      asAdmin(c).mutation(api.documentBlueprints.update, { blueprintId: doomedId, name: 'x' }),
    ).rejects.toThrow(/document not found/i);
    await expect(
      asAdmin(c).mutation(api.documentBlueprints.publish, { blueprintId: doomedId }),
    ).rejects.toThrow(/document not found/i);
    await expect(
      asAdmin(c).mutation(api.documentBlueprints.setArchived, {
        blueprintId: doomedId,
        archived: true,
      }),
    ).rejects.toThrow(/document not found/i);
    await expect(
      asAdmin(c).mutation(api.documentBlueprints.remove, { blueprintId: doomedId }),
    ).rejects.toThrow(/document not found/i);
    await expect(
      asAdmin(c).mutation(api.documentBlueprints.duplicate, { blueprintId: doomedId }),
    ).rejects.toThrow(/document not found/i);
  });

  it('updates description, category, accent and signature of a blueprint', async () => {
    const c = await seed();
    const blueprintId = await createPublished(c);

    await asAdmin(c).mutation(api.documentBlueprints.update, {
      blueprintId,
      description: '  Employment terms  ',
      category: 'consent',
      accent: 'burgundy',
      signature: false,
    });

    const row = await asAdmin(c).query(api.documentBlueprints.get, { blueprintId });
    expect(row?.description).toBe('Employment terms'); // trimmed
    expect(row?.category).toBe('consent');
    expect(row?.accent).toBe('burgundy');
    expect(row?.signature).toBe(false);
  });

  it('rejects an overlong renamed blueprint', async () => {
    const c = await seed();
    const blueprintId = await createPublished(c);

    await expect(
      asAdmin(c).mutation(api.documentBlueprints.update, {
        blueprintId,
        name: 'n'.repeat(121),
      }),
    ).rejects.toThrow(/name is too long/i);
  });

  it('restores a draft blueprint back to draft after archiving', async () => {
    const c = await seed();
    const blueprintId = await asAdmin(c).mutation(api.documentBlueprints.create, {
      organizationId: c.organizationId,
      ...blueprintArgs(),
    });

    await asAdmin(c).mutation(api.documentBlueprints.setArchived, { blueprintId, archived: true });
    // Never published: restoring must not claim it was published.
    await asAdmin(c).mutation(api.documentBlueprints.setArchived, {
      blueprintId,
      archived: false,
    });
    const restored = await asAdmin(c).query(api.documentBlueprints.get, { blueprintId });
    expect(restored?.status).toBe('draft');
  });

  it('duplicates with an explicit name', async () => {
    const c = await seed();
    const blueprintId = await createPublished(c);

    const copyId = await asAdmin(c).mutation(api.documentBlueprints.duplicate, {
      blueprintId,
      name: '  Renewed copy  ',
    });
    const copy = await asAdmin(c).query(api.documentBlueprints.get, { blueprintId: copyId });
    expect(copy?.name).toBe('Renewed copy'); // trimmed
    expect(copy?.status).toBe('draft');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Issued documents
// ═══════════════════════════════════════════════════════════════════════════

describe('issuedDocuments.issue', () => {
  it('pins the blueprint version in force at issue time', async () => {
    const c = await seed();
    const blueprintId = await createPublished(c);
    const issuedId = await issueTo(c, blueprintId);

    // The template moves on: new wording, new published version.
    await asAdmin(c).mutation(api.documentBlueprints.update, {
      blueprintId,
      segments: [{ id: 's1', kind: 'paragraph', text: { hy: 'ՆՈՐ ՏԵՔՍՏ', ru: 'НОВЫЙ ТЕКСТ' } }],
    });
    await asAdmin(c).mutation(api.documentBlueprints.publish, { blueprintId });

    const source = await asAdmin(c).query(api.issuedDocuments.getRenderSource, {
      issuedDocumentId: issuedId,
    });
    expect(source?.source).toBe('blueprint');
    // Still version 1's content — this is what "immutable version" buys.
    expect(source?.snapshot?.version).toBe(1);
    expect(source?.snapshot?.segments).toHaveLength(2);
    expect(source?.snapshot?.segments[0]?.text.ru).toBe('УСЛОВИЯ');
  });

  it('refuses a language pair without the mandatory language', async () => {
    const c = await seed();
    const blueprintId = await createPublished(c, { requiredLocale: 'hy' });

    await expect(
      asAdmin(c).mutation(api.issuedDocuments.issue, {
        organizationId: c.organizationId,
        recipientIds: [c.employeeId],
        source: 'blueprint',
        blueprintId,
        primaryLocale: 'ru',
        secondaryLocale: 'en',
        title: 'ДОГОВОР',
      }),
    ).rejects.toThrow(/must include HY/i);

    // The same template is fine as long as Armenian is one of the two columns.
    const ok = await asAdmin(c).mutation(api.issuedDocuments.issue, {
      organizationId: c.organizationId,
      recipientIds: [c.employeeId],
      source: 'blueprint',
      blueprintId,
      primaryLocale: 'ru',
      secondaryLocale: 'hy',
      title: 'ДОГОВОР / ՊԱՅՄԱՆԱԳԻՐ',
    });
    expect(ok.created).toBe(1);
  });

  it('drops a secondary language identical to the primary one', async () => {
    const c = await seed();
    const blueprintId = await createPublished(c);
    const issuedId = await issueTo(c, blueprintId, { primaryLocale: 'hy', secondaryLocale: 'hy' });

    const row = await asAdmin(c).query(api.issuedDocuments.get, { issuedDocumentId: issuedId });
    expect(row?.secondaryLocale).toBeUndefined();
  });

  it('skips recipients from another organization', async () => {
    const c = await seed();
    const blueprintId = await createPublished(c);

    const result = await asAdmin(c).mutation(api.issuedDocuments.issue, {
      organizationId: c.organizationId,
      recipientIds: [c.employeeId, c.outsiderId],
      source: 'blueprint',
      blueprintId,
      primaryLocale: 'hy',
      title: 'ՊԱՅՄԱՆԱԳԻՐ',
    });

    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('rejects an unknown catalog template id', async () => {
    const c = await seed();
    await expect(
      asAdmin(c).mutation(api.issuedDocuments.issue, {
        organizationId: c.organizationId,
        recipientIds: [c.employeeId],
        source: 'catalog',
        templateId: 'not-a-real-template',
        primaryLocale: 'hy',
        title: 'x',
      }),
    ).rejects.toThrow(/unknown document template/i);
  });
});

describe('issuedDocuments numbering', () => {
  it('allocates once per document, using the template series', async () => {
    const c = await seed();
    const blueprintId = await createPublished(c, { series: 'ord' });
    const issuedId = await issueTo(c, blueprintId);

    const first = await asAdmin(c).mutation(api.issuedDocuments.ensureDocumentNumber, {
      issuedDocumentId: issuedId,
    });
    const year = new Date().getFullYear();
    expect(first.documentNumber).toBe(`ORD-${year}-001`);

    // Idempotent: previewing twice must not burn a number.
    const second = await asAdmin(c).mutation(api.issuedDocuments.ensureDocumentNumber, {
      issuedDocumentId: issuedId,
    });
    expect(second.documentNumber).toBe(first.documentNumber);

    // A second document continues the same series.
    const otherId = await issueTo(c, blueprintId);
    const other = await asAdmin(c).mutation(api.issuedDocuments.ensureDocumentNumber, {
      issuedDocumentId: otherId,
    });
    expect(other.documentNumber).toBe(`ORD-${year}-002`);
  });

  it('falls back to the default series when the template has none', async () => {
    const c = await seed();
    const blueprintId = await createPublished(c);
    const issuedId = await issueTo(c, blueprintId);

    const { documentNumber } = await asAdmin(c).mutation(api.issuedDocuments.ensureDocumentNumber, {
      issuedDocumentId: issuedId,
    });
    expect(documentNumber).toMatch(/^HR-\d{4}-001$/);
  });
});

describe('issuedDocuments editing', () => {
  it('stores a Word override and reverts back to the template', async () => {
    const c = await seed();
    const blueprintId = await createPublished(c);
    const issuedId = await issueTo(c, blueprintId);

    await asAdmin(c).mutation(api.issuedDocuments.applyDocxOverride, {
      issuedDocumentId: issuedId,
      blocksJson: JSON.stringify([{ type: 'paragraph', text: 'Hand-edited' }]),
      sourceDocxName: 'contract.docx',
    });

    let row = await asAdmin(c).query(api.issuedDocuments.get, { issuedDocumentId: issuedId });
    expect(row?.status).toBe('edited');
    expect(row?.sourceDocxName).toBe('contract.docx');

    await asAdmin(c).mutation(api.issuedDocuments.revertToTemplate, { issuedDocumentId: issuedId });
    row = await asAdmin(c).query(api.issuedDocuments.get, { issuedDocumentId: issuedId });
    expect(row?.status).toBe('draft');
    expect(row?.bodyOverride).toBeUndefined();
    expect(row?.sourceDocxName).toBeUndefined();
  });

  it('refuses a malformed or empty override', async () => {
    const c = await seed();
    const blueprintId = await createPublished(c);
    const issuedId = await issueTo(c, blueprintId);

    await expect(
      asAdmin(c).mutation(api.issuedDocuments.applyDocxOverride, {
        issuedDocumentId: issuedId,
        blocksJson: '{not json',
      }),
    ).rejects.toThrow(/invalid content/i);

    await expect(
      asAdmin(c).mutation(api.issuedDocuments.applyDocxOverride, {
        issuedDocumentId: issuedId,
        blocksJson: '[]',
      }),
    ).rejects.toThrow(/no content/i);
  });

  it('changes the language pair while the document is still a draft', async () => {
    const c = await seed();
    const blueprintId = await createPublished(c);
    const issuedId = await issueTo(c, blueprintId);

    await asAdmin(c).mutation(api.issuedDocuments.setLocalePair, {
      issuedDocumentId: issuedId,
      primaryLocale: 'hy',
      secondaryLocale: 'en',
    });
    const row = await asAdmin(c).query(api.issuedDocuments.get, { issuedDocumentId: issuedId });
    expect(row?.secondaryLocale).toBe('en');
  });
});

describe('issuedDocuments.sendForSignature', () => {
  const content =
    '__DOC__{"version":2,"source":"blueprint","blocks":[{"type":"paragraph","text":"x"}]}';

  it('freezes the document, links the signature request and notifies the recipient', async () => {
    const c = await seed();
    const blueprintId = await createPublished(c);
    const issuedId = await issueTo(c, blueprintId);

    const result = await asAdmin(c).mutation(api.issuedDocuments.sendForSignature, {
      issuedDocumentId: issuedId,
      content,
      title: 'ՊԱՅՄԱՆԱԳԻՐ / ДОГОВОР',
      accent: 'blue',
      orgName: 'Acme',
      countersignerId: c.adminId,
    });

    expect(result.documentNumber).toMatch(/^HR-\d{4}-\d{3}$/);

    const row = await asAdmin(c).query(api.issuedDocuments.get, { issuedDocumentId: issuedId });
    expect(row?.status).toBe('sent');
    expect(row?.signatureDocumentId).toBe(result.signatureDocumentId);

    const state = await c.t.run(async (ctx) => {
      const doc = await ctx.db.get(result.signatureDocumentId);
      const requests = await ctx.db.query('signatureRequests').collect();
      const notifications = await ctx.db.query('notifications').collect();
      return {
        // The hash is computed server-side over the frozen text.
        contentHash: doc?.contentHash,
        signers: requests.map((r) => ({ userId: r.signerId, order: r.order })),
        notified: notifications.map((n) => n.userId),
      };
    });

    expect(state.contentHash).toMatch(/^[a-f0-9]{64}$/);
    // The recipient signs first, the organization countersigns.
    expect(state.signers).toEqual([
      { userId: c.employeeId, order: 1 },
      { userId: c.adminId, order: 2 },
    ]);
    expect(state.notified).toContain(c.employeeId);
  });

  it('refuses to edit, re-send, cancel or delete a frozen document', async () => {
    const c = await seed();
    const blueprintId = await createPublished(c);
    const issuedId = await issueTo(c, blueprintId);
    await asAdmin(c).mutation(api.issuedDocuments.sendForSignature, {
      issuedDocumentId: issuedId,
      content,
      title: 'x',
      accent: 'blue',
      orgName: 'Acme',
    });

    await expect(
      asAdmin(c).mutation(api.issuedDocuments.sendForSignature, {
        issuedDocumentId: issuedId,
        content,
        title: 'x',
        accent: 'blue',
        orgName: 'Acme',
      }),
    ).rejects.toThrow(/already been sent/i);
    await expect(
      asAdmin(c).mutation(api.issuedDocuments.setLocalePair, {
        issuedDocumentId: issuedId,
        primaryLocale: 'ru',
      }),
    ).rejects.toThrow(/already been sent/i);
    await expect(
      asAdmin(c).mutation(api.issuedDocuments.applyDocxOverride, {
        issuedDocumentId: issuedId,
        blocksJson: '[{"type":"paragraph","text":"y"}]',
      }),
    ).rejects.toThrow(/already been sent/i);
    await expect(
      asAdmin(c).mutation(api.issuedDocuments.cancel, { issuedDocumentId: issuedId }),
    ).rejects.toThrow(/cancel the signature request first/i);
    await expect(
      asAdmin(c).mutation(api.issuedDocuments.remove, { issuedDocumentId: issuedId }),
    ).rejects.toThrow(/cannot be deleted/i);
  });

  it('refuses an empty body', async () => {
    const c = await seed();
    const blueprintId = await createPublished(c);
    const issuedId = await issueTo(c, blueprintId);

    await expect(
      asAdmin(c).mutation(api.issuedDocuments.sendForSignature, {
        issuedDocumentId: issuedId,
        content: '   ',
        title: 'x',
        accent: 'blue',
        orgName: 'Acme',
      }),
    ).rejects.toThrow(/empty document/i);
  });

  it('refuses a countersigner from another organization', async () => {
    const c = await seed();
    const blueprintId = await createPublished(c);
    const issuedId = await issueTo(c, blueprintId);

    await expect(
      asAdmin(c).mutation(api.issuedDocuments.sendForSignature, {
        issuedDocumentId: issuedId,
        content,
        title: 'x',
        accent: 'blue',
        orgName: 'Acme',
        countersignerId: c.outsiderId,
      }),
    ).rejects.toThrow(/different organization/i);
  });
});

describe('issuedDocuments visibility', () => {
  it('shows an employee their sent documents but not the drafts', async () => {
    const c = await seed();
    const blueprintId = await createPublished(c);
    const draftId = await issueTo(c, blueprintId);
    const sentId = await issueTo(c, blueprintId);

    await asAdmin(c).mutation(api.issuedDocuments.sendForSignature, {
      issuedDocumentId: sentId,
      content:
        '__DOC__{"version":2,"source":"blueprint","blocks":[{"type":"paragraph","text":"x"}]}',
      title: 'Sent one',
      accent: 'blue',
      orgName: 'Acme',
    });

    const mine = await asEmployee(c).query(api.issuedDocuments.listMine, {});
    expect(mine.map((row) => row._id)).toEqual([sentId]);

    // A draft prepared for them is internal until it is actually sent.
    expect(
      await asEmployee(c).query(api.issuedDocuments.get, { issuedDocumentId: draftId }),
    ).toBeNull();
    expect(
      (await asEmployee(c).query(api.issuedDocuments.get, { issuedDocumentId: sentId }))?.title,
    ).toBe('Sent one');
  });

  it('keeps the registry inside the organization', async () => {
    const c = await seed();
    const blueprintId = await createPublished(c);
    const issuedId = await issueTo(c, blueprintId);

    expect(await asOutsider(c).query(api.issuedDocuments.list, {})).toEqual([]);
    expect(
      await asOutsider(c).query(api.issuedDocuments.get, { issuedDocumentId: issuedId }),
    ).toBeNull();
    expect(await asEmployee(c).query(api.issuedDocuments.list, {})).toEqual([]);
  });

  it('counts documents by status', async () => {
    const c = await seed();
    const blueprintId = await createPublished(c);
    await issueTo(c, blueprintId);
    const editedId = await issueTo(c, blueprintId);
    await asAdmin(c).mutation(api.issuedDocuments.applyDocxOverride, {
      issuedDocumentId: editedId,
      blocksJson: '[{"type":"paragraph","text":"y"}]',
    });

    const summary = await asAdmin(c).query(api.issuedDocuments.getSummary, {});
    expect(summary).toMatchObject({ total: 2, draft: 1, edited: 1, sent: 0, signed: 0 });
  });

  it('filters and searches the registry', async () => {
    const c = await seed();
    const blueprintId = await createPublished(c);
    await issueTo(c, blueprintId, { title: 'Contract for Anna' });
    await issueTo(c, blueprintId, { title: 'Consent form' });

    const byTitle = await asAdmin(c).query(api.issuedDocuments.list, { search: 'consent' });
    expect(byTitle.map((row) => row.title)).toEqual(['Consent form']);

    const byRecipient = await asAdmin(c).query(api.issuedDocuments.list, {
      recipientId: c.employeeId,
    });
    expect(byRecipient).toHaveLength(2);
    expect(byRecipient[0]?.recipientName).toBe('Anna Petrosyan');

    const drafts = await asAdmin(c).query(api.issuedDocuments.list, { status: 'draft' });
    expect(drafts).toHaveLength(2);
  });
});

describe('issuedDocuments cancellation', () => {
  it('cancels a draft and then allows deleting it', async () => {
    const c = await seed();
    const blueprintId = await createPublished(c);
    const issuedId = await issueTo(c, blueprintId);

    await asAdmin(c).mutation(api.issuedDocuments.cancel, { issuedDocumentId: issuedId });
    const row = await asAdmin(c).query(api.issuedDocuments.get, { issuedDocumentId: issuedId });
    expect(row?.status).toBe('cancelled');

    await asAdmin(c).mutation(api.issuedDocuments.remove, { issuedDocumentId: issuedId });
    expect(
      await asAdmin(c).query(api.issuedDocuments.get, { issuedDocumentId: issuedId }),
    ).toBeNull();
  });

  it('refuses every mutation from an employee', async () => {
    const c = await seed();
    const blueprintId = await createPublished(c);
    const issuedId = await issueTo(c, blueprintId);

    await expect(
      asEmployee(c).mutation(api.issuedDocuments.cancel, { issuedDocumentId: issuedId }),
    ).rejects.toThrow(/staff access required/i);
    await expect(
      asEmployee(c).mutation(api.issuedDocuments.applyDocxOverride, {
        issuedDocumentId: issuedId,
        blocksJson: '[{"type":"paragraph","text":"y"}]',
      }),
    ).rejects.toThrow(/staff access required/i);
  });
});

/** Insert an issued-document row directly, skipping the product paths. */
async function ghostIssue(
  c: Ctx,
  status: 'draft' | 'edited' | 'sent' | 'signed' | 'cancelled',
  overrides: Record<string, unknown> = {},
): Promise<Id<'issuedDocuments'>> {
  return c.t.run(async (ctx) => {
    return ctx.db.insert('issuedDocuments', {
      organizationId: c.organizationId,
      recipientId: c.employeeId,
      source: 'blueprint',
      primaryLocale: 'hy',
      title: 'Ghost',
      status,
      issuedBy: c.adminId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...overrides,
    } as never);
  });
}

describe('issuedDocuments defensive paths', () => {
  it('requires a non-empty title when issuing', async () => {
    const c = await seed();
    await expect(
      asAdmin(c).mutation(api.issuedDocuments.issue, {
        organizationId: c.organizationId,
        recipientIds: [c.employeeId],
        source: 'blueprint',
        blueprintId: await createPublished(c),
        primaryLocale: 'hy',
        title: '   ',
      }),
    ).rejects.toThrow(/a document needs a title/i);
  });

  it('refuses to cancel a signed document', async () => {
    const c = await seed();
    const issuedId = await ghostIssue(c, 'signed');
    await expect(
      asAdmin(c).mutation(api.issuedDocuments.cancel, { issuedDocumentId: issuedId }),
    ).rejects.toThrow(/signed document cannot be cancelled/i);
  });

  it('refuses to edit a signed document', async () => {
    const c = await seed();
    const issuedId = await ghostIssue(c, 'signed');
    await expect(
      asAdmin(c).mutation(api.issuedDocuments.setLocalePair, {
        issuedDocumentId: issuedId,
        primaryLocale: 'ru',
      }),
    ).rejects.toThrow(/signed and can no longer be changed/i);
  });

  it('refuses to edit a cancelled document', async () => {
    const c = await seed();
    const blueprintId = await createPublished(c);
    const issuedId = await issueTo(c, blueprintId);
    await asAdmin(c).mutation(api.issuedDocuments.cancel, { issuedDocumentId: issuedId });

    await expect(
      asAdmin(c).mutation(api.issuedDocuments.setLocalePair, {
        issuedDocumentId: issuedId,
        primaryLocale: 'ru',
      }),
    ).rejects.toThrow(/was cancelled/i);
  });

  it('reports the catalog template id as the render source', async () => {
    const c = await seed();
    const result = await asAdmin(c).mutation(api.issuedDocuments.issue, {
      organizationId: c.organizationId,
      recipientIds: [c.employeeId],
      source: 'catalog',
      templateId: 'employment-contract',
      primaryLocale: 'hy',
      title: 'Employment contract',
    });
    const issuedId = result.ids[0];
    if (!issuedId) throw new Error('nothing was issued');

    const source = await asAdmin(c).query(api.issuedDocuments.getRenderSource, {
      issuedDocumentId: issuedId,
    });
    expect(source).toEqual({
      source: 'catalog',
      templateId: 'employment-contract',
      snapshot: null,
    });
  });

  it('degrades a blueprint document with no pinned version to a bare source', async () => {
    const c = await seed();
    const issuedId = await ghostIssue(c, 'draft', { source: 'blueprint' });

    const source = await asAdmin(c).query(api.issuedDocuments.getRenderSource, {
      issuedDocumentId: issuedId,
    });
    expect(source).toEqual({ source: 'blueprint', templateId: null, snapshot: null });
  });
});
