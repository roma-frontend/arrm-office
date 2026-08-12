/**
 * Tests for GlobalErrorBoundaryProvider — app-wide error boundary wrapper.
 *
 * The real ErrorBoundary runs (as in error-boundary.test.tsx): the child
 * throws, the boundary catches it, renders the fallback UI and invokes the
 * onError handler which logs via @/lib/logger (mocked here to assert).
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';

const mockLoggerError = jest.fn();
jest.mock('@/lib/logger', () => ({
  logger: { error: (...args: unknown[]) => mockLoggerError(...args) },
}));

import { GlobalErrorBoundaryProvider } from '@/components/error/GlobalErrorBoundaryProvider';

const BrokenComponent = () => {
  throw new Error('Global boom');
};

const WorkingComponent = ({ text }: { text: string }) => <div>{text}</div>;

describe('GlobalErrorBoundaryProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    // restore console.error spies from the throwing-child tests
    jest.restoreAllMocks();
  });

  it('renders children when no error occurs', () => {
    render(
      <GlobalErrorBoundaryProvider>
        <WorkingComponent text="App content" />
      </GlobalErrorBoundaryProvider>,
    );
    expect(screen.getByText('App content')).toBeInTheDocument();
  });

  it('renders the fallback UI when a child throws', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <GlobalErrorBoundaryProvider>
        <BrokenComponent />
      </GlobalErrorBoundaryProvider>,
    );
    expect(screen.getByText('Oops! Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Reload Page')).toBeInTheDocument();
  });

  it('logs the caught error via the global logger', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <GlobalErrorBoundaryProvider>
        <BrokenComponent />
      </GlobalErrorBoundaryProvider>,
    );

    // the boundary itself logs '🛡️ ErrorBoundary caught an error:' first;
    // filter to the provider's own 'Global error caught:' call
    const globalCalls = mockLoggerError.mock.calls.filter(
      (call) => call[0] === 'Global error caught:',
    );
    expect(globalCalls).toHaveLength(1);
    expect(globalCalls[0][1]).toEqual(expect.objectContaining({ message: 'Global boom' }));
    expect(globalCalls[0][2]).toEqual(expect.any(Object));
  });

  it('does not log anything when no error is thrown', () => {
    render(
      <GlobalErrorBoundaryProvider>
        <WorkingComponent text="Fine" />
      </GlobalErrorBoundaryProvider>,
    );
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it('passes nested children through unchanged', () => {
    render(
      <GlobalErrorBoundaryProvider>
        <div>
          <WorkingComponent text="Outer" />
          <span>inner</span>
        </div>
      </GlobalErrorBoundaryProvider>,
    );
    expect(screen.getByText('Outer')).toBeInTheDocument();
    expect(screen.getByText('inner')).toBeInTheDocument();
  });
});
