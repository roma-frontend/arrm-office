'use client';

/**
 * Shared builder for rendered issued documents.
 *
 * Extracted from IssuedDocumentsTab so both the staff registry and the
 * employee's "my documents" view render the exact same document: the pinned
 * blueprint version (never the blueprint's current text), the recipient's
 * merge data, and the signatures collected on the signature document.
 *
 * Rendering happens client-side because the fonts (Armenian glyphs) and both
 * exporters are browser-only.
 */
import { useCallback } from 'react';
import { useConvex } from 'convex/react';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { useDocumentLabels } from '@/hooks/useDocumentLabels';
import { useAuthStore } from '@/store/useAuthStore';
import {
  applySignaturesToBlocks,
  buildDocumentBlocks,
  buildSignatureGrid,
  collectSignaturesInOrder,
  documentTitle,
  parseTemplateBodyToBlocks,
  type DocumentSegment,
  type LocalePair,
} from '@/lib/bilingualDocument';
import type { DocumentBlock, RenderableDocument } from '@/lib/exportDocument';
import { getCatalogTemplate, localizedContent, type AccentColor } from '@/lib/documentCatalog';
import type { MergeSourceData } from '@/lib/documentTokens';
import { formatDate, type SupportedLocale } from '@/lib/date-format';

/** The subset of an issuedDocuments row the builder needs. */
export type BuildableIssuedRow = {
  _id: Id<'issuedDocuments'>;
  recipientId: Id<'users'>;
  recipientName: string;
  primaryLocale: SupportedLocale;
  secondaryLocale?: SupportedLocale;
  title: string;
  bodyOverride?: string;
  documentNumber?: string;
  signatureDocumentId?: Id<'signatureDocuments'>;
};

/** Authored text of a parsed block — the inverse used for catalog templates. */
export function blockText(block: ReturnType<typeof parseTemplateBodyToBlocks>[number]): string {
  switch (block.type) {
    case 'section':
      return block.index === undefined ? block.title : `${block.index}. ${block.title}`;
    case 'paragraph':
      return block.text;
    case 'callout':
      return block.text;
    case 'bullets':
      return block.items.map((item) => `- ${item}`).join('\n');
    case 'fields':
      return block.rows.map((row) => `${row.label}: ${row.value}`).join('\n');
    default:
      return '';
  }
}

/** Segment kind for position `index`, taken from whichever language has it. */
export function blockKind(
  perLocale: Map<SupportedLocale, ReturnType<typeof parseTemplateBodyToBlocks>>,
  index: number,
): DocumentSegment['kind'] {
  for (const blocks of perLocale.values()) {
    const block = blocks[index];
    if (!block) continue;
    switch (block.type) {
      case 'section':
        return 'section';
      case 'bullets':
        return 'bullets';
      case 'fields':
        return 'fields';
      case 'callout':
        return 'callout';
      default:
        return 'paragraph';
    }
  }
  return 'paragraph';
}

export function useBuildIssuedDocument() {
  const convex = useConvex();
  const labels = useDocumentLabels();
  const currentUser = useAuthStore((s) => s.user);
  const orgName = currentUser?.organizationName ?? '';

  /**
   * Build the renderable document for a row.
   *
   * Pulls the pinned blueprint version and the recipient's merge data, then
   * lays out the columns. Returns `null` when the source is gone, so the
   * caller can show a real error instead of an empty page.
   */
  const buildDoc = useCallback(
    async (
      row: BuildableIssuedRow,
      opts: { omitSignatures?: boolean; documentNumber?: string } = {},
    ): Promise<RenderableDocument | null> => {
      const locales: LocalePair = {
        primary: row.primaryLocale,
        secondary: row.secondaryLocale,
      };

      const [mergeData, renderSource, signatureDoc] = await Promise.all([
        convex.query(api.documentLibrary.getEmployeeMergeData, { userId: row.recipientId }),
        convex.query(api.issuedDocuments.getRenderSource, { issuedDocumentId: row._id }),
        // The signatures live on the signature document, not on the issued row.
        // Without fetching them the copy previewed or downloaded here had empty
        // signature boxes even after every party had signed.
        row.signatureDocumentId
          ? convex.query(api.signatures.getDocument, { documentId: row.signatureDocumentId })
          : Promise.resolve(null),
      ]);
      if (!mergeData || !renderSource) return null;

      // `getEmployeeMergeData` returns the employee and organization halves; the
      // signatory and the timestamp are the caller's contribution.
      const data: MergeSourceData = {
        employee: mergeData.employee,
        organization: mergeData.organization,
        signatory: { name: currentUser?.name ?? null, position: currentUser?.position ?? null },
        now: Date.now(),
      };
      let segments: DocumentSegment[] = [];
      let accent: AccentColor = 'blue';
      let signature = true;
      let titles: Record<string, string | undefined> = {};

      if (renderSource.source === 'blueprint') {
        if (!renderSource.snapshot) return null;
        segments = renderSource.snapshot.segments as DocumentSegment[];
        accent = renderSource.snapshot.accent;
        signature = renderSource.snapshot.signature;
        titles = renderSource.snapshot.titles;
      } else {
        const template = renderSource.templateId
          ? getCatalogTemplate(renderSource.templateId)
          : undefined;
        if (!template) return null;
        accent = template.accent;
        signature = template.signature;
        // Built-in templates keep one flat body per locale; turn each into the
        // same segment list the editor produces so both sources render alike.
        const perLocale = new Map<SupportedLocale, ReturnType<typeof parseTemplateBodyToBlocks>>();
        for (const locale of [locales.primary, locales.secondary].filter(
          Boolean,
        ) as SupportedLocale[]) {
          perLocale.set(locale, parseTemplateBodyToBlocks(localizedContent(template, locale).body));
          titles[locale] = localizedContent(template, locale).title;
        }
        const length = Math.max(...[...perLocale.values()].map((blocks) => blocks.length), 0);
        segments = Array.from({ length }, (_, index) => {
          const text: Record<string, string> = {};
          for (const [locale, blocks] of perLocale) {
            const block = blocks[index];
            if (!block) continue;
            text[locale] = blockText(block);
          }
          return { id: `c${index}`, kind: blockKind(perLocale, index), text };
        });
      }

      const recipientName = data.employee?.name ?? row.recipientName;
      const parties = signature
        ? [
            { id: 'recipient', name: recipientName, role: labels.signature },
            {
              id: 'issuer',
              name: currentUser?.name ?? '',
              position: currentUser?.position,
              role: currentUser?.position || labels.position,
            },
          ]
        : [];
      let blocks: DocumentBlock[];
      if (row.bodyOverride) {
        blocks = JSON.parse(row.bodyOverride) as DocumentBlock[];
        // The editable Word export strips the grid on purpose, so a hand-edited
        // body comes back without one and would have nowhere to hold either
        // signature. Re-attach it — filtering first so a legacy override that
        // does carry one never renders two.
        blocks = blocks.filter((block) => block.type !== 'signatures');
        const grid = opts.omitSignatures ? null : buildSignatureGrid(parties, labels);
        if (grid) blocks = [...blocks, grid];
      } else {
        blocks = buildDocumentBlocks({
          segments,
          locales,
          labels,
          data,
          omitSignatures: opts.omitSignatures || !signature,
          parties,
        });
      }

      const title = documentTitle(titles, locales, data) || row.title;

      return {
        title,
        documentNumber: opts.documentNumber ?? row.documentNumber,
        // Each party's own box is filled from its own signature request, in
        // signing order — recipient first, countersigner second.
        body: applySignaturesToBlocks(
          blocks,
          collectSignaturesInOrder(signatureDoc?.requests),
          (ts) =>
            formatDate(ts, locales.primary, { year: 'numeric', month: 'long', day: 'numeric' }),
        ),
        accent,
        signature: false, // the grid is part of `blocks` already
        orgName,
        now: Date.now(),
        // Dates and labels follow the binding language.
        lang: locales.primary,
        labels,
      };
    },
    [convex, currentUser?.name, currentUser?.position, labels, orgName],
  );

  return { buildDoc, labels, orgName, currentUser };
}
