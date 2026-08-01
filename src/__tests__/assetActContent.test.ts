/**
 * Tests for assetActContent.ts — the storage format of asset acts and the
 * backfill used by `migrations:backfillAssetActMetadata`.
 *
 * Focus: historical documents must end up with a canonical `dateTs` (so the date
 * renders in the reader's language), legacy markdown must become JSON, and the
 * backfill must be idempotent and never overwrite existing values.
 */

import {
  backfillAssetActContent,
  parseAssetFormContent,
  MOVEMENT_PREFIX,
  RETURN_PREFIX,
} from '@/lib/assetActContent';
import { assetFormInputFromParsed, buildAssetFormBlocks } from '@/lib/assetFormDocument';
import { documentBodyToPlainText } from '@/lib/exportDocument';
import type { TFunction } from 'i18next';

const CREATED_AT = new Date(2026, 6, 15, 9, 30).getTime(); // 15 July 2026
const AUG_1_2026 = Date.parse('August 1, 2026');

const ctx = {
  createdAt: CREATED_AT,
  asset: {
    serialNumber: 'EVG56LV44',
    assetTag: 'IT-0042',
    category: 'laptop',
    brand: 'Lenovo',
    model: 'X1 Carbon',
    location: 'Office A',
    condition: 'good',
  },
  assignee: { email: 'alice@example.com', position: 'QA Engineer' },
  assigner: { position: 'HR Manager' },
};

function makeT(): TFunction {
  return ((key: string, defaultValue?: string) => defaultValue ?? key) as unknown as TFunction;
}

describe('backfillAssetActContent', () => {
  it('recovers dateTs from the legacy English date string', () => {
    const content = `${MOVEMENT_PREFIX}${JSON.stringify({
      _type: 'movement',
      assetName: 'Laptop',
      assigneeName: 'Alice',
      assignerName: 'Admin',
      date: 'August 1, 2026',
    })}`;

    const next = backfillAssetActContent(content, ctx)!;
    expect(next.startsWith(MOVEMENT_PREFIX)).toBe(true);
    expect(parseAssetFormContent(next)!.data.dateTs).toBe(AUG_1_2026);
  });

  it('falls back to the document creation time when no date was stored', () => {
    const content = `${MOVEMENT_PREFIX}${JSON.stringify({ assetName: 'Laptop' })}`;
    const next = backfillAssetActContent(content, ctx)!;
    expect(parseAssetFormContent(next)!.data.dateTs).toBe(CREATED_AT);
  });

  it('fills asset and party details that were not captured at creation time', () => {
    const content = `${MOVEMENT_PREFIX}${JSON.stringify({ assetName: 'Laptop' })}`;
    const data = parseAssetFormContent(backfillAssetActContent(content, ctx)!)!.data;
    expect(data).toMatchObject({
      assetSerial: 'EVG56LV44',
      assetTag: 'IT-0042',
      category: 'laptop',
      brand: 'Lenovo',
      model: 'X1 Carbon',
      location: 'Office A',
      condition: 'good',
      assigneeEmail: 'alice@example.com',
      assigneePosition: 'QA Engineer',
      assignerPosition: 'HR Manager',
    });
  });

  it('never overwrites values already stored on the act', () => {
    const content = `${MOVEMENT_PREFIX}${JSON.stringify({
      _type: 'movement',
      assetName: 'Laptop',
      assetSerial: 'ORIGINAL-SN',
      dateTs: AUG_1_2026,
    })}`;
    const next = backfillAssetActContent(content, ctx)!;
    const data = parseAssetFormContent(next)!.data;
    expect(data.assetSerial).toBe('ORIGINAL-SN');
    expect(data.dateTs).toBe(AUG_1_2026);
  });

  it('keeps the recorded condition of a return act', () => {
    const content = `${RETURN_PREFIX}${JSON.stringify({
      _type: 'return',
      assetName: 'Laptop',
      returnerName: 'Admin',
      condition: 'damaged',
      dateTs: AUG_1_2026,
    })}`;
    const next = backfillAssetActContent(content, ctx);
    // Only the asset details are added; `condition` (damaged) stays untouched.
    expect(parseAssetFormContent(next!)!.data.condition).toBe('damaged');
  });

  it('converts legacy English markdown acts to the JSON format', () => {
    const legacy =
      '# Asset Movement Form\n**Asset:** MacBook Pro **Handed To:** Alice ' +
      '**Handed By:** Admin **Date of Transfer:** August 1, 2026';
    const next = backfillAssetActContent(legacy, ctx)!;
    expect(next.startsWith(MOVEMENT_PREFIX)).toBe(true);
    const data = parseAssetFormContent(next)!.data;
    expect(data).toMatchObject({
      _type: 'movement',
      assetName: 'MacBook Pro',
      assigneeName: 'Alice',
      assignerName: 'Admin',
      dateTs: AUG_1_2026,
    });
  });

  it('converts legacy return acts and keeps the two parties apart', () => {
    const legacy =
      '# Asset Return Form\n**Asset:** MacBook Pro **Returned By:** Alice ' +
      '**Received By:** Admin **Condition:** good **Date of Return:** August 1, 2026';
    const next = backfillAssetActContent(legacy, ctx)!;
    expect(next.startsWith(RETURN_PREFIX)).toBe(true);
    const input = assetFormInputFromParsed(parseAssetFormContent(next)!, { t: makeT() });
    expect(input.isReturn).toBe(true);
    expect(input.employeeName).toBe('Alice');
    expect(input.adminName).toBe('Admin');
    expect(input.dateTs).toBe(AUG_1_2026);
  });

  it('is idempotent — a second run reports no change', () => {
    const content = `${MOVEMENT_PREFIX}${JSON.stringify({ assetName: 'Laptop' })}`;
    const first = backfillAssetActContent(content, ctx)!;
    expect(backfillAssetActContent(first, ctx)).toBeNull();
  });

  it('leaves generic documents alone', () => {
    expect(
      backfillAssetActContent('# Employment Contract\n\nParty A and Party B…', ctx),
    ).toBeNull();
    expect(backfillAssetActContent('__MF__{not json', ctx)).toBeNull();
  });

  it('makes a migrated act render its date in the reader language', () => {
    const legacy =
      '# Asset Movement Form\n**Asset:** MacBook Pro **Handed To:** Alice ' +
      '**Handed By:** Admin **Date of Transfer:** August 1, 2026';

    // Before migration: only the English string exists, so that is what prints.
    const before = assetFormInputFromParsed(parseAssetFormContent(legacy)!, { t: makeT() });
    expect(before.dateTs).toBeUndefined();
    expect(documentBodyToPlainText(buildAssetFormBlocks(before, makeT(), 'ru'))).toContain(
      'August 1, 2026',
    );

    // After migration: the timestamp drives locale-aware formatting.
    const migrated = backfillAssetActContent(legacy, ctx)!;
    const after = assetFormInputFromParsed(parseAssetFormContent(migrated)!, { t: makeT() });
    const ru = documentBodyToPlainText(buildAssetFormBlocks(after, makeT(), 'ru'));
    expect(ru).toContain('1 августа 2026');
    expect(ru).not.toContain('August 1, 2026');
  });
});
