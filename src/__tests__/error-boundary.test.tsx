import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary, ErrorBoundaryFallback } from '../components/error/ErrorBoundary';
import { WidgetErrorBoundary } from '../components/error/WidgetErrorBoundary';

// Mock i18next so i18n.t() returns the fallback string
jest.mock('i18next', () => ({
  __esModule: true,
  default: { t: (_key: string, fallback: string) => fallback },
}));

// Mock Sentry
const mockCaptureException = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Sentry mock for test setup
  (global as any).window.Sentry = { captureException: mockCaptureException };
});

// Component that throws
const BrokenComponent = () => {
  throw new Error('Test error');
};

const WorkingComponent = ({ text }: { text: string }) => <div>{text}</div>;

describe('ErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <WorkingComponent text="Hello" />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('renders fallback UI when error is caught', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Oops! Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Reload Page')).toBeInTheDocument();
    expect(screen.getByText('Go Home')).toBeInTheDocument();
  });

  it('calls onError callback when error is caught', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const onError = jest.fn();

    render(
      <ErrorBoundary onError={onError}>
        <BrokenComponent />
      </ErrorBoundary>,
    );

    expect(onError).toHaveBeenCalled();
    const error = onError.mock.calls[0][0];
    expect(error.message).toBe('Test error');
  });

  it('sends error to Sentry when available', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>,
    );

    expect(mockCaptureException).toHaveBeenCalled();
  });

  it('uses custom fallback when provided', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <BrokenComponent />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Custom fallback')).toBeInTheDocument();
  });

  it('shows error details in development mode', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Error Details:')).toBeInTheDocument();
    expect(screen.getByText('Error: Test error')).toBeInTheDocument();

    process.env.NODE_ENV = originalEnv;
  });
});

describe('ErrorBoundaryFallback', () => {
  it('renders error message', () => {
    const error = new Error('Something broke');
    render(<ErrorBoundaryFallback error={error} resetError={() => {}} />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Something broke')).toBeInTheDocument();
  });

  it('calls resetError when Try Again is clicked', () => {
    const resetError = jest.fn();
    render(<ErrorBoundaryFallback error={new Error('test')} resetError={resetError} />);
    fireEvent.click(screen.getByText('Try Again'));
    expect(resetError).toHaveBeenCalled();
  });
});

describe('WidgetErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      <WidgetErrorBoundary name="TestWidget">
        <WorkingComponent text="Widget content" />
      </WidgetErrorBoundary>,
    );
    expect(screen.getByText('Widget content')).toBeInTheDocument();
  });

  it('renders inline error UI when error is caught', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <WidgetErrorBoundary name="TestWidget">
        <BrokenComponent />
      </WidgetErrorBoundary>,
    );

    expect(screen.getByText('TestWidget')).toBeInTheDocument();
    expect(screen.getByText('encountered an error')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('sends error to Sentry with widget tag', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <WidgetErrorBoundary name="TestWidget">
        <BrokenComponent />
      </WidgetErrorBoundary>,
    );

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: { widget: 'TestWidget' },
      }),
    );
  });

  it('resets error state when Retry is clicked', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    let shouldThrow = true;
    const FlakyComponent = () => {
      if (shouldThrow) throw new Error('Temporary error');
      return <div>Recovered</div>;
    };

    render(
      <WidgetErrorBoundary name="FlakyWidget">
        <FlakyComponent />
      </WidgetErrorBoundary>,
    );

    expect(screen.getByText('FlakyWidget')).toBeInTheDocument();
    expect(screen.getByText('encountered an error')).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByText('Retry'));

    expect(screen.getByText('Recovered')).toBeInTheDocument();
  });
});
