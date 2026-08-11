/**
 * Tests for src/components/documents/DocumentBlocksPreview.tsx — the shared
 * on-screen rendering of the document block model. Exercises every leaf block
 * type, the bilingual two-column layout, string-body fallback and the page
 * sheet wrapper.
 */

import React from 'react';
import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import type { DocumentBlock, DocumentLeafBlock, RenderableDocument } from '@/lib/exportDocument';
import {
  ColumnBlocks,
  DocumentBlocksPreview,
  DocumentPreview,
  DocumentSheet,
} from '@/components/documents/DocumentBlocksPreview';

const section: DocumentLeafBlock = { type: 'section', title: 'Общие положения', index: 1 };
const mutedParagraph: DocumentLeafBlock = { type: 'paragraph', text: 'fine print', muted: true };
const paragraph: DocumentLeafBlock = { type: 'paragraph', text: 'Plain paragraph' };
const callout: DocumentLeafBlock = { type: 'callout', text: 'Attention required' };
const fields: DocumentLeafBlock = {
  type: 'fields',
  rows: [
    { label: 'Passport', value: 'AM0001' },
    { label: 'Empty', value: '' },
  ],
};
const bullets: DocumentLeafBlock = { type: 'bullets', items: ['First', 'Second'] };
const signatures: DocumentLeafBlock = {
  type: 'signatures',
  parties: [
    {
      id: 'recipient',
      role: 'Employee',
      nameLabel: 'Name',
      name: 'Anna',
      dateLabel: 'Date',
      date: '2026-01-01',
      positionLabel: 'Position',
      position: 'Dev',
    },
    {
      id: 'issuer',
      role: 'Admin',
      nameLabel: 'Name',
      name: '',
      dateLabel: 'Date',
      signatureImage: 'data:image/png;base64,xxxx',
    },
  ],
};
const spacer: DocumentLeafBlock = { type: 'spacer', size: 24 };

describe('ColumnBlocks', () => {
  it('renders every leaf block type', () => {
    render(
      <ColumnBlocks
        blocks={[section, paragraph, mutedParagraph, callout, fields, bullets, signatures, spacer]}
      />,
    );

    expect(screen.getByText('1. Общие положения')).toBeInTheDocument();
    expect(screen.getByText('Plain paragraph')).toBeInTheDocument();
    expect(screen.getByText('fine print')).toBeInTheDocument();
    expect(screen.getByText('Attention required')).toBeInTheDocument();
    expect(screen.getByText('Passport:')).toBeInTheDocument();
    expect(screen.getByText('AM0001')).toBeInTheDocument();
    // Empty field value renders an em dash
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
    // Signature party with image vs placeholder; name/date render inline with
    // their labels, so match by substring.
    expect(screen.getByAltText('')).toBeInTheDocument();
    expect(screen.getByText(/Anna/)).toBeInTheDocument();
    expect(screen.getByText(/2026-01-01/)).toBeInTheDocument();
    expect(screen.getByText(/Name: —/)).toBeInTheDocument();
  });

  it('omits the section ordinal when index is undefined', () => {
    render(<ColumnBlocks blocks={[{ type: 'section', title: 'No number' }]} />);
    expect(screen.getByText('No number')).toBeInTheDocument();
    expect(screen.queryByText('0. No number')).not.toBeInTheDocument();
  });
});

describe('DocumentBlocksPreview', () => {
  it('wraps a non-bilingual block in a single column', () => {
    const { container } = render(<DocumentBlocksPreview blocks={[paragraph] as DocumentBlock[]} />);
    expect(screen.getByText('Plain paragraph')).toBeInTheDocument();
    expect(container.querySelector('.grid.grid-cols-2')).not.toBeInTheDocument();
  });

  it('renders a bilingual block as two aligned columns with captions', () => {
    const bilingual: DocumentBlock = {
      type: 'bilingual',
      left: [{ type: 'paragraph', text: 'Հայերեն տեքստ' }],
      right: [{ type: 'paragraph', text: 'Russian text' }],
      leftLabel: 'ՀԱՅԵՐԵՆ',
      rightLabel: 'РУССКИЙ',
    };
    const { container } = render(<DocumentBlocksPreview blocks={[bilingual]} />);
    expect(container.querySelector('.grid.grid-cols-2')).toBeInTheDocument();
    expect(screen.getByText('ՀԱՅԵՐԵՆ')).toBeInTheDocument();
    expect(screen.getByText('РУССКИЙ')).toBeInTheDocument();
    expect(screen.getByText('Հայերեն տեքստ')).toBeInTheDocument();
    expect(screen.getByText('Russian text')).toBeInTheDocument();
  });

  it('renders a bilingual block without captions', () => {
    const bilingual: DocumentBlock = {
      type: 'bilingual',
      left: [{ type: 'paragraph', text: 'Left only' }],
      right: [],
    };
    render(<DocumentBlocksPreview blocks={[bilingual]} />);
    expect(screen.getByText('Left only')).toBeInTheDocument();
  });

  it('ignores unknown block types', () => {
    render(<DocumentBlocksPreview blocks={[{ type: 'unknown' } as unknown as DocumentBlock]} />);
    // The column wrapper stays but nothing is rendered inside it.
    expect(document.querySelector('.space-y-3')).toBeEmptyDOMElement();
  });
});

describe('DocumentPreview', () => {
  it('lays out a legacy string body as paragraphs', () => {
    const doc = {
      title: 'T',
      body: 'First paragraph\n\nSecond paragraph',
      accent: 'blue',
    } as RenderableDocument;
    render(<DocumentPreview doc={doc} />);
    expect(screen.getByText('First paragraph')).toBeInTheDocument();
    expect(screen.getByText('Second paragraph')).toBeInTheDocument();
  });

  it('renders a block body through DocumentBlocksPreview', () => {
    const doc = { title: 'T', body: [paragraph], accent: 'blue' } as RenderableDocument;
    render(<DocumentPreview doc={doc} />);
    expect(screen.getByText('Plain paragraph')).toBeInTheDocument();
  });
});

describe('DocumentSheet', () => {
  it('renders the title, meta and blocks inside an A4-like sheet', () => {
    render(<DocumentSheet title="Договор" meta="№ 42" blocks={[paragraph]} accentHex="#ff0000" />);
    expect(screen.getByText('Договор')).toBeInTheDocument();
    expect(screen.getByText('№ 42')).toBeInTheDocument();
    expect(screen.getByText('Plain paragraph')).toBeInTheDocument();
  });

  it('shows a placeholder title and hides meta when absent', () => {
    render(<DocumentSheet title="" blocks={[]} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
