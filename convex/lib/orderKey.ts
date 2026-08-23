/**
 * Order keys — strings that can always be inserted between.
 *
 * ## The problem
 *
 * Manual ordering with an integer `order` column costs one write per row after
 * the insertion point: dropping a task at the top of a 500-row board is 500
 * patches, in a mutation a person is waiting on. Convex charges for every one of
 * them, and a concurrent drag can interleave two renumberings into an order
 * neither person asked for.
 *
 * A fractional index costs exactly one write, always. Instead of a position it
 * stores a *label* whose lexicographic order is the display order, and between any
 * two distinct labels a third can be constructed. Moving a row means computing one
 * new label from its two new neighbours and patching one document.
 *
 * ## The encoding
 *
 * Keys are base-62 (`0-9A-Za-z`, which is ASCII order, so a plain string
 * comparison — and Convex's own index ordering — is the intended order). A key is
 * an integer part followed by an optional fraction:
 *
 *   - the first character encodes the integer part's *length*, so the integer
 *     range is effectively unbounded: `a` means two characters (`a0`…`az`), `b`
 *     means three (`b00`…`bzz`), and so on up to `z`. `A`…`Z` mirror it downwards
 *     for keys before the first, so prepending is as cheap as appending;
 *   - everything after the integer part is a fraction, used when two adjacent
 *     integers have no room between them.
 *
 * The consequence worth knowing: appending to the end of a list produces
 * `a0, a1, a2, …` — two characters, forever, because appends increment the integer
 * rather than subdividing a fraction. Only repeatedly inserting into the *same
 * gap* grows a key, by one character per ~62 inserts.
 *
 * This is the algorithm from David Greenspan's "Implementing Fractional Indexing",
 * as used by Figma and by the `fractional-indexing` package. It is reproduced here
 * rather than added as a dependency because it is sixty lines with no runtime
 * needs, and because `convex/` is bundled separately from the app.
 *
 * Pure and dependency-free, so it is unit-testable without a database and the
 * client can compute an optimistic key with exactly the same result as the server.
 */

/** Base 62 in ASCII order, so string comparison *is* numeric comparison. */
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const SMALLEST_DIGIT = '0';
const LARGEST_DIGIT = 'z';

/** `a0` — the key a first-ever row gets. */
export const FIRST_ORDER_KEY = 'a0';

/**
 * The floor of the encoding: 'A' followed by 26 zeros.
 *
 * Reserved rather than usable. It has no predecessor, so a row holding it could
 * never have anything inserted above it — which is exactly the situation the whole
 * scheme exists to avoid.
 */
const SMALLEST_INTEGER = `A${SMALLEST_DIGIT.repeat(26)}`;

function digitValue(char: string | undefined): number {
  if (char === undefined) return -1;
  return DIGITS.indexOf(char);
}

/**
 * How many characters the integer part occupies, read from its first character.
 *
 * `a`…`z` count upwards from two characters; `A`…`Z` mirror them, so that the
 * negative side is as expressive as the positive one and dragging to the top of a
 * board never runs out of room.
 */
function integerLength(head: string): number {
  if (head >= 'a' && head <= 'z') return head.charCodeAt(0) - 'a'.charCodeAt(0) + 2;
  if (head >= 'A' && head <= 'Z') return 'Z'.charCodeAt(0) - head.charCodeAt(0) + 2;
  throw new Error(`Invalid order key head: ${head}`);
}

function integerPart(key: string): string {
  const head = key[0];
  if (head === undefined) throw new Error('Invalid order key: empty');
  const length = integerLength(head);
  if (length > key.length) throw new Error(`Invalid order key: ${key}`);
  return key.slice(0, length);
}

function assertValidInteger(int: string): void {
  const head = int[0];
  if (head === undefined || int.length !== integerLength(head)) {
    throw new Error(`Invalid order key integer: ${int}`);
  }
}

/**
 * Rejects a key this module could not have produced.
 *
 * Order keys come back from the database and, for an optimistic update, from the
 * browser. A key with a trailing zero is the dangerous case: it is a value the
 * midpoint construction assumes cannot occur, and admitting one would let
 * `midpoint` return a key equal to one of its bounds — two rows in the same
 * position, and a list order that flickers between reads.
 */
export function isValidOrderKey(key: string): boolean {
  if (key === SMALLEST_INTEGER) return false;
  let int: string;
  try {
    int = integerPart(key);
  } catch {
    return false;
  }
  for (const char of int.slice(1)) {
    if (digitValue(char) < 0) return false;
  }
  const fraction = key.slice(int.length);
  if (fraction.endsWith(SMALLEST_DIGIT)) return false;
  for (const char of fraction) {
    if (digitValue(char) < 0) return false;
  }
  return true;
}

function assertValidOrderKey(key: string): void {
  if (!isValidOrderKey(key)) throw new Error(`Invalid order key: ${key}`);
}

/** The next integer, or `null` at the ceiling of the encoding. */
function incrementInteger(int: string): string | null {
  assertValidInteger(int);
  const head = int[0]!;
  const digits = int.slice(1).split('');

  let carry = true;
  for (let i = digits.length - 1; carry && i >= 0; i -= 1) {
    const next = digitValue(digits[i]) + 1;
    if (next === DIGITS.length) {
      digits[i] = SMALLEST_DIGIT;
    } else {
      digits[i] = DIGITS[next]!;
      carry = false;
    }
  }

  if (!carry) return head + digits.join('');

  // Every digit wrapped, so the integer needs a wider (or narrower, on the
  // negative side) encoding — which is what the head character selects.
  if (head === 'Z') return `a${SMALLEST_DIGIT}`;
  if (head === 'z') return null;
  const wider = String.fromCharCode(head.charCodeAt(0) + 1);
  if (wider > 'a') digits.push(SMALLEST_DIGIT);
  else digits.pop();
  return wider + digits.join('');
}

/** The previous integer, or `null` at the floor of the encoding. */
function decrementInteger(int: string): string | null {
  assertValidInteger(int);
  const head = int[0]!;
  const digits = int.slice(1).split('');

  let borrow = true;
  for (let i = digits.length - 1; borrow && i >= 0; i -= 1) {
    const next = digitValue(digits[i]) - 1;
    if (next === -1) {
      digits[i] = LARGEST_DIGIT;
    } else {
      digits[i] = DIGITS[next]!;
      borrow = false;
    }
  }

  if (!borrow) return head + digits.join('');

  if (head === 'a') return `Z${LARGEST_DIGIT}`;
  if (head === 'A') return null;
  const narrower = String.fromCharCode(head.charCodeAt(0) - 1);
  if (narrower < 'Z') digits.push(LARGEST_DIGIT);
  else digits.pop();
  return narrower + digits.join('');
}

/**
 * A fraction strictly between two fractions, where `''` is the smallest possible
 * and `null` means unbounded above.
 *
 * Recursive on the shared prefix: the part both bounds agree on is copied through
 * and the problem shrinks to the first character where they differ.
 */
function midpoint(a: string, b: string | null): string {
  if (b !== null && a >= b) throw new Error(`Order keys out of sequence: ${a} >= ${b}`);
  if (a.endsWith(SMALLEST_DIGIT) || (b !== null && b.endsWith(SMALLEST_DIGIT))) {
    throw new Error('Order key fraction must not end in a zero');
  }

  if (b !== null) {
    let shared = 0;
    // An absent character in `a` is the smallest possible digit, which is what
    // makes `a` a prefix of `b` work without a special case.
    while ((a[shared] ?? SMALLEST_DIGIT) === b[shared]) shared += 1;
    if (shared > 0) {
      return b.slice(0, shared) + midpoint(a.slice(shared), b.slice(shared));
    }
  }

  const low = a === '' ? 0 : digitValue(a[0]);
  const high = b !== null ? digitValue(b[0]) : DIGITS.length;

  if (high - low > 1) {
    return DIGITS[Math.round(0.5 * (low + high))]!;
  }
  // The bounds are adjacent digits, so the midpoint has to be longer than one of
  // them: either `b`'s first digit alone (already above `a`), or `a`'s first digit
  // followed by a midpoint of the rest.
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return DIGITS[low]! + midpoint(a.slice(1), null);
}

/**
 * A key that sorts strictly between `before` and `after`.
 *
 * `null` on either side means "nothing there": `orderKeyBetween(null, null)` is
 * the first row of an empty list, `orderKeyBetween(last, null)` appends, and
 * `orderKeyBetween(null, first)` prepends.
 *
 * Throws when the bounds are equal or reversed, which is a caller bug and not
 * something to paper over — silently returning a key equal to a neighbour would
 * produce a list whose order changes between reads.
 */
export function orderKeyBetween(before: string | null, after: string | null): string {
  if (before !== null) assertValidOrderKey(before);
  if (after !== null) assertValidOrderKey(after);
  if (before !== null && after !== null && before >= after) {
    throw new Error(`Order keys out of sequence: ${before} >= ${after}`);
  }

  if (before === null) {
    if (after === null) return FIRST_ORDER_KEY;

    const int = integerPart(after);
    const fraction = after.slice(int.length);
    if (int === SMALLEST_INTEGER) {
      // Already at the floor: the only room left is inside the fraction.
      return int + midpoint('', fraction);
    }
    // A key with a fraction is above its own integer part, so that integer is
    // itself a valid answer — and a shorter one than decrementing would give.
    if (int < after) return int;
    const decremented = decrementInteger(int);
    if (decremented === null) throw new Error('Order keys exhausted below');
    return decremented;
  }

  if (after === null) {
    const int = integerPart(before);
    const fraction = before.slice(int.length);
    const incremented = incrementInteger(int);
    return incremented === null ? int + midpoint(fraction, null) : incremented;
  }

  const beforeInt = integerPart(before);
  const afterInt = integerPart(after);
  if (beforeInt === afterInt) {
    return beforeInt + midpoint(before.slice(beforeInt.length), after.slice(afterInt.length));
  }

  const incremented = incrementInteger(beforeInt);
  if (incremented === null) throw new Error('Order keys exhausted above');
  if (incremented < after) return incremented;
  return beforeInt + midpoint(before.slice(beforeInt.length), null);
}

/**
 * `count` keys in ascending sequence between the two bounds.
 *
 * For seeding a list — backfilling a board that has never been ordered by hand,
 * or materializing several tasks from one template — where calling
 * {@link orderKeyBetween} in a loop would build a needlessly long final key by
 * subdividing the same gap repeatedly.
 */
export function orderKeysBetween(
  before: string | null,
  after: string | null,
  count: number,
): string[] {
  if (count <= 0) return [];
  if (count === 1) return [orderKeyBetween(before, after)];

  if (after === null) {
    let cursor = before;
    return Array.from({ length: count }, () => {
      cursor = orderKeyBetween(cursor, null);
      return cursor;
    });
  }

  if (before === null) {
    let cursor = after;
    const descending = Array.from({ length: count }, () => {
      cursor = orderKeyBetween(null, cursor);
      return cursor;
    });
    return descending.reverse();
  }

  // Split the gap in the middle and recurse into both halves, so keys grow by
  // log(count) characters rather than by count.
  const half = Math.floor(count / 2);
  const middle = orderKeyBetween(before, after);
  return [
    ...orderKeysBetween(before, middle, half),
    middle,
    ...orderKeysBetween(middle, after, count - half - 1),
  ];
}

/**
 * The order key of a row that has never had one, derived from its creation time.
 *
 * Rows written before manual ordering existed have no `orderKey`, and a board
 * mixing keyed and unkeyed rows has to put the unkeyed ones somewhere. Sorting
 * them after everything keyed — by creation time among themselves — is the
 * behaviour those boards already showed.
 *
 * The important property is that this returns a **valid** order key, not just a
 * sortable string. It means dropping a row between two rows that have never been
 * ordered by hand still costs exactly one write: the two neighbours are anchors
 * that need no key of their own, because their key is a function of themselves.
 * The alternative — writing keys onto every row in the list before the first drag
 * could be expressed — is hundreds of patches in a mutation somebody is waiting on.
 *
 * `y` as the head puts these above every key the generator produces in practice:
 * appends climb from `a0` and would need 62²⁴ of them to reach `y`.
 */
export function orderKeyFallback(createdAt: number): string {
  return `y${toBase62(createdAt, 25)}`;
}

/**
 * Base 62, zero-padded to a fixed width so the digits compare as numbers do.
 *
 * The width is the integer length `y` declares (26 characters, one head plus 25
 * digits). A millisecond timestamp needs seven of them, leaving room until long
 * after this code is gone.
 */
function toBase62(value: number, width: number): string {
  let remaining = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  let out = '';
  while (remaining > 0) {
    out = DIGITS[remaining % DIGITS.length]! + out;
    remaining = Math.floor(remaining / DIGITS.length);
  }
  return out.padStart(width, SMALLEST_DIGIT);
}

/** A row's key for sorting and for insertion maths, real or derived. */
export function effectiveOrderKey(row: { orderKey?: string; createdAt: number }): string {
  return row.orderKey && isValidOrderKey(row.orderKey)
    ? row.orderKey
    : orderKeyFallback(row.createdAt);
}

/**
 * Ascending by order key, with never-ordered rows last by creation time.
 *
 * The tiebreaker matters: two rows created in the same millisecond derive the same
 * fallback key, and `_id` is the only thing left that distinguishes them. Without
 * it the sort is unstable and the list quietly reshuffles between renders.
 */
export function compareOrderKeys(
  a: { orderKey?: string; createdAt: number; _id?: string },
  b: { orderKey?: string; createdAt: number; _id?: string },
): number {
  const left = effectiveOrderKey(a);
  const right = effectiveOrderKey(b);
  if (left !== right) return left < right ? -1 : 1;
  return String(a._id ?? '').localeCompare(String(b._id ?? ''));
}
