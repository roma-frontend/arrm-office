'use client';

/**
 * On-screen rendering of a document body — the same block model the PDF and DOCX
 * exporters consume, so what the editor shows is what gets printed.
 *
 * Shared by the hiring packet panel, the template editor and the issued-document
 * registry: three places that previously would have grown three previews.
 */
import type { DocumentBlock, DocumentLeafBlock, RenderableDocument } from '@/lib/exportDocument';

/** One column's worth of blocks (or a whole single-language document). */
export function ColumnBlocks({ blocks }: { blocks: DocumentLeafBlock[] }) {
  return (
    <div className="space-y-3">
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'section':
            return (
              <h4
                key={index}
                className="text-[11px] font-semibold uppercase tracking-wide text-(--text-primary)"
              >
                {block.index != null ? `${block.index}. ` : ''}
                {block.title}
              </h4>
            );
          case 'paragraph':
            return (
              <p
                key={index}
                className={`text-xs leading-relaxed text-justify ${
                  block.muted ? 'text-(--text-muted) italic' : 'text-(--text-muted)'
                }`}
              >
                {block.text}
              </p>
            );
          case 'callout':
            return (
              <p
                key={index}
                className="text-xs leading-relaxed text-(--text-muted) border-l-2 border-primary/60 pl-3"
              >
                {block.text}
              </p>
            );
          case 'fields':
            return (
              <dl key={index} className="space-y-1">
                {block.rows.map((row, rowIndex) => (
                  <div key={rowIndex} className="flex gap-2 text-xs">
                    <dt className="text-(--text-muted) shrink-0">{row.label}:</dt>
                    <dd className="font-medium text-(--text-primary) break-words">
                      {row.value || '—'}
                    </dd>
                  </div>
                ))}
              </dl>
            );
          case 'bullets':
            return (
              <ul key={index} className="list-disc pl-4 space-y-1">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex} className="text-xs text-(--text-muted)">
                    {item}
                  </li>
                ))}
              </ul>
            );
          case 'signatures':
            return (
              <div key={index} className="grid grid-cols-2 gap-4 pt-4">
                {block.parties.map((party, partyIndex) => (
                  <div key={partyIndex} className="space-y-1">
                    <p className="text-[10px] font-semibold uppercase text-primary">{party.role}</p>
                    {party.signatureImage ? (
                      // eslint-disable-next-line @next/next/no-img-element -- base64 data URL, not a remote asset
                      <img
                        src={party.signatureImage}
                        alt=""
                        className="h-8 object-contain border-b border-(--border)"
                      />
                    ) : (
                      <div className="h-8 border-b border-(--border)" />
                    )}
                    <p className="text-[10px] text-(--text-muted)">
                      {party.nameLabel}: {party.name || '—'}
                    </p>
                    {party.position && (
                      <p className="text-[10px] text-(--text-muted)">
                        {party.positionLabel}: {party.position}
                      </p>
                    )}
                    {party.date && (
                      <p className="text-[10px] text-(--text-muted)">
                        {party.dateLabel}: {party.date}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            );
          case 'spacer':
            return <div key={index} style={{ height: block.size ?? 8 }} />;
          default:
            return null;
        }
      })}
    </div>
  );
}

/**
 * Two-column preview mirroring the printed A4 page: the binding language on the
 * left, its translation on the right, row aligned with row.
 */
export function DocumentBlocksPreview({ blocks }: { blocks: DocumentBlock[] }) {
  return (
    <div className="space-y-6">
      {blocks.map((block, index) => {
        if (block.type !== 'bilingual') {
          return <ColumnBlocks key={index} blocks={[block]} />;
        }
        return (
          <div key={index} className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              {block.leftLabel && (
                <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">
                  {block.leftLabel}
                </p>
              )}
              <ColumnBlocks blocks={block.left} />
            </div>
            <div className="space-y-3 border-l border-(--border) pl-6">
              {block.rightLabel && (
                <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">
                  {block.rightLabel}
                </p>
              )}
              <ColumnBlocks blocks={block.right} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Preview of a whole renderable document (string bodies fall back to prose). */
export function DocumentPreview({ doc }: { doc: RenderableDocument }) {
  const blocks = Array.isArray(doc.body) ? doc.body : [];
  if (blocks.length === 0 && typeof doc.body === 'string') {
    return (
      <div className="space-y-2">
        {doc.body.split(/\n{2,}/).map((paragraph, index) => (
          <p key={index} className="text-xs leading-relaxed text-(--text-muted) text-justify">
            {paragraph}
          </p>
        ))}
      </div>
    );
  }
  return <DocumentBlocksPreview blocks={blocks} />;
}

/**
 * The preview wrapped in a page-like sheet — white, centred, A4 proportions.
 * Used where the preview stands on its own rather than inside a dialog.
 */
export function DocumentSheet({
  title,
  meta,
  blocks,
  accentHex,
}: {
  title: string;
  meta?: string;
  blocks: DocumentBlock[];
  accentHex?: string;
}) {
  return (
    <div className="mx-auto w-full max-w-[820px] rounded-xl border border-(--border) bg-white p-8 shadow-sm dark:bg-(--surface-3)">
      <div className="mb-6 border-b-2 pb-3" style={{ borderColor: accentHex ?? 'var(--border)' }}>
        <h3 className="text-center text-sm font-semibold uppercase tracking-wide text-(--text-primary)">
          {title || '—'}
        </h3>
        {meta && <p className="mt-1 text-center text-[10px] text-(--text-muted)">{meta}</p>}
      </div>
      <DocumentBlocksPreview blocks={blocks} />
    </div>
  );
}
