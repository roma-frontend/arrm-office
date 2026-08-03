import { redactUser, SENSITIVE_USER_FIELDS } from '../../convex/lib/userRedaction';

describe('userRedaction', () => {
  const user = {
    _id: 'user_1',
    _creationTime: 1710000000000,
    name: 'Alice',
    email: 'alice@example.com',
    role: 'employee',
    department: 'Engineering',
    paidLeaveBalance: 24,
    passwordHash: '$2a$12$abcdefghijklmnopqrstuv',
    sessionToken: 'session-secret',
    sessionExpiry: 1710000000000,
    totpSecret: 'JBSWY3DPEHPK3PXP',
    backupCodes: ['11111', '22222'],
    resetPasswordToken: 'reset-token',
    resetPasswordExpiry: 1710000000000,
    webauthnChallenge: 'challenge',
    faceDescriptor: [0.1, 0.2, 0.3],
    loginFailedAttempts: 3,
    loginLockedUntil: 1710000000000,
    faceIdBlocked: true,
    faceIdBlockedAt: 1710000000000,
    faceIdFailedAttempts: 2,
    faceIdLastAttempt: 1710000000000,
  };

  it('strips every sensitive field from the returned copy', () => {
    const safe = redactUser(user) as Record<string, unknown>;

    for (const field of SENSITIVE_USER_FIELDS) {
      expect(safe[field]).toBeUndefined();
    }
  });

  it('keeps safe display fields', () => {
    const safe = redactUser(user) as Record<string, unknown>;

    expect(safe._id).toBe('user_1');
    expect(safe.name).toBe('Alice');
    expect(safe.email).toBe('alice@example.com');
    expect(safe.role).toBe('employee');
    expect(safe.department).toBe('Engineering');
    expect(safe.paidLeaveBalance).toBe(24);
  });

  it('does not mutate the input document', () => {
    redactUser(user);
    expect(user.passwordHash).toBe('$2a$12$abcdefghijklmnopqrstuv');
    expect(user.totpSecret).toBe('JBSWY3DPEHPK3PXP');
  });

  it('never serializes sensitive fields to JSON', () => {
    const json = JSON.stringify(redactUser(user));
    expect(json).not.toContain('passwordHash');
    expect(json).not.toContain('totpSecret');
    expect(json).not.toContain('sessionToken');
    expect(json).not.toContain('faceDescriptor');
  });
});
