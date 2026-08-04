import { convexIdFromParam, isConvexId } from '@/lib/convexIds';

describe('isConvexId', () => {
  it('accepts a real Convex document id', () => {
    expect(isConvexId('y57bgewt2e32ndj2b7fx13p2es8btrja')).toBe(true);
  });

  it('rejects literal route segments that collide with [id]', () => {
    // These are the ones that actually reached v.id() in production.
    expect(isConvexId('new')).toBe(false);
    expect(isConvexId('create')).toBe(false);
    expect(isConvexId('edit')).toBe(false);
  });

  it('rejects empty and non-string values', () => {
    expect(isConvexId('')).toBe(false);
    expect(isConvexId(undefined)).toBe(false);
    expect(isConvexId(null)).toBe(false);
    expect(isConvexId(42)).toBe(false);
  });

  it('rejects ids with separators or spaces', () => {
    expect(isConvexId('y57bgewt2e32ndj2/b7fx13p2es8btrja')).toBe(false);
    expect(isConvexId('y57bgewt 2e32ndj2b7fx13p2es8btrja')).toBe(false);
  });

  it('rejects an id longer than any Convex id', () => {
    expect(isConvexId('a'.repeat(65))).toBe(false);
  });
});

describe('convexIdFromParam', () => {
  it('returns the id when the param is valid', () => {
    expect(convexIdFromParam('y57bgewt2e32ndj2b7fx13p2es8btrja')).toBe(
      'y57bgewt2e32ndj2b7fx13p2es8btrja',
    );
  });

  it('unwraps a catch-all array param', () => {
    expect(convexIdFromParam(['y57bgewt2e32ndj2b7fx13p2es8btrja', 'edit'])).toBe(
      'y57bgewt2e32ndj2b7fx13p2es8btrja',
    );
  });

  it('returns null for a literal segment', () => {
    expect(convexIdFromParam('new')).toBeNull();
    expect(convexIdFromParam(undefined)).toBeNull();
  });
});
