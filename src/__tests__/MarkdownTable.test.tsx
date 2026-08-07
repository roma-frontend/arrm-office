/**
 * Tests for MarkdownTable — renders markdown tables from AI chat messages.
 *
 * Covers table parsing (headers/rows), separator handling, the <pre> fallback
 * for non-table content, and formatMessageContent for text around tables.
 */

import React from 'react';
import { describe, it, expect, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';

import { MarkdownTable, formatMessageContent } from '@/components/ai/MarkdownTable';

const TABLE = ['| Name | Role |', '| --- | --- |', '| Anna | Admin |', '| Bob | User |'].join('\n');

describe('MarkdownTable', () => {
  it('renders table headers from markdown', () => {
    render(<MarkdownTable content={TABLE} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Role')).toBeInTheDocument();
  });

  it('renders table rows', () => {
    render(<MarkdownTable content={TABLE} />);
    expect(screen.getByText('Anna')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('User')).toBeInTheDocument();
  });

  it('renders a table element', () => {
    const { container } = render(<MarkdownTable content={TABLE} />);
    expect(container.querySelector('table')).toBeInTheDocument();
  });

  it('falls back to <pre> for non-table content', () => {
    const { container } = render(<MarkdownTable content="Just plain text, no pipes here" />);
    expect(container.querySelector('pre')).toBeInTheDocument();
    expect(screen.getByText('Just plain text, no pipes here')).toBeInTheDocument();
  });

  it('falls back to <pre> for a single line with pipes (no separator)', () => {
    const { container } = render(<MarkdownTable content="| a | b |" />);
    expect(container.querySelector('pre')).toBeInTheDocument();
  });

  it('strips markdown emphasis from cell content', () => {
    render(<MarkdownTable content={'| **Bold** | *Ital* |\n| --- | --- |\n| `code` | plain |'} />);
    expect(screen.getByText('Bold')).toBeInTheDocument();
    expect(screen.getByText('Ital')).toBeInTheDocument();
    expect(screen.getByText('code')).toBeInTheDocument();
  });

  it('skips separator-only rows and empty rows', () => {
    const content = ['| A | B |', '| --- | --- |', '| x | y |', '', '| p | q |'].join('\n');
    render(<MarkdownTable content={content} />);
    expect(screen.getByText('x')).toBeInTheDocument();
    expect(screen.getByText('p')).toBeInTheDocument();
    expect(screen.queryByText('---')).not.toBeInTheDocument();
  });

  it('handles rows with empty cells', () => {
    render(<MarkdownTable content={'| A | B |\n| --- | --- |\n| only |  |'} />);
    expect(screen.getByText('only')).toBeInTheDocument();
  });
});

describe('formatMessageContent', () => {
  it('renders plain text with line breaks when no table is present', () => {
    render(<>{formatMessageContent('line one\n\nline two')}</>);
    expect(screen.getByText('line one')).toBeInTheDocument();
    expect(screen.getByText('line two')).toBeInTheDocument();
  });

  it('renders text before a table', () => {
    render(<>{formatMessageContent(`Intro text\n${TABLE}`)}</>);
    expect(screen.getByText('Intro text')).toBeInTheDocument();
    expect(screen.getByText('Anna')).toBeInTheDocument();
  });

  it('renders text after a table', () => {
    render(<>{formatMessageContent(`${TABLE}\nOutro text`)}</>);
    expect(screen.getByText('Outro text')).toBeInTheDocument();
    expect(screen.getByText('Anna')).toBeInTheDocument();
  });

  it('renders text both before and after a table', () => {
    render(<>{formatMessageContent(`Before\n${TABLE}\nAfter`)}</>);
    expect(screen.getByText('Before')).toBeInTheDocument();
    expect(screen.getByText('After')).toBeInTheDocument();
  });
});
