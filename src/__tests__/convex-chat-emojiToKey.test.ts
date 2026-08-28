// emojiToKey is a private function in convex/messenger/messages.ts.
// We test the exact same pattern: converting emoji to safe map keys.

function emojiToKey(emoji: string): string {
  return [...emoji].map((c) => 'u' + c.codePointAt(0)!.toString(16)).join('_');
}

describe('emojiToKey (messenger reactions)', () => {
  it('converts a simple emoji to a safe key', () => {
    // 👍 = U+1F44D
    const key = emojiToKey('👍');
    expect(key).toBe('u1f44d');
  });

  it('converts a multi-codepoint emoji (skin tone)', () => {
    // 👍🏽 = U+1F44D U+1F3FD
    const key = emojiToKey('👍🏽');
    expect(key).toBe('u1f44d_u1f3fd');
  });

  it('converts a flag emoji', () => {
    // 🇦🇲 = U+1F1E6 U+1F1F2
    const key = emojiToKey('🇦🇲');
    expect(key).toBe('u1f1e6_u1f1f2');
  });

  it('produces unique keys for different emojis', () => {
    const emojis = ['👍', '❤️', '😂', '🎉', '🔥', '👀'];
    const keys = emojis.map(emojiToKey);
    expect(new Set(keys).size).toBe(emojis.length);
  });

  it('keys are deterministic', () => {
    expect(emojiToKey('🚀')).toBe(emojiToKey('🚀'));
  });

  it('handles heart emoji', () => {
    // ❤️ = U+2764 U+FE0F (with variation selector)
    const key = emojiToKey('❤️');
    expect(key).toMatch(/^u[0-9a-f]+(_u[0-9a-f]+)*$/);
  });

  it('handles single character emoji', () => {
    const key = emojiToKey('😀');
    expect(key).toBe('u1f600');
  });

  it('all keys start with "u" prefix', () => {
    ['👍', '❤️', '🎉', '🔥', '💯'].forEach((emoji) => {
      const key = emojiToKey(emoji);
      expect(key.startsWith('u')).toBe(true);
    });
  });
});
