'use client';

import { useTranslation } from 'react-i18next';
import { useNow } from '@/hooks/useNow';
import { Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Award } from 'lucide-react';

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
      {certificates.map((cert) => {
        const isExpired = cert.expiresAt && cert.expiresAt < now;
        return (
          <Card key={cert._id} className="hover:shadow-lg transition-shadow">
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Award className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">{cert.courseTitle}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('learning.certificateId', 'Certificate ID')}:{' '}
                    <code className="text-xs">{cert.certificateId}</code>
                  </p>
                </div>
                <div className="flex items-center justify-center gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">{t('learning.issuedOn', 'Issued On')}</p>
                    <p className="font-medium">{new Date(cert.issuedAt).toLocaleDateString()}</p>
                  </div>
                  {cert.expiresAt && (
                    <div>
                      <p className="text-muted-foreground">
                        {t('learning.expiresOn', 'Expires On')}
                      </p>
                      <p className={`font-medium ${isExpired ? 'text-destructive' : ''}`}>
                        {new Date(cert.expiresAt).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </div>
                <Badge variant={isExpired ? 'destructive' : 'default'} className="w-fit mx-auto">
                  {isExpired ? t('learning.expired', 'Expired') : t('learning.valid', 'Valid')}
                </Badge>
                <div className="flex items-center justify-center gap-2">
                  <Button variant="outline" size="sm">
                    {t('learning.viewCertificate', 'View Certificate')}
                  </Button>
                  <Button size="sm">{t('learning.downloadCertificate', 'Download')}</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
