// DM key pattern from convex/messenger/conversations.ts:
// const ids = [userId, otherUserId].sort();
// const dmKey = ids.join('_');

function generateDmKey(userId: string, otherUserId: string): string {
  return [userId, otherUserId].sort().join('_');
}

describe('DM key generation', () => {
  it('produces a deterministic key regardless of argument order', () => {
    expect(generateDmKey('alice', 'bob')).toBe(generateDmKey('bob', 'alice'));
  });

  it('sorts ids alphabetically', () => {
    expect(generateDmKey('charlie', 'alice')).toBe('alice_charlie');
  });

  it('handles numeric ids (sorted as strings)', () => {
    const key = generateDmKey('user_2', 'user_10');
    expect(key).toBe('user_10_user_2'); // string sort: "10" < "2"
  });

  it('is unique for different pairs', () => {
    const k1 = generateDmKey('a', 'b');
    const k2 = generateDmKey('a', 'c');
    expect(k1).not.toBe(k2);
  });

  it('handles same user (edge case)', () => {
    expect(generateDmKey('alice', 'alice')).toBe('alice_alice');
  });
});

// DM membership validation: prevent creating DM with yourself
function validateDmArgs(userId: string, otherUserId: string): string | null {
  if (userId === otherUserId) return 'Cannot create conversation with yourself';
  return null;
}

describe('DM creation validation', () => {
  it('allows different users', () => {
    expect(validateDmArgs('alice', 'bob')).toBeNull();
  });

  it('rejects same user', () => {
    expect(validateDmArgs('alice', 'alice')).toBe('Cannot create conversation with yourself');
  });
});

// DM conversation lookup: check if conversation is a DM (direct)
interface TestConv {
  type: 'direct' | 'group';
  organizationId?: string;
}

function isDirectMessage(conv: TestConv, userOrgId?: string): boolean {
  if (conv.type !== 'direct') return false;
  if (userOrgId && conv.organizationId && conv.organizationId !== userOrgId) return false;
  return true;
}

describe('Direct message validation', () => {
  it('returns true for direct message in same org', () => {
    expect(isDirectMessage({ type: 'direct', organizationId: 'org1' }, 'org1')).toBe(true);
  });

  it('returns false for group conversation', () => {
    expect(isDirectMessage({ type: 'group' }, 'org1')).toBe(false);
  });

  it('returns false for DM in different org', () => {
    expect(isDirectMessage({ type: 'direct', organizationId: 'org1' }, 'org2')).toBe(false);
  });

  it('returns true for DM without org filter', () => {
    expect(isDirectMessage({ type: 'direct', organizationId: 'org1' })).toBe(true);
  });
});
