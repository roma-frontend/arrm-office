import React from 'react';

interface NewsletterContent {
  subject: string;
  greeting: string;
  tips: Array<{ title: string; body: string; emoji: string }>;
  trends: Array<{ title: string; body: string }>;
  quote: { text: string; author: string };
  promo: { title: string; body: string; cta: string; link: string };
}

interface WeeklyDigestEmailProps {
  name: string;
  content: NewsletterContent;
  unsubscribeUrl: string;
}

export function WeeklyDigestEmail({ name, content, unsubscribeUrl }: WeeklyDigestEmailProps) {
  return React.createElement(
    'html',
    null,
    React.createElement(
      'head',
      null,
      React.createElement('meta', { charSet: 'utf-8' }),
      React.createElement('meta', {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      }),
      React.createElement('meta', { name: 'color-scheme', content: 'light dark' }),
      React.createElement('meta', {
        name: 'supported-color-schemes',
        content: 'light dark',
      }),
    ),
    React.createElement(
      'body',
      {
        style: {
          margin: 0,
          padding: 0,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          backgroundColor: '#f1f5f9',
          color: '#1e293b',
        },
      },
      React.createElement(
        'div',
        { style: { maxWidth: 600, margin: '0 auto', padding: '32px 16px' } },
        // Hero header
        React.createElement(
          'div',
          {
            style: {
              background: 'linear-gradient(135deg, #2563eb, #0ea5e9, #8b5cf6)',
              borderRadius: '16px 16px 0 0',
              padding: '48px 32px',
              textAlign: 'center' as const,
            },
          },
          React.createElement(
            'h1',
            {
              style: {
                color: '#ffffff',
                fontSize: 28,
                fontWeight: 800,
                margin: '0 0 8px',
              },
            },
            '🎯 Strata',
          ),
          React.createElement(
            'p',
            { style: { color: 'rgba(255,255,255,0.9)', fontSize: 14, margin: 0 } },
            'Weekly HR Digest',
          ),
        ),
        // Main content card
        React.createElement(
          'div',
          {
            style: {
              backgroundColor: '#ffffff',
              padding: '32px',
              borderRadius: '0 0 16px 16px',
              border: '1px solid #e2e8f0',
              borderTop: 'none',
            },
          },
          // Greeting
          React.createElement(
            'p',
            { style: { fontSize: 16, lineHeight: 1.6, margin: '0 0 8px' } },
            `Hi ${name} 👋`,
          ),
          React.createElement(
            'p',
            { style: { fontSize: 14, lineHeight: 1.6, color: '#475569', margin: '0 0 24px' } },
            content.greeting,
          ),
          // Tips section
          React.createElement(
            'h2',
            { style: { fontSize: 18, fontWeight: 700, margin: '0 0 16px', color: '#2563eb' } },
            '💡 Tips of the Week',
          ),
          ...content.tips.slice(0, 3).map((tip, i) =>
            React.createElement(
              'div',
              {
                key: i,
                style: {
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: '16px',
                  marginBottom: 12,
                },
              },
              React.createElement(
                'h3',
                { style: { fontSize: 15, fontWeight: 600, margin: '0 0 6px' } },
                `${tip.emoji} ${tip.title}`,
              ),
              React.createElement(
                'p',
                { style: { fontSize: 13, color: '#475569', margin: 0, lineHeight: 1.5 } },
                tip.body,
              ),
            ),
          ),
          // Trends section
          React.createElement(
            'h2',
            {
              style: {
                fontSize: 18,
                fontWeight: 700,
                margin: '24px 0 16px',
                color: '#0ea5e9',
              },
            },
            '📈 HR Trends',
          ),
          ...content.trends
            .slice(0, 2)
            .map((trend, i) =>
              React.createElement(
                'div',
                { key: i, style: { marginBottom: 12 } },
                React.createElement(
                  'h3',
                  { style: { fontSize: 14, fontWeight: 600, margin: '0 0 4px' } },
                  trend.title,
                ),
                React.createElement(
                  'p',
                  { style: { fontSize: 13, color: '#475569', margin: 0, lineHeight: 1.5 } },
                  trend.body,
                ),
              ),
            ),
          // Quote section
          React.createElement(
            'div',
            {
              style: {
                background: 'linear-gradient(135deg, #ede9fe, #dbeafe)',
                borderRadius: 12,
                padding: '20px 24px',
                margin: '24px 0',
                borderLeft: '4px solid #8b5cf6',
              },
            },
            React.createElement(
              'p',
              {
                style: {
                  fontSize: 14,
                  fontStyle: 'italic',
                  color: '#4c1d95',
                  margin: '0 0 8px',
                  lineHeight: 1.5,
                },
              },
              `"${content.quote.text}"`,
            ),
            React.createElement(
              'p',
              { style: { fontSize: 12, color: '#6b21a8', margin: 0, fontWeight: 600 } },
              `— ${content.quote.author}`,
            ),
          ),
          // CTA button
          React.createElement(
            'div',
            { style: { textAlign: 'center' as const, margin: '32px 0' } },
            React.createElement(
              'a',
              {
                href: content.promo.link,
                style: {
                  display: 'inline-block',
                  background: 'linear-gradient(135deg, #2563eb, #8b5cf6)',
                  color: '#ffffff',
                  padding: '14px 32px',
                  borderRadius: 8,
                  textDecoration: 'none',
                  fontWeight: 600,
                  fontSize: 14,
                },
              },
              content.promo.cta,
            ),
          ),
        ),
        // Footer
        React.createElement(
          'div',
          {
            style: {
              textAlign: 'center' as const,
              padding: '24px 16px',
              color: '#94a3b8',
              fontSize: 12,
            },
          },
          React.createElement(
            'p',
            { style: { margin: '0 0 8px' } },
            `© ${new Date().getFullYear()} Strata • From Strategy to Results`,
          ),
          React.createElement(
            'a',
            {
              href: unsubscribeUrl,
              style: { color: '#64748b', textDecoration: 'underline' },
            },
            'Unsubscribe',
          ),
        ),
      ),
    ),
  );
}
