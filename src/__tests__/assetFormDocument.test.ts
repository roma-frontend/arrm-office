/**
 * Tests for assetFormDocument.ts — the shared builder for asset handover /
 * return acts ("Акт приёма-передачи").
 *
 * Covers: content parsing across all three storage generations, localization of
 * every rendered label/date, structural layout (sections + definition tables +
 * signature grid), the document reference, and the file name.
 */

import type { TFunction } from 'i18next';
import {
  assetFormDocumentNumber,
  assetFormFileName,
  assetFormInputFromParsed,
  assetFormTitle,
  buildAssetFormBlocks,
  parseAssetFormContent,
  type AssetFormInput,
} from '@/lib/assetFormDocument';
import { documentBodyToPlainText } from '@/lib/exportDocument';

/** Minimal i18n stub: returns `ru[key]` when known, else the default value. */
function makeT(dict: Record<string, string> = {}): TFunction {
  const t = (key: string, defaultValue?: string) => dict[key] ?? defaultValue ?? key;
  return t as unknown as TFunction;
}

const RU = {
  'assets.pdf.movementForm': 'Акт приёма-передачи',
  'assets.pdf.returnForm': 'Акт возврата актива',
  'assets.pdf.assetDetails': 'Детали актива',
  'assets.pdf.handoverDetails': 'Детали передачи',
  'assets.pdf.returnDetails': 'Детали возврата',
  'assets.pdf.handedTo': 'Кому передано',
  'assets.pdf.handedBy': 'Кто передал',
  'assets.pdf.returnedBy': 'Кто вернул',
  'assets.pdf.receivedBy': 'Кто принял',
  'assets.pdf.transferDate': 'Дата передачи',
  'assets.pdf.dateOfReturn': 'Дата возврата',
  'assets.pdf.signatures': 'Подписи',
  'assets.pdf.terms': 'Положения и условия',
  'assets.pdf.acknowledgement': 'Подтверждение',
  'assets.pdf.employeeParty': 'Сотрудник',
  'assets.pdf.adminParty': 'Администратор / HR',
  'assets.pdf.documentNo': 'Документ №',
  'assets.pdf.signerName': 'Имя',
  'assets.pdf.date': 'Дата',
  'assets.pdf.assetTag': 'Инвентарный номер',
  'assets.pdf.brandModel': 'Бренд / Модель',
  'assets.name': 'Название',
  'assets.serialNumber': 'Серийный номер',
  'assets.categoryLabel': 'Категория',
  'assets.location': 'Местоположение',
  'assets.category.laptop': 'Ноутбук',
  'assets.condition.good': 'Хорошее',
  'assets.conditionLabel': 'Состояние',
};

const TS_2026_08_01 = new Date(2026, 7, 1, 12, 0, 0).getTime();

const baseInput: AssetFormInput = {
  isReturn: false,
  assetName: 'Lenovo ThinkPad X1 Carbon',
  assetSerial: 'EVG56LV44',
  assetTag: 'IT-0042',
  categoryLabel: 'Ноутбук',
  brand: 'Lenovo',
  model: 'X1 Carbon Gen 11',
  location: 'Офис A, 3 этаж',
  employeeName: 'Cane Corso',
  employeeEmail: 'canecorsoyan@gmail.com',
  employeePosition: 'QA Engineer',
  adminName: 'Роман',
  dateTs: TS_2026_08_01,
  condition: 'good',
};

// ── parseAssetFormContent ────────────────────────────────────────────────────
describe('parseAssetFormContent', () => {
  it('parses new-generation movement JSON', () => {
    const content = `__MF__${JSON.stringify({ assetName: 'Laptop', assigneeName: 'Bob' })}`;
    expect(parseAssetFormContent(content)).toEqual({
      type: 'movement',
      data: { assetName: 'Laptop', assigneeName: 'Bob' },
    });
  });

  it('parses new-generation return JSON', () => {
    const content = `__RF__${JSON.stringify({ assetName: 'Laptop', returnerName: 'Admin' })}`;
    expect(parseAssetFormContent(content)?.type).toBe('return');
  });

  it('returns null for malformed JSON payloads', () => {
    expect(parseAssetFormContent('__MF__{not json')).toBeNull();
  });

  it('returns null for unrelated documents', () => {
    expect(parseAssetFormContent('# Employment Contract\n\nParty A and Party B…')).toBeNull();
  });

  it('extracts fields from legacy English markdown movement forms', () => {
    const legacy =
      '# Asset Movement Form\n**Asset:** MacBook Pro **Handed To:** Alice ' +
      '**Handed By:** Admin **Date of Transfer:** August 1, 2026';
    const parsed = parseAssetFormContent(legacy);
    expect(parsed).toEqual({
      type: 'movement',
      data: {
        assetName: 'MacBook Pro',
        assigneeName: 'Alice',
        assignerName: 'Admin',
        date: 'August 1, 2026',
      },
    });
  });

  it('extracts fields from legacy return forms and keeps the two parties apart', () => {
    const legacy =
      '# Asset Return Form\n**Asset:** MacBook Pro **Returned By:** Alice ' +
      '**Received By:** Admin **Condition:** good **Date of Return:** August 1, 2026';
    const input = assetFormInputFromParsed(parseAssetFormContent(legacy)!, { t: makeT() });
    expect(input.isReturn).toBe(true);
    expect(input.employeeName).toBe('Alice');
    expect(input.adminName).toBe('Admin');
  });
});

// ── assetFormInputFromParsed ─────────────────────────────────────────────────
describe('assetFormInputFromParsed', () => {
  it('maps new return JSON: assignee is the employee, returner is the admin', () => {
    const content = `__RF__${JSON.stringify({
      assetName: 'Laptop',
      assigneeName: 'Alice',
      returnerName: 'Admin',
      category: 'laptop',
      dateTs: TS_2026_08_01,
    })}`;
    const input = assetFormInputFromParsed(parseAssetFormContent(content)!, { t: makeT(RU) });
    expect(input.employeeName).toBe('Alice');
    expect(input.adminName).toBe('Admin');
    expect(input.dateTs).toBe(TS_2026_08_01);
    expect(input.categoryLabel).toBe('Ноутбук');
  });

  it('keeps the legacy pre-formatted date when no timestamp is stored', () => {
    const content = `__MF__${JSON.stringify({ assetName: 'X', date: 'August 1, 2026' })}`;
    const input = assetFormInputFromParsed(parseAssetFormContent(content)!, { t: makeT() });
    expect(input.dateTs).toBeUndefined();
    expect(input.dateText).toBe('August 1, 2026');
  });
});

// ── buildAssetFormBlocks ─────────────────────────────────────────────────────
describe('buildAssetFormBlocks', () => {
  it('produces four numbered sections with tables and a signature grid', () => {
    const blocks = buildAssetFormBlocks(baseInput, makeT(RU), 'ru');
    const sections = blocks.filter((b) => b.type === 'section');
    expect(sections.map((s: any) => s.index)).toEqual([1, 2, 3, 4]);
    expect(blocks.filter((b) => b.type === 'fields')).toHaveLength(2);
    expect(blocks.some((b) => b.type === 'signatures')).toBe(true);
  });

  it('never collapses the act into a single paragraph', () => {
    const blocks = buildAssetFormBlocks(baseInput, makeT(RU), 'ru');
    // Exactly one prose paragraph (the terms); everything else is structured.
    expect(blocks.filter((b) => b.type === 'paragraph')).toHaveLength(1);
  });

  it('renders every label in the active language and drops empty rows', () => {
    const blocks = buildAssetFormBlocks(baseInput, makeT(RU), 'ru');
    const text = documentBodyToPlainText(blocks);
    expect(text).toContain('ДЕТАЛИ АКТИВА');
    expect(text).toContain('Серийный номер: EVG56LV44');
    expect(text).toContain('Инвентарный номер: IT-0042');
    expect(text).toContain('Бренд / Модель: Lenovo X1 Carbon Gen 11');
    expect(text).toContain('Кому передано: Cane Corso');
    expect(text).toContain('Кто передал: Роман');
    expect(text).not.toContain(': —'); // no placeholder rows for absent data
  });

  it('formats the date in the document language, not en-US', () => {
    const ru = documentBodyToPlainText(buildAssetFormBlocks(baseInput, makeT(RU), 'ru'));
    expect(ru).toContain('Дата передачи: 1 августа 2026');
    expect(ru).not.toContain('August 1, 2026');

    const en = documentBodyToPlainText(buildAssetFormBlocks(baseInput, makeT(), 'en'));
    expect(en).toContain('1 August 2026');
  });

  it('translates the condition key', () => {
    const text = documentBodyToPlainText(buildAssetFormBlocks(baseInput, makeT(RU), 'ru'));
    expect(text).toContain('Состояние: Хорошее');
    expect(text).not.toContain('Состояние: good');
  });

  it('switches labels and terms for return acts', () => {
    const text = documentBodyToPlainText(
      buildAssetFormBlocks({ ...baseInput, isReturn: true }, makeT(RU), 'ru'),
    );
    expect(text).toContain('ДЕТАЛИ ВОЗВРАТА');
    expect(text).toContain('Кто вернул: Cane Corso');
    expect(text).toContain('Кто принял: Роман');
    expect(text).toContain('Дата возврата');
  });

  it('bakes the drawn signature and signer into the employee party', () => {
    const blocks = buildAssetFormBlocks(
      {
        ...baseInput,
        signature: {
          image: 'data:image/png;base64,AAA',
          signerName: 'Cane Corso',
          signedAt: TS_2026_08_01,
        },
      },
      makeT(RU),
      'ru',
    );
    const sig: any = blocks.find((b) => b.type === 'signatures');
    expect(sig.parties).toHaveLength(2);
    expect(sig.parties[0].signatureImage).toBe('data:image/png;base64,AAA');
    expect(sig.parties[0].role).toBe('Сотрудник');
    expect(sig.parties[1].role).toBe('Администратор / HR');
    expect(sig.parties[1].signatureImage).toBeUndefined();
  });

  it('falls back to the legacy date text when no timestamp exists', () => {
    const text = documentBodyToPlainText(
      buildAssetFormBlocks(
        { ...baseInput, dateTs: undefined, dateText: 'August 1, 2026' },
        makeT(RU),
        'ru',
      ),
    );
    expect(text).toContain('Дата передачи: August 1, 2026');
  });
});

// ── title / reference / file name ────────────────────────────────────────────
describe('assetFormTitle', () => {
  it('is localized and distinguishes handover from return', () => {
    expect(assetFormTitle(false, makeT(RU))).toBe('Акт приёма-передачи');
    expect(assetFormTitle(true, makeT(RU))).toBe('Акт возврата актива');
  });
});

describe('assetFormDocumentNumber', () => {
  it('is stable for the same act and language-neutral apart from the label', () => {
    const a = assetFormDocumentNumber(baseInput, makeT(RU));
    const b = assetFormDocumentNumber(baseInput, makeT(RU));
    expect(a).toBe(b);
    expect(a).toMatch(/^Документ № HO-20260801-[0-9A-Z]{4}$/);
  });

  it('uses a different prefix for return acts', () => {
    expect(assetFormDocumentNumber({ ...baseInput, isReturn: true }, makeT())).toMatch(
      /^Doc\. No\. RT-20260801-/,
    );
  });
});

describe('assetFormFileName', () => {
  it('slugifies the asset name per act type', () => {
    expect(assetFormFileName(baseInput)).toBe('handover_act_lenovo_thinkpad_x1_carbon.pdf');
    expect(assetFormFileName({ ...baseInput, isReturn: true })).toBe(
      'return_act_lenovo_thinkpad_x1_carbon.pdf',
    );
  });
});
