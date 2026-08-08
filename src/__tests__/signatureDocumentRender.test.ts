/**
 * The frozen body of an issued document has to reach the PDF as blocks.
 *
 * The document builder freezes its bilingual body into `signatureDocuments.content`
 * behind the `__DOC__` sentinel, but the signature renderer only ever parsed the
 * hiring packet's original `__HP__`. Every builder document therefore fell through
 * to the plain-text branch and printed its own JSON payload where the text should
 * have been — visible in the exported PDF as `__DOC__{"version":2,...}`.
 */

import { describe, it, expect } from '@jest/globals';
import { encodeDocumentContent, type FrozenDocument } from '@/lib/bilingualDocument';
import { toRenderableDocument } from '@/components/ESignaturesClient';
import type { DocumentLabels } from '@/lib/exportDocument';

const labels: DocumentLabels = {
  generatedOn: 'Generated on',
  documentNumber: 'No.',
  signature: 'Signature',
  fullName: 'Full name',
  position: 'Position',
  date: 'Date',
  page: 'Page',
  of: 'of',
  verified: 'Verified',
  hash: 'Hash',
} as DocumentLabels;

const frozen: FrozenDocument = {
  version: 2,
  source: 'blueprint',
  blueprintId: 'bp-1',
  blueprintVersion: 1,
  title: 'Եկամուտների մասին տեղեկանք / Справка о доходах',
  blocks: [
    {
      type: 'bilingual',
      left: [{ type: 'paragraph', text: 'Սույնով հաստատվում է' }],
      right: [{ type: 'paragraph', text: 'Настоящим подтверждается' }],
      leftLabel: 'ՀԱՅԵՐԵՆ',
      rightLabel: 'РУССКИЙ',
    },
  ],
  accent: 'emerald',
  orgName: 'ADB-ARRM',
  documentNumber: 'HR-2026-001',
  primaryLocale: 'hy',
  secondaryLocale: 'ru',
  labels,
};

const t = ((key: string) => key) as never;

function docWith(content: string) {
  return {
    _id: 'doc-1',
    title: 'Fallback title',
    content,
    status: 'completed',
    createdAt: 1_700_000_000_000,
    requests: [],
  } as never;
}

describe('signature document rendering', () => {
  it('renders a frozen bilingual body as blocks, not as its raw payload', () => {
    const renderable = toRenderableDocument(docWith(encodeDocumentContent(frozen)), labels, t);

    expect(Array.isArray(renderable.body)).toBe(true);
    expect(JSON.stringify(renderable.body)).not.toContain('__DOC__');
    expect(renderable.body[0]).toMatchObject({ type: 'bilingual' });
  });

  it('takes the title, number, accent and org from the frozen payload', () => {
    const renderable = toRenderableDocument(docWith(encodeDocumentContent(frozen)), labels, t);

    expect(renderable.title).toBe('Եկամուտների մասին տեղեկանք / Справка о доходах');
    expect(renderable.documentNumber).toBe('HR-2026-001');
    expect(renderable.accent).toBe('emerald');
    expect(renderable.orgName).toBe('ADB-ARRM');
    // Dates follow the binding language, not the interface language.
    expect(renderable.lang).toBe('hy');
  });

  it('carries the labels frozen with the document', () => {
    // An archive regenerated months later in another UI language must still match
    // the signed original.
    const renderable = toRenderableDocument(docWith(encodeDocumentContent(frozen)), labels, t);
    expect(renderable.labels).toEqual(labels);
  });

  it('does not draw a second signature block over the frozen grid', () => {
    const renderable = toRenderableDocument(docWith(encodeDocumentContent(frozen)), labels, t);
    expect(renderable.signature).toBe(false);
  });

  it('still reads a body frozen with the hiring packet sentinel', () => {
    const legacy = '__HP__' + JSON.stringify({ ...frozen, version: 1, templateId: 'tpl-1' });
    const renderable = toRenderableDocument(docWith(legacy), labels, t);

    expect(Array.isArray(renderable.body)).toBe(true);
    expect(renderable.title).toBe(frozen.title);
  });

  it('leaves genuinely plain content as text', () => {
    const renderable = toRenderableDocument(docWith('Dear employee, ...'), labels, t);
    expect(renderable.body).toBe('Dear employee, ...');
    expect(renderable.title).toBe('Fallback title');
  });
});
