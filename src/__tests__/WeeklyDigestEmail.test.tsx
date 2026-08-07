/**
 * Tests for src/emails/WeeklyDigestEmail.tsx — the newsletter template.
 * Rendered to static markup (react-dom/server), no email provider needed.
 */

import React from 'react';
import { describe, it, expect } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';
import { WeeklyDigestEmail } from '@/emails/WeeklyDigestEmail';

const content = {
  subject: 'Weekly digest',
  greeting: 'Here is what happened this week.',
  tips: [
    { title: 'Tip one', body: 'Body one', emoji: '💡' },
    { title: 'Tip two', body: 'Body two', emoji: '⭐' },
    { title: 'Tip three', body: 'Body three', emoji: '🎯' },
    { title: 'Tip four', body: 'Should be sliced off', emoji: '🚫' },
  ],
  trends: [
    { title: 'Trend A', body: 'Trend body A' },
    { title: 'Trend B', body: 'Trend body B' },
  ],
  quote: { text: 'Great teams ship.', author: 'Anonymous' },
  promo: { title: 'Promo', body: 'Try it', cta: 'Get started', link: 'https://app.example/promo' },
};

function render() {
  return renderToStaticMarkup(
    React.createElement(WeeklyDigestEmail, {
      name: 'Anna',
      content,
      unsubscribeUrl: 'https://app.example/unsubscribe?token=abc',
    }),
  );
}

describe('WeeklyDigestEmail', () => {
  it('renders the greeting with the recipient name', () => {
    const html = render();
    expect(html).toContain('Hi Anna 👋');
    expect(html).toContain(content.greeting);
  });

  it('renders the hero header and title', () => {
    const html = render();
    expect(html).toContain('🎯 Strata');
    expect(html).toContain('Weekly HR Digest');
  });

  it('renders at most three tips', () => {
    const html = render();
    expect(html).toContain('💡 Tip one');
    expect(html).toContain('⭐ Tip two');
    expect(html).toContain('🎯 Tip three');
    expect(html).not.toContain('Should be sliced off');
  });

  it('renders trends, quote and promo CTA', () => {
    const html = render();
    expect(html).toContain('Trend A');
    // renderToStaticMarkup escapes double quotes in text nodes
    expect(html).toContain('&quot;Great teams ship.&quot;');
    expect(html).toContain('Anonymous');
    expect(html).toContain('Get started');
    expect(html).toContain('https://app.example/promo');
  });

  it('renders the unsubscribe link', () => {
    const html = render();
    expect(html).toContain('https://app.example/unsubscribe?token=abc');
    expect(html).toContain('Unsubscribe');
  });

  it('renders the copyright footer with the current year', () => {
    const html = render();
    expect(html).toContain(`© ${new Date().getFullYear()} Strata`);
  });

  it('works with an empty trends array', () => {
    const html = renderToStaticMarkup(
      React.createElement(WeeklyDigestEmail, {
        name: 'Anna',
        content: { ...content, trends: [] },
        unsubscribeUrl: 'https://app.example/unsub',
      }),
    );
    expect(html).toContain('Hi Anna 👋');
    expect(html).not.toContain('Trend A');
  });
});
