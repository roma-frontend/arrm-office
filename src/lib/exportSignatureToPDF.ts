/**
 * Export signed e-signature documents to PDF (Browser-compatible using pdfmake)
 */

import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';

// pdfmake 0.3.x ships vfs_fonts as the font map itself (top-level keys are the
// *.ttf files). Older builds nested it under `.pdfMake.vfs` or `.vfs`. Support
// all shapes so fonts always load — otherwise createPdf()/getBase64() hangs.
(pdfMake as any).vfs =
  (pdfFonts as any).pdfMake?.vfs || (pdfFonts as any).vfs || (pdfFonts as any).default || pdfFonts;

interface SignerInfo {
  order: number;
  name: string;
  email: string;
  status: string;
  signedAt?: number;
  signatureData?: string;
  declineReason?: string;
}

interface AuditEntry {
  action: string;
  actorName: string;
  timestamp: number;
}

interface DocumentData {
  title: string;
  content: string;
  status: string;
  createdAt: number;
  completedAt?: number;
  expiresAt?: number;
  contentHash: string;
  signers: SignerInfo[];
  auditLog: AuditEntry[];
}

/**
 * Build the pdfmake document definition for a signed document. Shared by the
 * download path and the archive path so both produce an identical PDF.
 */
function buildSignatureDocDefinition(doc: DocumentData) {
  const signerTableBody: any[][] = [
    [
      { text: 'Order', style: 'tableHeader' },
      { text: 'Name', style: 'tableHeader' },
      { text: 'Email', style: 'tableHeader' },
      { text: 'Status', style: 'tableHeader' },
      { text: 'Signed At', style: 'tableHeader' },
      { text: 'Signature', style: 'tableHeader' },
    ],
    ...doc.signers.map((signer) => [
      signer.order.toString(),
      signer.name,
      signer.email,
      signer.status,
      signer.signedAt ? new Date(signer.signedAt).toLocaleString() : '—',
      signer.signatureData
        ? { image: signer.signatureData, width: 80, fit: [80, 40] }
        : signer.declineReason
          ? { text: `Declined: ${signer.declineReason}`, fontSize: 8, color: '#dc2626' }
          : '—',
    ]),
  ];

  const auditTableBody: any[][] = [
    [
      { text: 'Timestamp', style: 'tableHeader' },
      { text: 'Action', style: 'tableHeader' },
      { text: 'Actor', style: 'tableHeader' },
    ],
    ...doc.auditLog.map((entry) => [
      new Date(entry.timestamp).toLocaleString(),
      entry.action.replace(/_/g, ' '),
      entry.actorName,
    ]),
  ];

  const content: any[] = [
    // Header
    { text: 'ELECTRONICALLY SIGNED DOCUMENT', style: 'header', alignment: 'center' },
    { text: doc.title, style: 'subheader', alignment: 'center', margin: [0, 0, 0, 5] },
    {
      text: `Status: ${doc.status.toUpperCase()}`,
      style: 'statusBadge',
      alignment: 'center',
      margin: [0, 0, 0, 20],
    },

    // Document Metadata
    { text: 'Document Information', style: 'sectionHeader' },
    {
      table: {
        widths: ['auto', '*'],
        body: [
          [{ text: 'Created', style: 'metaLabel' }, new Date(doc.createdAt).toLocaleString()],
          ...(doc.completedAt
            ? [
                [
                  { text: 'Completed', style: 'metaLabel' },
                  new Date(doc.completedAt).toLocaleString(),
                ],
              ]
            : []),
          ...(doc.expiresAt
            ? [[{ text: 'Expires', style: 'metaLabel' }, new Date(doc.expiresAt).toLocaleString()]]
            : []),
          [
            { text: 'Integrity Hash', style: 'metaLabel' },
            { text: doc.contentHash, fontSize: 7, fontFamily: 'Courier' },
          ],
        ],
      },
      margin: [0, 0, 0, 20],
    },

    // Document Content
    { text: 'Document Content', style: 'sectionHeader' },
    { text: doc.content, style: 'contentText', margin: [0, 0, 0, 20] },

    // Signers Table
    { text: 'Signers', style: 'sectionHeader' },
    {
      table: { widths: ['auto', '*', '*', 'auto', 'auto', '*'], body: signerTableBody },
      margin: [0, 0, 0, 20],
    },

    // Audit Log
    { text: 'Audit Trail', style: 'sectionHeader' },
    { table: { widths: ['auto', '*', '*'], body: auditTableBody }, margin: [0, 0, 0, 20] },

    // Footer
    {
      text: `Generated on ${new Date().toLocaleString()}`,
      style: 'footer',
      alignment: 'center',
      margin: [0, 20, 0, 0],
    },
    {
      text: 'This document was signed electronically and is legally binding.',
      style: 'footer',
      alignment: 'center',
      fontSize: 8,
    },
  ];

  const docDefinition: any = {
    content,
    styles: {
      header: { fontSize: 20, bold: true, margin: [0, 0, 0, 5] },
      subheader: { fontSize: 14, bold: true, color: '#333' },
      statusBadge: { fontSize: 10, bold: true, color: '#16a34a' },
      sectionHeader: { fontSize: 14, bold: true, margin: [0, 15, 0, 8] },
      metaLabel: { bold: true, fontSize: 10, color: '#555', width: 120 },
      contentText: { fontSize: 10, lineHeight: 1.4 },
      tableHeader: { bold: true, fontSize: 9, color: '#333', fillColor: '#f3f4f6' },
      footer: { fontSize: 9, color: '#999' },
    },
    defaultStyle: { fontSize: 10 },
    pageMargins: [40, 40, 40, 40],
  };

  return docDefinition;
}

/** Render + trigger a browser download of the signed-document PDF. */
export function exportSignatureToPDF(doc: DocumentData, filename: string = 'signed-document.pdf') {
  const docDefinition = buildSignatureDocDefinition(doc);
  pdfMake.createPdf(docDefinition).download(filename);
  return { success: true, message: 'PDF file downloaded' };
}

/**
 * Render the signed-document PDF and return it as a base64 data URL.
 * Used to upload a permanent copy to storage (Cloudinary) on completion.
 */
export function renderSignaturePdfBase64(doc: DocumentData): Promise<string> {
  const docDefinition = buildSignatureDocDefinition(doc);
  return new Promise((resolve, reject) => {
    // Guard: if pdfmake never invokes the callback (e.g. fonts failed to load),
    // reject instead of leaving the caller stuck on "Archiving…" forever.
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('PDF rendering timed out'));
    }, 30000);

    try {
      const pdf = pdfMake.createPdf(docDefinition) as any;
      pdf.getBase64((data: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (!data) {
          reject(new Error('Failed to render PDF (empty output)'));
          return;
        }
        resolve(`data:application/pdf;base64,${data}`);
      });
    } catch (err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err instanceof Error ? err : new Error('Failed to render PDF'));
    }
  });
}
