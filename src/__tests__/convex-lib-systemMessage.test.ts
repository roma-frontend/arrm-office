import { encodeSystemMessage, decodeSystemMessage } from '../../convex/lib/systemMessage';

describe('encodeSystemMessage', () => {
  it('encodes a key with empty params', () => {
    const result = encodeSystemMessage('chat.userJoined');
    expect(result).toBe('i18n::{"key":"chat.userJoined","params":{}}');
  });

  it('encodes a key with params', () => {
    const result = encodeSystemMessage('chat.userJoined', { name: 'Alice' });
    expect(result).toBe('i18n::{"key":"chat.userJoined","params":{"name":"Alice"}}');
  });

  it('encodes a key with multiple params', () => {
    const result = encodeSystemMessage('ticket.assigned', {
      ticket: '42',
      assignee: 'Bob',
    });
    expect(result).toContain('"key":"ticket.assigned"');
    expect(result).toContain('"ticket":"42"');
    expect(result).toContain('"assignee":"Bob"');
  });

  it('always starts with the i18n:: prefix', () => {
    expect(encodeSystemMessage('any.key')).toMatch(/^i18n::/);
  });
});

describe('decodeSystemMessage', () => {
  it('decodes a valid token', () => {
    const encoded = encodeSystemMessage('chat.userJoined', { name: 'Alice' });
    const decoded = decodeSystemMessage(encoded);
    expect(decoded).toEqual({
      key: 'chat.userJoined',
      params: { name: 'Alice' },
    });
  });

  it('returns null for plain text (no prefix)', () => {
    expect(decodeSystemMessage('Alice joined the chat')).toBeNull();
  });

  it('returns null for text that starts with i18n:: but has invalid JSON', () => {
    expect(decodeSystemMessage('i18n::not-json')).toBeNull();
  });

  it('returns null for JSON that is not an object', () => {
    expect(decodeSystemMessage('i18n::"just a string"')).toBeNull();
  });

  it('returns null when key is missing', () => {
    expect(decodeSystemMessage('i18n::{"params":{"name":"Alice"}}')).toBeNull();
  });

  it('returns null when key is empty string', () => {
    expect(decodeSystemMessage('i18n::{"key":"","params":{}}')).toBeNull();
  });

  it('returns null when key is not a string', () => {
    expect(decodeSystemMessage('i18n::{"key":123,"params":{}}')).toBeNull();
  });

  it('handles params with non-string values by converting to string', () => {
    const encoded = 'i18n::{"key":"test","params":{"count":42,"flag":true}}';
    const decoded = decodeSystemMessage(encoded);
    expect(decoded).toEqual({
      key: 'test',
      params: { count: '42', flag: 'true' },
    });
  });

  it('skips non-string, non-number, non-boolean params', () => {
    const encoded = 'i18n::{"key":"test","params":{"name":"ok","nested":{"a":1}}}';
    const decoded = decodeSystemMessage(encoded);
    expect(decoded).toEqual({
      key: 'test',
      params: { name: 'ok' },
    });
  });

  it('round-trips through encode → decode', () => {
    const original = { key: 'notifications.leaveApproved', params: { name: 'Tigran', days: '5' } };
    const encoded = encodeSystemMessage(original.key, original.params);
    const decoded = decodeSystemMessage(encoded);
    expect(decoded).toEqual(original);
  });
});
