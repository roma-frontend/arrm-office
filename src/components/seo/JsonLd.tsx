/**
 * JSON-LD Structured Data for SEO
 * Includes: SoftwareApplication, Organization, FAQPage schemas
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://strata.work';

export function SoftwareApplicationJsonLd() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Strata',
    description:
      'From strategy to results — align, track, and achieve your OKRs, with real-time attendance tracking, leave management, task management, employee analytics, face recognition check-in, and AI assistant.',
    url: APP_URL,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: 'Free tier available with paid plans starting at $9/month',
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.9',
      ratingCount: '1000',
      bestRating: '5',
      worstRating: '1',
    },
    author: {
      '@type': 'Organization',
      name: 'Strata Team',
      url: APP_URL,
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

export function OrganizationJsonLd() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Strata',
    url: APP_URL,
    logo: 'https://strata.work/favicon.svg',
    sameAs: [
      'https://twitter.com/strata',
      'https://linkedin.com/company/strata',
      'https://github.com/roma-frontend/hr-project',
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: 'support@strata.work',
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

export function FAQPageJsonLd() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'How does the leave management system work?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Our platform streamlines the entire leave request process. Employees can submit requests through an intuitive interface, managers receive instant notifications for approval, and all leave balances are automatically tracked and updated in real-time.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can I integrate this with my existing HR tools?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes! We offer seamless integrations with popular HR platforms, payroll systems, and calendar applications. Our API allows for custom integrations to fit your specific workflow needs.',
        },
      },
      {
        '@type': 'Question',
        name: 'What kind of reports can I generate?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'You can generate comprehensive reports on leave trends, attendance patterns, team availability, and employee balances. All reports are exportable in PDF, Excel, and CSV formats with customizable date ranges and filters.',
        },
      },
      {
        '@type': 'Question',
        name: 'Is my company data secure?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Absolutely. We use bank-level encryption (SSL/TLS), regular security audits, and comply with GDPR and other data protection regulations. Your data is stored in secure, redundant data centers with automatic backups.',
        },
      },
      {
        '@type': 'Question',
        name: 'How do I get started?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: "Getting started is easy! Sign up for a free trial, add your team members, configure your leave policies, and you're ready to go. Our onboarding team will guide you through the setup process and answer any questions.",
        },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
