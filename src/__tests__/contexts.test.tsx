/**
 * Tests for React contexts and simple components.
 *
 * Covers: StatusUpdateProvider/useStatusUpdate, MarkdownMessage
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { StatusUpdateProvider, useStatusUpdate } from '@/context/StatusUpdateContext';

// react-markdown and remark-gfm are ESM-only packages that Jest cannot
// import directly. We mock them to avoid the ESM resolution error.
jest.mock('react-markdown', () => {
  const MockReactMarkdown = ({ children, ...props }: any) => {
    // Extract content from children or the `children` prop
    const content = typeof children === 'string' ? children : (props as any).children || '';
    return <div data-testid="markdown">{content}</div>;
  };
  return MockReactMarkdown;
});

jest.mock('remark-gfm', () => ({
  __esModule: true,
  default: () => null,
}));

import { MarkdownMessage } from '@/components/MarkdownMessage';

// ════════════════════════════════════════════════════════════════════════════
// StatusUpdateContext
// ════════════════════════════════════════════════════════════════════════════

describe('StatusUpdateContext', () => {
  function TestComponent() {
    const { notification, showNotification, hideNotification } = useStatusUpdate();
    return (
      <div>
        <span data-testid="notification">
          {notification ? `${notification.statusKey}:${notification.statusLabel}` : 'none'}
        </span>
        <button data-testid="show-btn" onClick={() => showNotification('available', 'Available')}>
          Show
        </button>
        <button data-testid="hide-btn" onClick={hideNotification}>
          Hide
        </button>
      </div>
    );
  }

  it('provides default context values', () => {
    render(
      <StatusUpdateProvider>
        <TestComponent />
      </StatusUpdateProvider>,
    );
    expect(screen.getByTestId('notification').textContent).toBe('none');
  });

  it('showNotification updates the notification state', () => {
    render(
      <StatusUpdateProvider>
        <TestComponent />
      </StatusUpdateProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByTestId('show-btn'));
    });
    expect(screen.getByTestId('notification').textContent).toBe('available:Available');
  });

  it('hideNotification clears the notification', () => {
    render(
      <StatusUpdateProvider>
        <TestComponent />
      </StatusUpdateProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByTestId('show-btn'));
    });
    expect(screen.getByTestId('notification').textContent).toBe('available:Available');

    act(() => {
      fireEvent.click(screen.getByTestId('hide-btn'));
    });
    expect(screen.getByTestId('notification').textContent).toBe('none');
  });

  it('showNotification includes timestamp', () => {
    let notif: any;
    function CaptureComponent() {
      const { notification, showNotification } = useStatusUpdate();
      notif = notification;
      return <button onClick={() => showNotification('busy', 'Busy')}>Show</button>;
    }
    render(
      <StatusUpdateProvider>
        <CaptureComponent />
      </StatusUpdateProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Show'));
    });
    expect(notif).not.toBeNull();
    expect(notif.statusKey).toBe('busy');
    expect(notif.statusLabel).toBe('Busy');
    expect(typeof notif.timestamp).toBe('number');
  });

  it('useStatusUpdate throws when used outside provider', () => {
    // Suppress expected console error
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    function BadComponent() {
      useStatusUpdate();
      return <div>bad</div>;
    }
    expect(() => render(<BadComponent />)).toThrow('useStatusUpdate must be used within');
    consoleSpy.mockRestore();
  });

  it('supports multiple sequential notifications', () => {
    function MultiComponent() {
      const { notification, showNotification, hideNotification } = useStatusUpdate();
      return (
        <div>
          <span data-testid="n">{notification?.statusKey || 'none'}</span>
          <button onClick={() => showNotification('first', 'First')}>First</button>
          <button onClick={() => showNotification('second', 'Second')}>Second</button>
          <button onClick={hideNotification}>Hide</button>
        </div>
      );
    }
    render(
      <StatusUpdateProvider>
        <MultiComponent />
      </StatusUpdateProvider>,
    );

    act(() => fireEvent.click(screen.getByText('First')));
    expect(screen.getByTestId('n').textContent).toBe('first');

    act(() => fireEvent.click(screen.getByText('Second')));
    expect(screen.getByTestId('n').textContent).toBe('second');

    act(() => fireEvent.click(screen.getByText('Hide')));
    expect(screen.getByTestId('n').textContent).toBe('none');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// MarkdownMessage
// ════════════════════════════════════════════════════════════════════════════

describe('MarkdownMessage', () => {
  it('renders content passed as prop', () => {
    render(<MarkdownMessage content="Hello World" />);
    // With the mock, react-markdown renders content as inner text
    const md = screen.getByTestId('markdown');
    expect(md).toBeInTheDocument();
    expect(md.textContent).toContain('Hello World');
  });

  it('applies prose classes to wrapper div', () => {
    const { container } = render(<MarkdownMessage content="test" />);
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain('prose');
  });

  it('applies prose-invert class for user messages', () => {
    const { container } = render(<MarkdownMessage content="test" isUser />);
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain('prose-invert');
  });

  it('renders markdown content even with markdown syntax', () => {
    // Mock renders raw markdown as text since it doesn't parse it
    render(<MarkdownMessage content="This is **bold** and *italic*" />);
    const md = screen.getByTestId('markdown');
    expect(md.textContent).toContain('**bold**');
  });

  it('renders links markdown as raw text', () => {
    render(<MarkdownMessage content="[Click here](https://example.com)" />);
    const md = screen.getByTestId('markdown');
    expect(md.textContent).toContain('Click here');
  });

  it('renders list markdown as raw text', () => {
    render(<MarkdownMessage content="- Item 1\n- Item 2" />);
    const md = screen.getByTestId('markdown');
    expect(md.textContent).toContain('Item 1');
    expect(md.textContent).toContain('Item 2');
  });

  it('handles empty content gracefully', () => {
    const { container } = render(<MarkdownMessage content="" />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('passes content directly to react-markdown', () => {
    const longContent = '# Heading\n\nParagraph with **bold** and `code`';
    render(<MarkdownMessage content={longContent} />);
    const md = screen.getByTestId('markdown');
    expect(md.textContent).toContain('Heading');
    expect(md.textContent).toContain('Paragraph');
    expect(md.textContent).toContain('bold');
    expect(md.textContent).toContain('code');
  });

  it('renders table markdown as raw text', () => {
    render(<MarkdownMessage content="| H1 | H2 |\n|---|---|\n| A | B |" />);
    const md = screen.getByTestId('markdown');
    expect(md.textContent).toContain('H1');
    expect(md.textContent).toContain('A');
  });
});
