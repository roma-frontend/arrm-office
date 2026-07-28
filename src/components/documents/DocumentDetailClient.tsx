'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Calendar,
  Clock,
  User,
  FileText,
  CheckCircle,
  XCircle,
  AlertCircle,
  Trash2,
  Pencil,
  Download,
  Eye,
  Tag,
  Building2,
  AlertTriangle,
} from 'lucide-react';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';

const CategoryBadge = ({ category }: { category: string }) => {
  const { t } = useTranslation();
  return <Badge variant="outline">{t(`documentCategories.${category}`, category)}</Badge>;
};

export default function DocumentDetailClient() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const { t, i18n } = useTranslation();
  const documentId = params.id as Id<'documents'>;

  const dateLocale = i18n.language === 'ru' ? ru : i18n.language === 'hy' ? hy : enUS;

  const document = useQuery(api.documents.getDocumentById, { documentId });
  const currentUser = useQuery(
    api.users.queries.getUserById,
    user?.id ? { userId: user.id as Id<'users'> } : 'skip',
  );

  const [isPublishing, setIsPublishing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isViewing, setIsViewing] = useState(false);

  const updateDocument = useMutation(api.documents.updateDocument);
  const deleteDocument = useMutation(api.documents.deleteDocument);
  const recordView = useMutation(api.documents.recordDocumentView);

  const handlePublish = async () => {
    if (!currentUser || !document) return;
    setIsPublishing(true);
    try {
      await updateDocument({ documentId, isPublished: true });
      toast.success(t('documents.documentPublished'));
      router.refresh();
    } catch {
      toast.error(t('documents.publishError'));
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDelete = async () => {
    if (!currentUser) return;
    setIsDeleting(true);
    try {
      await deleteDocument({ documentId });
      toast.success(t('documents.documentDeleted'));
      router.push('/documents');
    } catch {
      toast.error(t('documents.deleteError'));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleView = async () => {
    if (!currentUser || !document) return;
    setIsViewing(true);
    try {
      await recordView({
        organizationId: document.organizationId,
        documentId,
      });
      window.open(document.fileUrl, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error(t('documents.viewError'));
    } finally {
      setIsViewing(false);
    }
  };

  if (!document) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const fileSize = document.fileSize
    ? `${(document.fileSize / 1024).toFixed(1)} KB`
    : 'Unknown size';
  const isExpired = document.expiresAt && new Date(document.expiresAt) < new Date();
  const daysUntilExpiry = document.expiresAt
    ? Math.ceil((new Date(document.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/documents')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{document.title}</h1>
            <p className="text-muted-foreground">
              {t('documents.uploadedBy', { name: document.uploaderName })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!document.isPublished && currentUser?.role === 'admin' && (
            <Button variant="default" onClick={handlePublish} disabled={isPublishing}>
              <CheckCircle className="mr-2 h-4 w-4" />
              {isPublishing ? t('common.saving') : t('documents.publish')}
            </Button>
          )}
          <Button variant="outline" onClick={handleView} disabled={isViewing}>
            <Eye className="mr-2 h-4 w-4" />
            {t('documents.view')}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push(`/documents/${documentId}/edit`)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleDelete} disabled={isDeleting}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {t('documents.documentDetails')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('documents.category')}</span>
              <CategoryBadge category={document.category} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('documents.status')}</span>
              <Badge variant={document.isPublished ? 'default' : 'secondary'}>
                {document.isPublished ? t('documents.published') : t('documents.draft')}
              </Badge>
            </div>
            {document.isMandatory && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('documents.mandatory')}</span>
                <Badge variant="destructive">{t('documents.mandatoryDocument')}</Badge>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('documents.fileSize')}</span>
              <span className="font-medium">{fileSize}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('documents.fileType')}</span>
              <span className="font-medium">{document.mimeType || 'Unknown'}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {t('documents.timeline')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('documents.uploaded')}</span>
              <span className="font-medium">
                {format(new Date(document.createdAt), 'dd MMM yyyy', { locale: dateLocale })}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('documents.lastUpdated')}</span>
              <span className="font-medium">
                {format(new Date(document.updatedAt), 'dd MMM yyyy', { locale: dateLocale })}
              </span>
            </div>
            {document.expiresAt && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('documents.expires')}</span>
                <span className={`font-medium ${isExpired ? 'text-red-500' : ''}`}>
                  {format(new Date(document.expiresAt), 'dd MMM yyyy', { locale: dateLocale })}
                  {isExpired && ` (${t('documents.expired')})`}
                </span>
              </div>
            )}
            {daysUntilExpiry !== null && !isExpired && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {t('documents.daysUntilExpiry')}
                </span>
                <span className="font-medium">
                  {daysUntilExpiry} {t('documents.days')}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {document.description && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {t('documents.description')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{document.description}</p>
          </CardContent>
        </Card>
      )}

      {document.tags && document.tags.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              {t('documents.tags')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {document.tags.map((tag: string, index: number) => (
                <Badge key={index} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isExpired && (
        <Card className="border-red-200 dark:border-red-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" />
              {t('documents.expiredDocument')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{t('documents.expiredDocumentDescription')}</p>
          </CardContent>
        </Card>
      )}

      {document.isMandatory && (
        <Card className="border-yellow-200 dark:border-yellow-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
              <AlertTriangle className="h-5 w-5" />
              {t('documents.mandatoryDocument')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{t('documents.mandatoryDocumentDescription')}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
