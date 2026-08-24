'use client';

import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNow } from '@/hooks/useNow';
import { useAuthStore } from '@/store/useAuthStore';
import { Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Award, Download, Share2 } from 'lucide-react';

type Certificate = {
  _id: Id<'certificates'>;
  _creationTime: number;
  organizationId: Id<'organizations'>;
  userId: Id<'users'>;
  courseId: Id<'courses'>;
  certificateId: string;
  issuedAt: number;
  expiresAt?: number;
  courseTitle: string;
};

interface CertificatesTabProps {
  certificates: Certificate[] | undefined;
}

/** A styled certificate card that renders as a printable/downloadable design. */
function CertificateCard({ cert }: { cert: Certificate }) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const cardRef = useRef<HTMLDivElement>(null);

  const handleDownload = () => {
    // Open a new window with the certificate for printing/saving as PDF
    if (!cardRef.current) return;
    const printWindow = window.open('', '_blank', 'width=900,height=600');
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html><head><title>Certificate - ${cert.certificateId}</title>
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
      {/* Certificate preview */}
      <div
        ref={cardRef}
        className="relative overflow-hidden rounded-2xl border-2 border-amber-500/30"
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
        }}
      >
        {/* Decorative border pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-2 border border-amber-400/40 rounded-xl" />
          <div className="absolute inset-4 border border-amber-400/20 rounded-lg" />
        </div>
        {/* Corner ornaments */}
        <div className="absolute top-3 left-3 w-12 h-12 border-t-2 border-l-2 border-amber-400/50 rounded-tl-lg" />
        <div className="absolute top-3 right-3 w-12 h-12 border-t-2 border-r-2 border-amber-400/50 rounded-tr-lg" />
        <div className="absolute bottom-3 left-3 w-12 h-12 border-b-2 border-l-2 border-amber-400/50 rounded-bl-lg" />
        <div className="absolute bottom-3 right-3 w-12 h-12 border-b-2 border-r-2 border-amber-400/50 rounded-br-lg" />

        <div className="relative px-8 py-10 text-center">
          {/* Header */}
          <div className="mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 mb-3 shadow-lg shadow-amber-500/30">
              <Award className="h-8 w-8 text-white" />
            </div>
            <h3 className="text-amber-400 text-xs font-semibold tracking-[0.25em] uppercase">
              {t('learning.certificateOfCompletion', 'Certificate of Completion')}
            </h3>
          </div>

          {/* Recipient */}
          <div className="mb-4">
            <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">
              {t('learning.presentedTo', 'This is to certify that')}
            </p>
            <p className="text-white text-xl font-bold">
              {user?.name ?? 'Employee'}
            </p>
          </div>

          {/* Course */}
          <div className="mb-6">
            <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">
              {t('learning.hasCompleted', 'has successfully completed')}
            </p>
            <p className="text-amber-300 text-lg font-semibold">
              {cert.courseTitle}
            </p>
          </div>

          {/* Date & ID */}
          <div className="flex items-center justify-center gap-8 text-xs">
            <div>
              <p className="text-slate-500 uppercase tracking-wider">{t('learning.issuedOn', 'Date')}</p>
              <p className="text-slate-300 font-medium mt-0.5">
                {new Date(cert.issuedAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
            <div className="w-px h-8 bg-amber-500/20" />
            <div>
              <p className="text-slate-500 uppercase tracking-wider">{t('learning.certificateId', 'ID')}</p>
              <p className="text-slate-300 font-mono text-[10px] mt-0.5">
                {cert.certificateId}
              </p>
            </div>
          </div>

          {/* Seal */}
          <div className="mt-6 flex justify-center">
            <div className="w-12 h-12 rounded-full border-2 border-amber-500/40 flex items-center justify-center">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500/20 to-amber-600/20 flex items-center justify-center">
                <span className="text-amber-400 text-[10px] font-bold">✓</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Download button */}
      <Button
        size="sm"
        variant="outline"
        className="w-full gap-2"
        onClick={handleDownload}
      >
        <Download className="h-4 w-4" />
        {t('learning.downloadCertificate', 'Download Certificate')}
      </Button>
    </div>
  );
}

export function CertificatesTab({ certificates }: CertificatesTabProps) {
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
        <CertificateCard key={cert._id} cert={cert} />
      ))}
    </div>
  );
}

