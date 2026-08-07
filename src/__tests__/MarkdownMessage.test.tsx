/**
 * Tests for MarkdownMessage — the custom markdown component overrides
 * (tables, links, code, headings, blockquotes).
 *
 * react-markdown is ESM-only and cannot be transformed by this Jest config,
 * so it is replaced with a small renderer that invokes the component
 * overrides passed by MarkdownMessage — exactly the code under test.
 */

import React from 'react';
import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';

// eslint-disable-next-line react/display-name
jest.mock('react-markdown', () => {
  return function MockReactMarkdown({ children, components }: any) {
    const text = String(children);
    const P = components?.p ?? 'p';
    const Strong = components?.strong ?? 'strong';
    const A = components?.a ?? 'a';
    const Em = components?.em ?? 'em';
    const Pre = components?.pre ?? 'pre';
    const Code = components?.code ?? 'code';
    const Ul = components?.ul ?? 'ul';
    const Li = components?.li ?? 'li';

    const renderLine = (line: string, key: number): React.ReactNode => {
      if (line.startsWith('# ')) {
        const H = components?.h1 ?? 'h1';
        return <H key={key}>{line.slice(2)}</H>;
      }
      if (line.startsWith('- ')) {
        return (
          <Ul key={key}>
            <Li>{line.slice(2)}</Li>
          </Ul>
        );
      }
      if (line.startsWith('> ')) {
        const BQ = components?.blockquote ?? 'blockquote';
        return <BQ key={key}>{line.slice(2)}</BQ>;
      }
      if (line.includes('|') && line.trim().startsWith('|')) {
        const Table = components?.table ?? 'table';
        const Thead = components?.thead ?? 'thead';
        const Tr = components?.tr ?? 'tr';
        const Th = components?.th ?? 'th';
        const Td = components?.td ?? 'td';
        const cells = line.split('|').filter(Boolean);
        return (
          <Table key={key}>
            <Thead>
              <Tr>
                {cells.map((c, i) => (
                  <Th key={i}>{c.trim()}</Th>
                ))}
              </Tr>
            </Thead>
          </Table>
        );
      }
      if (line.startsWith('```')) {
        return (
          <Pre key={key}>
            <Code>{line.slice(3)}</Code>
          </Pre>
        );
      }
      const strong = line.match(/\*\*(.+?)\*\*/);
      if (strong) {
        return (
          <P key={key}>
            <Strong>{strong[1]}</Strong>
          </P>
        );
      }
      const em = line.match(/\*(.+?)\*/);
      if (em) {
        return (
          <P key={key}>
            <Em>{em[1]}</Em>
          </P>
        );
      }
      const link = line.match(/\[(.+?)\]\((.+?)\)/);
      if (link) {
        return (
          <P key={key}>
            <A href={link[2]}>{link[1]}</A>
          </P>
        );
      }
      const code = line.match(/`(.+?)`/);
      if (code) {
        return (
          <P key={key}>
            <Code>{code[1]}</Code>
          </P>
        );
      }
      return <P key={key}>{line}</P>;
    };

    return <div data-testid="markdown">{text.split('\n').map(renderLine)}</div>;
  };
});

jest.mock('remark-gfm', () => () => []);

import { MarkdownMessage } from '@/components/MarkdownMessage';

describe('MarkdownMessage', () => {
  it('renders plain text content', () => {
    render(<MarkdownMessage content="Hello world" />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('renders bold and italic emphasis', () => {
    render(<MarkdownMessage content={'**bold**\n*italic*'} />);
    expect(screen.getByText('bold')).toBeInTheDocument();
    expect(screen.getByText('italic')).toBeInTheDocument();
  });

  it('renders a list', () => {
    render(<MarkdownMessage content={['- one', '- two'].join(String.fromCharCode(10))} />);
    expect(screen.getByText('one')).toBeInTheDocument();
    expect(screen.getByText('two')).toBeInTheDocument();
  });

  it('renders links with noopener noreferrer', () => {
    const { container } = render(<MarkdownMessage content="[Docs](https://docs.example)" />);
    const link = container.querySelector('a');
    expect(link).toHaveAttribute('href', 'https://docs.example');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('renders a markdown table through the custom table components', () => {
    const { container } = render(<MarkdownMessage content="| A | B |" />);
    expect(container.querySelector('table')).toBeInTheDocument();
    expect(container.querySelector('thead')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('renders code blocks and inline code', () => {
    const { container } = render(
      <MarkdownMessage
        content={['```const x = 1```', '', 'Use `x` here.'].join(String.fromCharCode(10))}
      />,
    );
    expect(container.querySelector('pre')).toBeInTheDocument();
    const inline = [...container.querySelectorAll('code')].find((c) => c.textContent === 'x');
    expect(inline).toBeInTheDocument();
  });

  it('renders headings and blockquotes', () => {
    const { container } = render(
      <MarkdownMessage content={['# Title', '', '> quoted text'].join(String.fromCharCode(10))} />,
    );
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('quoted text')).toBeInTheDocument();
    expect(container.querySelector('blockquote')).toBeInTheDocument();
  });

  it('adds the user styling class when isUser is set', () => {
    const { container } = render(<MarkdownMessage content="hi" isUser />);
    expect(container.querySelector('div')?.className).toContain('prose-invert');
  });
});
