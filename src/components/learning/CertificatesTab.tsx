'use client';

import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNow } from '@/hooks/useNow';
import { useAuthStore } from '@/store/useAuthStore';
import { Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Award, Download } from 'lucide-react';
import { CertificateRenderer } from './CertificateRenderer';
import type { CustomCertificateTemplate } from './certificateTemplates';

type Certificate = {
  _id: Id<'certificates'>;
  _creationTime: number;
  organizationId: Id<'organizations'>;
  userId: Id<'users'>;
  courseId: Id<'courses'>;
  certificateId: string;
  templateId?: string;
  issuedAt: number;
  expiresAt?: number;
  courseTitle: string;
};

interface CertificatesTabProps {
  certificates: Certificate[] | undefined;
  customTemplates?: CustomCertificateTemplate[];
}

/** A styled certificate card that renders as a printable/downloadable design. */
function CertificateCard({
  cert,
  customTemplates,
}: {
  cert: Certificate;
  customTemplates?: CustomCertificateTemplate[];
}) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const cardRef = useRef<HTMLDivElement>(null);

  const handleDownload = () => {
    if (!cardRef.current) return;
    const printWindow = window.open('', '_blank', 'width=900,height=600');
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html><head><title>Certificate - ${cert.certificateId}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Playfair+Display:wght@400;600;700&display=swap" rel="stylesheet">
      <style>
        body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #0f172a; }
        @media print { body { background: white; } }
      </style></head><body>
      ${cardRef.current.outerHTML}
      <script>window.onload = () => window.print();</script>
      </body></html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-3">
      <div ref={cardRef}>
        <CertificateRenderer
          templateId={cert.templateId}
          userName={user?.name ?? 'Employee'}
          courseTitle={cert.courseTitle}
          certificateId={cert.certificateId}
          issuedAt={cert.issuedAt}
          customTemplates={customTemplates}
        />
      </div>

      <Button size="sm" variant="outline" className="w-full gap-2" onClick={handleDownload}>
        <Download className="h-4 w-4" />
        {t('learning.downloadCertificate', 'Download Certificate')}
      </Button>
    </div>
  );
}

export function CertificatesTab({ certificates, customTemplates }: CertificatesTabProps) {
  const { t } = useTranslation();
  const now = useNow();

  if (!certificates || certificates.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Award className="h-16 w-16 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">
            {t('learning.noCertificates', 'No certificates yet')}
          </h3>
          <p className="text-muted-foreground">
            {t('learning.noCertificatesDesc', 'Complete a course to earn your first certificate')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {certificates.map((cert) => (
        <CertificateCard key={cert._id} cert={cert} customTemplates={customTemplates} />
      ))}
    </div>
  );
}
