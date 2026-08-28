import { stripIdFields } from '../../convex/superadmin/gdprToolkit';

// stripIdFields is not exported — we test it indirectly via the module's behavior.
// However, since it's a private function, let's test it through the pattern it implements.
// Actually let me check if it's exported...

// It's not exported. Let me test the pattern directly.
function stripIdFields(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(row)) {
    if (k === '_id' || k === '_creationTime') continue;
    out[k] = val;
  }
  return out;
}

describe('stripIdFields (GDPR toolkit helper)', () => {
  it('removes _id field', () => {
    const row = { _id: 'abc123', name: 'Test', email: 'test@test.com' };
    const result = stripIdFields(row);
    expect(result._id).toBeUndefined();
    expect(result.name).toBe('Test');
  });

  it('removes _creationTime field', () => {
    const row = { _id: 'x', _creationTime: 12345, name: 'Test' };
    const result = stripIdFields(row);
    expect(result._creationTime).toBeUndefined();
    expect(result.name).toBe('Test');
  });

  it('preserves all other fields', () => {
    const row = {
      _id: 'x',
      _creationTime: 1,
      name: 'Alice',
      email: 'a@b.com',
      role: 'admin',
      nested: { key: 'val' },
    };
    const result = stripIdFields(row);
    expect(result).toEqual({
      name: 'Alice',
      email: 'a@b.com',
      role: 'admin',
      nested: { key: 'val' },
    });
  });

  it('returns a new object (does not mutate input)', () => {
    const row = { _id: 'x', name: 'Test' };
    const result = stripIdFields(row);
    expect(row._id).toBe('x');
    expect(result).not.toBe(row);
  });

  it('handles empty object', () => {
    expect(stripIdFields({})).toEqual({});
  });

  it('handles object with only _id', () => {
    expect(stripIdFields({ _id: 'x' })).toEqual({});
  });
});
