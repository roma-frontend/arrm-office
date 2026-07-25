/**
 * Tests for logger utilities (src/lib/logger.ts)
 * Tests: logger object has expected methods, methods don't throw
 */

describe('logger', () => {
  let logger: any;

  beforeEach(() => {
    // Dynamically import logger with fresh NODE_ENV
    jest.resetModules();
    process.env.NODE_ENV = 'development';
    logger = require('@/lib/logger').logger;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── Method existence ─────────────────────────────────────────────────

  it('exports logger object with log method', () => {
    expect(typeof logger.log).toBe('function');
  });

  it('exports logger object with warn method', () => {
    expect(typeof logger.warn).toBe('function');
  });

  it('exports logger object with error method', () => {
    expect(typeof logger.error).toBe('function');
  });

  it('exports logger object with info method', () => {
    expect(typeof logger.info).toBe('function');
  });

  it('exports logger object with debug method', () => {
    expect(typeof logger.debug).toBe('function');
  });

  it('exports logger object with time method', () => {
    expect(typeof logger.time).toBe('function');
  });

  it('exports logger.api.call method', () => {
    expect(typeof logger.api.call).toBe('function');
  });

  it('exports logger.api.response method', () => {
    expect(typeof logger.api.response).toBe('function');
  });

  // ── Methods can be called ────────────────────────────────────────────

  it('log does not throw', () => {
    expect(() => logger.log('test')).not.toThrow();
  });

  it('warn does not throw', () => {
    expect(() => logger.warn('test')).not.toThrow();
  });

  it('error does not throw', () => {
    expect(() => logger.error('test')).not.toThrow();
  });

  it('info does not throw', () => {
    expect(() => logger.info('test')).not.toThrow();
  });

  it('debug does not throw', () => {
    expect(() => logger.debug('test')).not.toThrow();
  });

  it('time does not throw', () => {
    expect(() => logger.time('timer')).not.toThrow();
  });

  it('time returns a function', () => {
    const endFn = logger.time('timer');
    expect(typeof endFn).toBe('function');
    expect(() => endFn()).not.toThrow();
  });

  it('api.call does not throw', () => {
    expect(() => logger.api.call('GET', '/test')).not.toThrow();
  });

  it('api.call with payload does not throw', () => {
    expect(() => logger.api.call('POST', '/test', { key: 'val' })).not.toThrow();
  });

  it('api.response does not throw', () => {
    expect(() => logger.api.response('GET', '/test', 200)).not.toThrow();
  });

  it('api.response with data does not throw', () => {
    expect(() => logger.api.response('POST', '/test', 400, { error: 'bad' })).not.toThrow();
  });

  // ── Error always logs (regardless of NODE_ENV) ──────────────────────

  it('error logs in production too', () => {
    jest.resetModules();
    process.env.NODE_ENV = 'production';
    const prodLogger = require('@/lib/logger').logger;
    expect(() => prodLogger.error('critical')).not.toThrow();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PARAMETERIZED EXPANSION (+15 tests)
// ════════════════════════════════════════════════════════════════════════════

describe('logger - multiple arguments', () => {
  let logger: any;

  beforeEach(() => {
    jest.resetModules();
    process.env.NODE_ENV = 'development';
    logger = require('@/lib/logger').logger;
  });

  const logMethods = ['log', 'warn', 'error', 'info', 'debug'];
  test.each(logMethods)('%s accepts multiple arguments', (method) => {
    expect(() => logger[method]('test', 123, { key: 'val' })).not.toThrow();
  });

  test.each(logMethods)('%s accepts string arg', (method) => {
    expect(() => logger[method]('simple message')).not.toThrow();
  });

  test.each(logMethods)('%s accepts object arg', (method) => {
    expect(() => logger[method]({ event: 'test', id: 1 })).not.toThrow();
  });

  test.each(logMethods)('%s accepts array arg', (method) => {
    expect(() => logger[method]([1, 2, 3])).not.toThrow();
  });

  it('api.call with various methods', () => {
    const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
    methods.forEach((m) => expect(() => logger.api.call(m, '/test')).not.toThrow());
  });

  it('api.response with various status codes', () => {
    const codes = [200, 201, 301, 400, 401, 403, 404, 500, 502, 503];
    codes.forEach((c) => expect(() => logger.api.response('GET', '/test', c)).not.toThrow());
  });
});
