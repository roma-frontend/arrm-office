/**
 * Tests for CertificatesTab — the learning certificates grid.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => (typeof fallback === 'string' ? fallback : key),
  }),
}));

let mockNow = Date.now();
jest.mock('@/hooks/useNow', () => ({
  useNow: () => mockNow,
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: any) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
  CardContent: ({ children, className }: any) => <div className={className}>{children}</div>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, variant, size }: any) => (
    <button type="button" data-variant={variant} data-size={size}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant, className }: any) => (
    <span data-testid="badge" data-variant={variant} className={className}>
      {children}
    </span>
  ),
}));

jest.mock('lucide-react', () => ({
  Award: (props: any) => <span data-testid="icon-award" {...props} />,
  Download: (props: any) => <span data-testid="icon-download" {...props} />,
  Share2: (props: any) => <span data-testid="icon-share" {...props} />,
  CheckCircle: (props: any) => <span data-testid="icon-check" {...props} />,
}));

jest.mock('@/components/learning/CertificateRenderer', () => ({
  CertificateRenderer: ({ courseTitle, certificateId }: any) => (
    <div data-testid="cert-renderer">
      <span>{courseTitle}</span>
      <span>{certificateId}</span>
    </div>
  ),
}));

jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({
    user: { id: 'u1', name: 'John Doe', role: 'admin' },
  }),
}));

import { CertificatesTab } from '@/components/learning/CertificatesTab';

const CERT = {
  _id: 'c1',
  _creationTime: 1000,
  organizationId: 'org1',
  userId: 'u1',
  courseId: 'course1',
  certificateId: 'CERT-001',
  templateId: 'midnight-gold',
  issuedAt: 1750000000000,
  courseTitle: 'React Mastery',
} as never;

describe('CertificatesTab', () => {
  beforeEach(() => {
    mockNow = Date.now();
  });

  it('shows the empty state when certificates is undefined', () => {
    render(<CertificatesTab certificates={undefined} />);
    expect(screen.getByText('No certificates yet')).toBeInTheDocument();
    expect(
      screen.getByText('Complete a course to earn your first certificate'),
    ).toBeInTheDocument();
  });

  it('shows the empty state when the list is empty', () => {
    render(<CertificatesTab certificates={[]} />);
    expect(screen.getByText('No certificates yet')).toBeInTheDocument();
  });

  it('renders a certificate card with id and issue date', () => {
    render(<CertificatesTab certificates={[{ ...CERT }]} />);
    expect(screen.getByText('React Mastery')).toBeInTheDocument();
    expect(screen.getByText('CERT-001')).toBeInTheDocument();
    expect(screen.getByText('Download Certificate')).toBeInTheDocument();
  });

  it('renders multiple certificates', () => {
    render(
      <CertificatesTab
        certificates={[
          { ...CERT, _id: 'c1', courseTitle: 'React' },
          { ...CERT, _id: 'c2', courseTitle: 'Node', certificateId: 'CERT-002' },
        ]}
      />,
    );
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByText('Node')).toBeInTheDocument();
    expect(screen.getByText('CERT-002')).toBeInTheDocument();
  });
});
