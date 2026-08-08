/**
 * Tests for localizable chat system messages.
 *
 * The server used to render these into text in the language of whoever triggered
 * them, which in practice meant English for everyone. Now it stores a token that
 * each reader's client resolves, so the encoding has to survive round-tripping
 * and must never turn ordinary text into something invisible.
 */

import { describe, it, expect } from '@jest/globals';
import { encodeSystemMessage, decodeSystemMessage } from '../../convex/lib/systemMessage';

describe('system message tokens', () => {
  it('round-trips a key with params', () => {
    const stored = encodeSystemMessage('ticket.chatCreated', { ticketNumber: 'SUP-1' });
    expect(decodeSystemMessage(stored)).toEqual({
      key: 'ticket.chatCreated',
      params: { ticketNumber: 'SUP-1' },
    });
  });

  it('round-trips a key without params', () => {
    expect(decodeSystemMessage(encodeSystemMessage('chat.memberJoined'))).toEqual({
      key: 'chat.memberJoined',
      params: {},
    });
  });

  it('survives values that would break a delimiter-based format', () => {
    const stored = encodeSystemMessage('ticket.chatCreated', {
      ticketNumber: 'SUP-1: "quoted" · with :: colons',
    });
    expect(decodeSystemMessage(stored)?.params.ticketNumber).toBe(
      'SUP-1: "quoted" · with :: colons',
    );
  });

  it('treats plain prose as prose', () => {
    // Messages written before tokens existed have to stay readable.
    expect(decodeSystemMessage('Chat created for ticket SUP-1')).toBeNull();
    expect(decodeSystemMessage('')).toBeNull();
  });

  it('treats a malformed token as prose rather than losing the message', () => {
    expect(decodeSystemMessage('i18n::{not json')).toBeNull();
    expect(decodeSystemMessage('i18n::null')).toBeNull();
    expect(decodeSystemMessage('i18n::{"params":{}}')).toBeNull();
    expect(decodeSystemMessage('i18n::{"key":""}')).toBeNull();
  });

  it('coerces numeric and boolean params, drops the rest', () => {
    const stored = 'i18n::{"key":"k","params":{"n":3,"b":true,"nested":{"x":1},"nil":null}}';
    expect(decodeSystemMessage(stored)).toEqual({
      key: 'k',
      params: { n: '3', b: 'true' },
    });
  });

  it('keeps the token out of sight of anything expecting prose', () => {
    // The marker is deliberately unlikely to be typed by a human.
    expect(encodeSystemMessage('k')).toMatch(/^i18n::\{/);
  });
});
