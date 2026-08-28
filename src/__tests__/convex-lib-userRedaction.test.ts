import { redactUser, SENSITIVE_USER_FIELDS } from '../../convex/lib/userRedaction';

describe('SENSITIVE_USER_FIELDS', () => {
  it('contains critical auth fields', () => {
    expect(SENSITIVE_USER_FIELDS).toContain('passwordHash');
    expect(SENSITIVE_USER_FIELDS).toContain('sessionToken');
    expect(SENSITIVE_USER_FIELDS).toContain('sessionExpiry');
  });

  it('contains 2FA fields', () => {
    expect(SENSITIVE_USER_FIELDS).toContain('totpSecret');
    expect(SENSITIVE_USER_FIELDS).toContain('backupCodes');
  });

  it('contains biometric fields', () => {
    expect(SENSITIVE_USER_FIELDS).toContain('faceDescriptor');
    expect(SENSITIVE_USER_FIELDS).toContain('webauthnChallenge');
  });

  it('contains password-reset fields', () => {
    expect(SENSITIVE_USER_FIELDS).toContain('resetPasswordToken');
    expect(SENSITIVE_USER_FIELDS).toContain('resetPasswordExpiry');
  });

  it('contains login-throttle fields', () => {
    expect(SENSITIVE_USER_FIELDS).toContain('loginFailedAttempts');
    expect(SENSITIVE_USER_FIELDS).toContain('loginLockedUntil');
  });

  it('contains Face ID fields', () => {
    expect(SENSITIVE_USER_FIELDS).toContain('faceIdBlocked');
    expect(SENSITIVE_USER_FIELDS).toContain('faceIdFailedAttempts');
    expect(SENSITIVE_USER_FIELDS).toContain('faceIdLastAttempt');
  });
});

describe('redactUser', () => {
  it('removes all sensitive fields', () => {
    const user = {
      _id: 'user123',
      name: 'Alice',
      email: 'alice@test.com',
      role: 'admin',
      passwordHash: 'hashed-pw',
      sessionToken: 'tok_123',
      sessionExpiry: Date.now(),
      totpSecret: 'SECRET',
      backupCodes: ['code1'],
      faceDescriptor: [0.1, 0.2],
      resetPasswordToken: 'reset-token',
      resetPasswordExpiry: Date.now(),
      loginFailedAttempts: 3,
      loginLockedUntil: Date.now(),
    };
    const redacted = redactUser(user);

    expect(redacted.name).toBe('Alice');
    expect(redacted.email).toBe('alice@test.com');
    expect(redacted.role).toBe('admin');

    // All sensitive fields removed
    expect((redacted as any).passwordHash).toBeUndefined();
    expect((redacted as any).sessionToken).toBeUndefined();
    expect((redacted as any).sessionExpiry).toBeUndefined();
    expect((redacted as any).totpSecret).toBeUndefined();
    expect((redacted as any).backupCodes).toBeUndefined();
    expect((redacted as any).faceDescriptor).toBeUndefined();
    expect((redacted as any).resetPasswordToken).toBeUndefined();
    expect((redacted as any).resetPasswordExpiry).toBeUndefined();
    expect((redacted as any).loginFailedAttempts).toBeUndefined();
    expect((redacted as any).loginLockedUntil).toBeUndefined();
  });

  it('preserves the _id field', () => {
    const user = { _id: 'abc123', name: 'Bob', passwordHash: 'hash' };
    expect(redactUser(user)._id).toBe('abc123');
  });

  it('returns a new object (does not mutate the original)', () => {
    const user = { _id: 'u1', name: 'Test', passwordHash: 'hash' };
    const redacted = redactUser(user);
    expect(user.passwordHash).toBe('hash');
    expect(redacted).not.toBe(user);
  });

  it('handles an object with no sensitive fields', () => {
    const user = { _id: 'u1', name: 'Safe', email: 'a@b.com' };
    expect(redactUser(user)).toEqual(user);
  });

  it('handles an empty object', () => {
    const redacted = redactUser({ _id: 'empty' });
    expect(redacted).toEqual({ _id: 'empty' });
  });

  it('handles faceIdBlocked and faceIdBlockedAt', () => {
    const user = {
      _id: 'u1',
      name: 'Test',
      faceIdBlocked: true,
      faceIdBlockedAt: 1234567890,
    };
    const redacted = redactUser(user);
    expect((redacted as any).faceIdBlocked).toBeUndefined();
    expect((redacted as any).faceIdBlockedAt).toBeUndefined();
  });
});
