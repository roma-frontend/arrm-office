import {
  getErrorMessage,
  getErrorCode,
  getErrorStatusCode,
  getErrorName,
  getConvexErrorMessage,
  getAppErrorCode,
  appErrorToast,
  safeAsync,
  toAppError,
  isError,
  isAppError,
  isUserError,
  isAuthError,
  isNetworkError,
  AppError,
  UserError,
  AuthError,
  PermissionError,
  NotFoundError,
  NetworkError,
  ServerError,
  ValidationError,
} from '@/lib/error-handler';

describe('Error Classes', () => {
  describe('AppError', () => {
    it('creates error with message and code', () => {
      const error = new AppError('Something went wrong', { code: 'INTERNAL_ERROR' });
      expect(error.message).toBe('Something went wrong');
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.statusCode).toBe(500);
    });

    it('creates error with custom status code', () => {
      const error = new AppError('Bad request', { code: 'BAD_REQUEST', statusCode: 400 });
      expect(error.statusCode).toBe(400);
    });
  });

  describe('UserError', () => {
    it('creates user-friendly error', () => {
      const error = new UserError('Invalid input');
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Invalid input');
      expect(error.code).toBe('USER_ERROR');
      expect(error.statusCode).toBe(400);
    });
  });

  describe('AuthError', () => {
    it('creates authentication error', () => {
      const error = new AuthError('Not authenticated');
      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe('AUTH_ERROR');
      expect(error.statusCode).toBe(401);
    });
  });

  describe('PermissionError', () => {
    it('creates permission error', () => {
      const error = new PermissionError('Access denied');
      expect(error.code).toBe('PERMISSION_ERROR');
      expect(error.statusCode).toBe(403);
    });
  });

  describe('NotFoundError', () => {
    it('creates not found error', () => {
      const error = new NotFoundError('Resource not found');
      expect(error.code).toBe('NOT_FOUND');
      expect(error.statusCode).toBe(404);
    });
  });

  describe('NetworkError', () => {
    it('creates network error', () => {
      const error = new NetworkError('Connection failed');
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.statusCode).toBe(503);
    });
  });

  describe('ServerError', () => {
    it('creates server error', () => {
      const error = new ServerError('Internal server error');
      expect(error.code).toBe('SERVER_ERROR');
      expect(error.statusCode).toBe(500);
    });
  });

  describe('ValidationError', () => {
    it('creates validation error with details', () => {
      const details = { email: 'Invalid email' };
      const error = new ValidationError('Validation failed', details);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.fieldErrors).toEqual(details);
    });
  });
});

describe('getErrorMessage', () => {
  it('extracts message from Error instance', () => {
    expect(getErrorMessage(new Error('Test error'))).toBe('Test error');
  });

  it('returns string input as-is', () => {
    expect(getErrorMessage('String error')).toBe('String error');
  });

  it('returns fallback for unknown types', () => {
    expect(getErrorMessage(123 as any)).toBe('An unexpected error occurred');
    expect(getErrorMessage(null as any)).toBe('An unexpected error occurred');
  });
});

describe('getErrorCode', () => {
  it('returns code from AppError', () => {
    const error = new AppError('Test', { code: 'CUSTOM_CODE' });
    expect(getErrorCode(error)).toBe('CUSTOM_CODE');
  });

  it('returns UNKNOWN_ERROR for regular Error', () => {
    expect(getErrorCode(new Error('Test'))).toBe('UNKNOWN_ERROR');
  });

  it('returns UNKNOWN_ERROR for non-Error', () => {
    expect(getErrorCode('string error')).toBe('UNKNOWN_ERROR');
  });
});

describe('getErrorStatusCode', () => {
  it('returns status from AppError', () => {
    const error = new AppError('Test', { code: 'CODE', statusCode: 404 });
    expect(getErrorStatusCode(error)).toBe(404);
  });

  it('returns undefined for regular Error', () => {
    expect(getErrorStatusCode(new Error('Test'))).toBeUndefined();
  });
});

describe('toAppError', () => {
  it('returns AppError as-is', () => {
    const original = new AppError('Test', 'CODE');
    expect(toAppError(original)).toBe(original);
  });

  it('converts string to AppError', () => {
    const error = toAppError('Something broke');
    expect(error).toBeInstanceOf(AppError);
    expect(error.message).toBe('Something broke');
  });

  it('converts Error to AppError with message', () => {
    const error = toAppError(new Error('Original error'));
    expect(error.message).toBe('Original error');
  });

  it('creates AuthError for unauthorized messages', () => {
    const error = toAppError(new Error('Unauthorized access'));
    expect(error).toBeInstanceOf(AuthError);
  });

  it('creates PermissionError for permission messages', () => {
    const error = toAppError(new Error('Permission denied'));
    expect(error).toBeInstanceOf(PermissionError);
  });

  it('creates NetworkError for network messages', () => {
    const error = toAppError(new Error('Network error occurred'));
    expect(error).toBeInstanceOf(NetworkError);
  });

  it('creates ServerError for unknown errors', () => {
    const error = toAppError(new Error('Something weird happened'));
    expect(error).toBeInstanceOf(ServerError);
  });
});

describe('Type Guards', () => {
  it('isError returns true for Error instances', () => {
    expect(isError(new Error())).toBe(true);
    expect(isError(new AppError('Test', 'CODE'))).toBe(true);
  });

  it('isError returns false for non-Errors', () => {
    expect(isError('string')).toBe(false);
    expect(isError(123)).toBe(false);
    expect(isError(null)).toBe(false);
  });

  it('isAppError returns true for AppError instances', () => {
    expect(isAppError(new AppError('Test', 'CODE'))).toBe(true);
    expect(isAppError(new UserError('Test'))).toBe(true);
    expect(isAppError(new AuthError('Test'))).toBe(true);
  });

  it('isAppError returns false for regular Error', () => {
    expect(isAppError(new Error('Test'))).toBe(false);
  });

  it('isUserError returns true for UserError', () => {
    expect(isUserError(new UserError('Test'))).toBe(true);
  });

  it('isUserError returns false for other errors', () => {
    expect(isUserError(new AppError('Test', 'CODE'))).toBe(false);
    expect(isUserError(new Error('Test'))).toBe(false);
  });

  it('isAuthError returns true for AuthError', () => {
    expect(isAuthError(new AuthError('Test'))).toBe(true);
  });

  it('isNetworkError returns true for NetworkError', () => {
    expect(isNetworkError(new NetworkError('Test'))).toBe(true);
  });
});

describe('getErrorName', () => {
  it('returns the name of an Error', () => {
    expect(getErrorName(new Error('boom'))).toBe('Error');
    expect(getErrorName(new AppError('boom', 'CODE'))).toBe('AppError');
  });

  it('returns the name of an error-like object', () => {
    expect(getErrorName({ name: 'DOMException', message: 'x' })).toBe('DOMException');
  });

  it('returns empty string when name is unavailable', () => {
    expect(getErrorName('string')).toBe('');
    expect(getErrorName(null)).toBe('');
    expect(getErrorName(undefined)).toBe('');
    expect(getErrorName({ message: 'no name property' })).toBe('');
  });
});

describe('getErrorMessage edge branches', () => {
  it('extracts a non-empty message from an error-like object', () => {
    expect(getErrorMessage({ message: 'DOM-ish failure' })).toBe('DOM-ish failure');
  });

  it('ignores an empty message on an error-like object', () => {
    expect(getErrorMessage({ message: '' })).toBe('An unexpected error occurred');
    expect(getErrorMessage({ message: 42 })).toBe('An unexpected error occurred');
  });

  it('handles objects without a message property', () => {
    expect(getErrorMessage({ foo: 'bar' })).toBe('An unexpected error occurred');
  });
});

describe('getConvexErrorMessage', () => {
  it('unwraps a string payload', () => {
    expect(getConvexErrorMessage({ data: 'Real reason' }, 'fallback')).toBe('Real reason');
  });

  it('unwraps a structured payload with a message', () => {
    expect(getConvexErrorMessage({ data: { code: 'FORBIDDEN', message: 'Nope' } }, 'fb')).toBe(
      'Nope',
    );
  });

  it('ignores blank string payloads and falls through', () => {
    expect(getConvexErrorMessage({ data: '   ' }, 'fallback')).toBe('fallback');
  });

  it('ignores a structured payload without a usable message', () => {
    expect(getConvexErrorMessage({ data: { code: 'X' } }, 'fb')).toBe('fb');
  });

  it('falls back for a plain Error with no data', () => {
    expect(getConvexErrorMessage(new Error('boom'), 'fallback')).toBe('boom');
  });

  it('uses the fallback when the raw error is a redacted server error', () => {
    expect(getConvexErrorMessage(new Error('Server Error'), 'fallback')).toBe('fallback');
    expect(getConvexErrorMessage({ data: null }, 'fallback')).toBe('fallback');
  });

  it('falls back for an error-like object with no usable message', () => {
    expect(getConvexErrorMessage({ data: undefined }, 'fallback')).toBe('fallback');
  });

  it('passes through the raw message when it carries useful text', () => {
    expect(getConvexErrorMessage(new Error('Some real failure'), 'fb')).toBe('Some real failure');
  });
});

describe('safeAsync', () => {
  it('returns [data, null] on success', async () => {
    const [data, error] = await safeAsync(Promise.resolve(42));
    expect(data).toBe(42);
    expect(error).toBeNull();
  });

  it('returns [null, error] when the promise rejects with an Error', async () => {
    const [data, error] = await safeAsync(Promise.reject(new Error('failed')));
    expect(data).toBeNull();
    expect(error).toEqual(new Error('failed'));
  });

  it('wraps non-Error rejections into an Error', async () => {
    const [data, error] = await safeAsync(Promise.reject('plain string'));
    expect(data).toBeNull();
    expect(error).toEqual(new Error('plain string'));
  });
});

describe('toAppError remaining branches', () => {
  it('creates PermissionError for “not allowed” messages', () => {
    expect(toAppError(new Error('Operation not allowed'))).toBeInstanceOf(PermissionError);
  });

  it('creates UserError for validation/invalid messages', () => {
    expect(toAppError(new Error('validation failed'))).toBeInstanceOf(UserError);
    expect(toAppError(new Error('Invalid input data'))).toBeInstanceOf(UserError);
  });

  it('creates NetworkError for fetch/network messages', () => {
    expect(toAppError(new Error('fetch failed'))).toBeInstanceOf(NetworkError);
    expect(toAppError(new Error('network unreachable'))).toBeInstanceOf(NetworkError);
  });
});

describe('ValidationError defaults', () => {
  it('defaults to an empty fieldErrors map', () => {
    const error = new ValidationError('Nope');
    expect(error.fieldErrors).toEqual({});
    expect(error.code).toBe('VALIDATION_ERROR');
  });
});

describe('AppError details', () => {
  it('stores and exposes details', () => {
    const error = new AppError('x', { code: 'C', statusCode: 418, details: { a: 1 } });
    expect(error.details).toEqual({ a: 1 });
  });
});

describe('default constructor arguments', () => {
  it('AuthError defaults to “Authentication required”', () => {
    const error = new AuthError();
    expect(error.message).toBe('Authentication required');
    expect(error.statusCode).toBe(401);
  });

  it('PermissionError defaults to “Insufficient permissions”', () => {
    const error = new PermissionError();
    expect(error.message).toBe('Insufficient permissions');
    expect(error.statusCode).toBe(403);
  });

  it('NotFoundError builds the message from the default resource name', () => {
    const error = new NotFoundError();
    expect(error.message).toBe('Resource not found');
    expect(error.code).toBe('NOT_FOUND');
  });

  it('NetworkError defaults to “Network error occurred”', () => {
    const error = new NetworkError();
    expect(error.message).toBe('Network error occurred');
    expect(error.statusCode).toBe(503);
  });

  it('ServerError defaults to “Internal server error”', () => {
    const error = new ServerError();
    expect(error.message).toBe('Internal server error');
    expect(error.statusCode).toBe(500);
  });
});

describe('structured ConvexError codes', () => {
  // Mirrors what `new ConvexError({ code, message })` looks like after Convex
  // ships it to the client: the payload rides on `error.data`.
  const convexErrorLike = (data: unknown) => Object.assign(new Error('[payload]'), { data });

  it('getAppErrorCode extracts the code from a structured payload', () => {
    expect(getAppErrorCode(convexErrorLike({ code: 'FORBIDDEN', message: 'nope' }))).toBe(
      'FORBIDDEN',
    );
  });

  it('getAppErrorCode returns null for plain errors and non-structured payloads', () => {
    expect(getAppErrorCode(new Error('boom'))).toBeNull();
    expect(getAppErrorCode(convexErrorLike('plain string payload'))).toBeNull();
    expect(getAppErrorCode(undefined)).toBeNull();
  });

  it('appErrorToast translates a known code', () => {
    const t = (key: string) => (key === 'errors.codes.FORBIDDEN' ? 'Нет прав' : key);
    expect(appErrorToast(convexErrorLike({ code: 'FORBIDDEN', message: 'nope' }), t)).toEqual({
      title: 'Нет прав',
    });
  });

  it('appErrorToast falls back to the server message for unmapped codes', () => {
    const t = (key: string) => key; // no translations loaded
    expect(
      appErrorToast(convexErrorLike({ code: 'DRIVER_ON_LEAVE', message: 'Driver is on leave' }), t),
    ).toEqual({ title: 'Driver is on leave' });
  });

  it('appErrorToast falls back to the generic message for redacted server errors', () => {
    const t = (key: string) => (key === 'errors.somethingWentWrong' ? 'Что-то пошло не так' : key);
    expect(appErrorToast(new Error('[CONVEX Q] Server Error'), t)).toEqual({
      title: 'Что-то пошло не так',
    });
  });
});
