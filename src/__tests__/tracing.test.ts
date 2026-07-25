/**
 * Tests for tracing.ts — OpenTelemetry tracing utilities.
 *
 * Mocks @opentelemetry/api entirely.
 * Uses a shared span reference so jest.clearAllMocks() doesn't break access.
 */
let sharedSpan: any = {};

jest.mock('@opentelemetry/api', () => {
  sharedSpan = {
    setAttribute: jest.fn(),
    setStatus: jest.fn(),
    recordException: jest.fn(),
    end: jest.fn(),
  };

  // Single shared startActiveSpan instance — NOT re-created per getTracer() call
  const mockStartActiveSpan = jest.fn((name: string, fn: (span: any) => Promise<any>) =>
    fn(sharedSpan),
  );

  return {
    trace: {
      getTracer: jest.fn(() => ({
        startActiveSpan: mockStartActiveSpan,
      })),
      getActiveSpan: jest.fn(() => null),
    },
    context: { active: jest.fn(() => 'mock-context') },
    SpanStatusCode: { OK: 1, ERROR: 2 },
  };
});

import {
  withTracing,
  tracingMiddleware,
  withServerActionTracing,
  addSpanAttributes,
} from '@/lib/tracing';

describe('withTracing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-init sharedSpan methods after clearAllMocks resets them
    sharedSpan.setAttribute = jest.fn();
    sharedSpan.setStatus = jest.fn();
    sharedSpan.recordException = jest.fn();
    sharedSpan.end = jest.fn();
  });

  it('calls the wrapped function and returns its result', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    const result = await withTracing('test-span', fn, { key: 'value' });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalled();
  });

  it('sets attributes on the span', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    await withTracing('attr-span', fn, { userId: '123', action: 'test' });
    expect(sharedSpan.setAttribute).toHaveBeenCalledWith('userId', '123');
    expect(sharedSpan.setAttribute).toHaveBeenCalledWith('action', 'test');
  });

  it('sets status to OK on success', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    await withTracing('ok-span', fn);
    expect(sharedSpan.setStatus).toHaveBeenCalledWith({ code: 1 });
  });

  it('records exception and sets ERROR status on failure', async () => {
    const error = new Error('test error');
    const fn = jest.fn().mockRejectedValue(error);

    await expect(withTracing('fail-span', fn)).rejects.toThrow('test error');
    expect(sharedSpan.recordException).toHaveBeenCalledWith(error);
    expect(sharedSpan.setStatus).toHaveBeenCalledWith({
      code: 2,
      message: 'test error',
    });
  });

  it('calls span.end in finally block', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    await withTracing('end-span', fn);
    expect(sharedSpan.end).toHaveBeenCalled();
  });

  it('calls span.end even on error', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    await expect(withTracing('fail-span', fn)).rejects.toThrow();
    expect(sharedSpan.end).toHaveBeenCalled();
  });

  it('works without attributes', async () => {
    const fn = jest.fn().mockResolvedValue('no-attr');
    const result = await withTracing('no-attr', fn);
    expect(result).toBe('no-attr');
  });
});

describe('tracingMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sharedSpan.setAttribute = jest.fn();
    sharedSpan.setStatus = jest.fn();
    sharedSpan.recordException = jest.fn();
    sharedSpan.end = jest.fn();
  });

  // Request/Response globals not available in jsdom — use plain objects
  function mockReq(method = 'GET', url = 'https://api.test.com/users') {
    return { method, url, headers: new Headers() } as any;
  }

  function mockRes(status = 200) {
    return { status, headers: new Headers() } as any;
  }

  it('calls the handler and returns its response', async () => {
    const response = mockRes(200);
    const handler = jest.fn().mockResolvedValue(response);
    const request = mockReq();

    const result = await tracingMiddleware(request, handler);
    expect(result.status).toBe(200);
    expect(handler).toHaveBeenCalledWith(request);
  });

  it('sets HTTP attributes on the span', async () => {
    const handler = jest.fn().mockResolvedValue(mockRes());
    const request = mockReq('GET', 'https://api.test.com/users');

    await tracingMiddleware(request, handler);
    expect(sharedSpan.setAttribute).toHaveBeenCalledWith('http.method', 'GET');
    expect(sharedSpan.setAttribute).toHaveBeenCalledWith('http.url', 'https://api.test.com/users');
    expect(sharedSpan.setAttribute).toHaveBeenCalledWith('http.target', '/users');
  });

  it('sets status_code attribute', async () => {
    const handler = jest.fn().mockResolvedValue(mockRes(201));
    const request = mockReq('GET', 'https://api.test.com/items');

    await tracingMiddleware(request, handler);
    expect(sharedSpan.setAttribute).toHaveBeenCalledWith('http.status_code', 201);
  });

  it('handles errors and records exception', async () => {
    const error = new Error('handler error');
    const handler = jest.fn().mockRejectedValue(error);
    const request = mockReq('GET', 'https://api.test.com/error');

    await expect(tracingMiddleware(request, handler)).rejects.toThrow('handler error');
    expect(sharedSpan.recordException).toHaveBeenCalledWith(error);
  });

  it('generates span name from method + pathname', async () => {
    const handler = jest.fn().mockResolvedValue(mockRes());
    const request = mockReq('POST', 'https://api.test.com/data/submit');

    await tracingMiddleware(request, handler);
    // Verify the span name was used via the tracer
    const { trace: mockTrace } = require('@opentelemetry/api');
    const tracer = mockTrace.getTracer();
    expect(tracer.startActiveSpan).toHaveBeenCalledWith('POST /data/submit', expect.any(Function));
  });
});

describe('withServerActionTracing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sharedSpan.setAttribute = jest.fn();
    sharedSpan.setStatus = jest.fn();
    sharedSpan.recordException = jest.fn();
    sharedSpan.end = jest.fn();
  });

  it('returns a decorated function', () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const decorated = withServerActionTracing('action-test')(fn);
    expect(typeof decorated).toBe('function');
  });

  it('decorated function returns original result', async () => {
    const fn = jest.fn().mockResolvedValue('original-result');
    const decorated = withServerActionTracing('action-test')(fn);
    const result = await decorated();
    expect(result).toBe('original-result');
  });

  it('passes arguments to original function', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const decorated = withServerActionTracing('action-args')(fn);
    await decorated('arg1', 42);
    expect(fn).toHaveBeenCalledWith('arg1', 42);
  });
});

describe('addSpanAttributes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sharedSpan.setAttribute = jest.fn();
    sharedSpan.setStatus = jest.fn();
    sharedSpan.recordException = jest.fn();
    sharedSpan.end = jest.fn();
  });

  it('does not throw when no active span exists', () => {
    // trace.getActiveSpan returns null (set in mock)
    expect(() => addSpanAttributes({ key: 'value' })).not.toThrow();
  });

  it('sets attributes when active span exists', () => {
    // Override getActiveSpan for this test
    const { trace: mockTrace } = require('@opentelemetry/api');
    const activeSpan = { setAttribute: jest.fn() };
    mockTrace.getActiveSpan = jest.fn().mockReturnValue(activeSpan);

    addSpanAttributes({ userId: '123', role: 'admin' });
    expect(activeSpan.setAttribute).toHaveBeenCalledWith('userId', '123');
    expect(activeSpan.setAttribute).toHaveBeenCalledWith('role', 'admin');
  });
});
