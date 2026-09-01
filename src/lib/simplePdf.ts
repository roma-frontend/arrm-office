/**
 * Minimal PDF generator — no heavy dependencies (pdfmake, jspdf).
 *
 * Creates a valid PDF 1.4 file from plain text. The output is intentionally
 * simple: Helvetica font, auto-paginated A4, left-aligned text. Good enough
 * for template documents where the alternative is loading a 500KB library
 * that blocks the main thread for seconds.
 */

/** Escape special PDF string characters. */
function escapePdfString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/\r/g, '');
}

/** Split text into lines that fit within `maxChars` per line. */
function wrapText(text: string, maxChars = 80): string[] {
  const lines: string[] = [];
  for (const raw of text.split('\n')) {
    if (raw.length <= maxChars) {
      lines.push(raw);
      continue;
    }
    // Word-wrap
    let remaining = raw;
    while (remaining.length > maxChars) {
      let breakAt = remaining.lastIndexOf(' ', maxChars);
      if (breakAt <= 0) breakAt = maxChars;
      lines.push(remaining.slice(0, breakAt));
      remaining = remaining.slice(breakAt).trimStart();
    }
    if (remaining) lines.push(remaining);
  }
  return lines;
}

/**
 * Generate a base64 data-URL of a minimal PDF containing `title` and `body`.
 *
 * A4 page = 595 × 842 pt. Margins: 60 pt left/right, 72 pt top/bottom.
 * Usable width = 475 pt. Line height = 14 pt. Max ~52 lines per page.
 */
export function generateSimplePdfBase64(title: string, body: string): string {
  const PAGE_W = 595;
  const PAGE_H = 842;
  const MARGIN_L = 60;
  const MARGIN_R = 60;
  const MARGIN_TOP = 72;
  const MARGIN_BOT = 72;
  const USABLE_W = PAGE_W - MARGIN_L - MARGIN_R;
  const LINE_H = 14;
  const FONT_SIZE = 11;
  const TITLE_SIZE = 16;
  const TITLE_LINE_H = 20;
  const MAX_CHARS = Math.floor(USABLE_W / (FONT_SIZE * 0.5));

  // Build all text lines: title + blank + body
  const titleLines = wrapText(title, MAX_CHARS);
  const bodyLines = wrapText(body, MAX_CHARS);
  const allLines = [
    ...titleLines,
    '', // blank separator
    ...bodyLines,
  ];

  // Paginate
  const linesPerPage = Math.floor((PAGE_H - MARGIN_TOP - MARGIN_BOT) / LINE_H);
  const pages: string[][] = [];
  for (let i = 0; i < allLines.length; i += linesPerPage) {
    pages.push(allLines.slice(i, i + linesPerPage));
  }
  if (pages.length === 0) pages.push(['']);

  // Build PDF objects
  const objects: string[] = [];
  const offsets: number[] = [];

  function addObject(content: string): number {
    const idx = objects.length + 1;
    objects.push(`${idx} 0 obj\n${content}\nendobj\n`);
    return idx;
  }

  // Obj 1: Catalog
  const catalogIdx = addObject('<</Type /Catalog /Pages 2 0 R>>');

  // Obj 2: Pages
  const pageRefs = pages.map((_, i) => `${3 + i} 0 R`).join(' ');
  const pagesIdx = addObject(`<</Type /Pages /Kids [${pageRefs}] /Count ${pages.length}>>`);

  // Obj 3+: Page objects + content streams
  const contentObjIndices: number[] = [];
  for (let p = 0; p < pages.length; p++) {
    const contentIdx = 3 + pages.length + p;
    contentObjIndices.push(contentIdx);

    const pageIdx = addObject(
      `<</Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentIdx} 0 R /Resources <</Font <</F1 3 + pages.length * 2 0 R /F2 3 + pages.length * 2 + 1 0 R>>>>>>`,
    );
  }

  // Content stream objects
  const streamObjs: string[] = [];
  for (let p = 0; p < pages.length; p++) {
    const pageLines = pages[p]!;
    const streamLines: string[] = ['BT', `/F1 ${FONT_SIZE} Tf`];

    let y = PAGE_H - MARGIN_TOP;
    for (let i = 0; i < pageLines.length; i++) {
      const line = pageLines[i]!;
      // First line of page uses title font if it's the very first page
      if (p === 0 && i < titleLines.length) {
        streamLines.push(`/F2 ${TITLE_SIZE} Tf`);
        streamLines.push(`${MARGIN_L} ${y} Td`);
        streamLines.push(`(${escapePdfString(line)}) Tj`);
        streamLines.push(`0 -${TITLE_LINE_H} Td`);
        streamLines.push(`/F1 ${FONT_SIZE} Tf`);
        y -= TITLE_LINE_H;
      } else {
        streamLines.push(`${i === 0 && p === 0 ? 0 : 0} ${i === 0 ? -LINE_H : -LINE_H} Td`);
        streamLines.push(`(${escapePdfString(line)}) Tj`);
        y -= LINE_H;
      }
    }

    streamLines.push('ET');
    const streamContent = streamLines.join('\n');
    streamObjs.push(`<</Length ${streamContent.length}>>\nstream\n${streamContent}\nendstream`);
  }

  // Font objects (2 fonts: F1 = body, F2 = title)
  const fontBase = 3 + pages.length * 2;
  const font1Idx = fontBase;
  const font2Idx = fontBase + 1;

  // Assemble full PDF
  let pdf = '%PDF-1.4\n';

  // Write objects and record offsets
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length);
    pdf += objects[i]!;
  }
  for (let p = 0; p < pages.length; p++) {
    offsets.push(pdf.length);
    pdf += `${contentObjIndices[p]} 0 obj\n${streamObjs[p]}\nendobj\n`;
  }
  offsets.push(pdf.length);
  pdf += `${font1Idx} 0 obj\n<</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>\nendobj\n`;
  offsets.push(pdf.length);
  pdf += `${font2Idx} 0 obj\n<</Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold>>\nendobj\n`;

  // Cross-reference table
  const xrefOffset = pdf.length;
  const totalObjs = objects.length + pages.length + 2;
  pdf += `xref\n0 ${totalObjs + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 0; i < totalObjs; i++) {
    pdf += `${String(offsets[i] ?? 0).padStart(10, '0')} 00000 n \n`;
  }

  // Trailer
  pdf += `trailer\n<</Size ${totalObjs + 1} /Root ${catalogIdx} 0 R>>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF`;

  // Encode to base64
  const base64 = btoa(unescape(encodeURIComponent(pdf)));
  return `data:application/pdf;base64,${base64}`;
}
