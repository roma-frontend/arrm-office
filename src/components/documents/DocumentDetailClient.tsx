'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetBody,
  SheetFooter,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Calendar,
  FileText,
  CheckCircle,
  Trash2,
  Pencil,
  Eye,
  Tag,
  AlertTriangle,
} from 'lucide-react';
import { format } from 'date-fns';
import { enUS, ru, hy, de } from 'date-fns/locale';

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

  // German was missing here even though the app ships a `de` locale, so German
  // users saw English dates on this page only.
  const dateLocale =
    i18n.language === 'ru' ? ru : i18n.language === 'hy' ? hy : i18n.language === 'de' ? de : enUS;

  const document = useQuery(api.documents.getDocumentById, { documentId });
  const currentUser = useQuery(
    api.users.queries.getUserById,
    user?.id ? { userId: user.id as Id<'users'> } : 'skip',
  );

  const [isPublishing, setIsPublishing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isViewing, setIsViewing] = useState(false);
  const [isAcknowledging, setIsAcknowledging] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const updateDocument = useMutation(api.documents.updateDocument);
  const deleteDocument = useMutation(api.documents.deleteDocument);
  const recordView = useMutation(api.documents.recordDocumentView);

  // Own read/acknowledgement state, so the button reflects reality after reload.
  const myViews = useQuery(
    api.documents.getMyDocumentViews,
    document ? { organizationId: document.organizationId } : 'skip',
  );
  const myView = myViews?.find((view) => view.documentId === documentId);
  const acknowledged = !!myView?.acknowledged;

  /**
   * Confirm the employee has read the document.
   *
   * The flag, the badge in the list and the server-side acknowledgement rate all
   * existed already — nothing ever set it, because no screen offered the action.
   */
  const handleAcknowledge = async () => {
    if (!document) return;
    setIsAcknowledging(true);
    try {
      await recordView({
        organizationId: document.organizationId,
        documentId,
        acknowledged: true,
      });
      toast.success(t('documents.acknowledged', 'Marked as read'));
    } catch {
      toast.error(t('documents.acknowledgeError', 'Could not confirm reading'));
    } finally {
      setIsAcknowledging(false);
    }
  };

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
    // Open the file immediately while still inside the user-gesture call
    // stack — calling window.open *after* an await lets the browser's
    // popup blocker kill it in production.
    const popup = window.open(document.fileUrl, '_blank', 'noopener,noreferrer');
    if (!popup) {
      // Popup was blocked — fall back to same-tab navigation.
      window.location.href = document.fileUrl;
      toast.info(t('documents.popupBlocked', 'Document opened in the current tab — allow popups for this site to open in a new tab'));
      return;
    }
    setIsViewing(true);
    try {
      await recordView({
        organizationId: document.organizationId,
        documentId,
      });
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
          {!document.isPublished && document.canManage && (
            <Button variant="default" onClick={handlePublish} disabled={isPublishing}>
              <CheckCircle className="mr-2 h-4 w-4" />
              {isPublishing ? t('common.saving') : t('documents.publish')}
            </Button>
          )}
          <Button variant="outline" onClick={handleView} disabled={isViewing}>
            <Eye className="mr-2 h-4 w-4" />
            {t('documents.view')}
          </Button>
          {/* Mandatory documents ask for an explicit confirmation of reading. */}
          {document.isMandatory && (
            <Button
              variant={acknowledged ? 'ghost' : 'default'}
              onClick={handleAcknowledge}
              disabled={isAcknowledging || acknowledged}
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              {acknowledged
                ? t('documents.acknowledgedBadge', 'Read')
                : t('documents.acknowledge', 'I have read this')}
            </Button>
          )}
          {document.canManage && (
            <>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setEditOpen(true)}
                title={t('documents.edit', 'Edit')}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={handleDelete} disabled={isDeleting}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
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
                <span className={`font-medium ${isExpired ? 'text-(--danger-text)' : ''}`}>
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
        <Card className="border-(--danger-outline) dark:border-(--danger-outline)">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-(--danger-text) dark:text-(--danger-text)">
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
        <Card className="border-(--warning-outline) dark:border-(--warning-outline)">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-(--warning-text) dark:text-(--warning-text)">
              <AlertTriangle className="h-5 w-5" />
              {t('documents.mandatoryDocument')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{t('documents.mandatoryDocumentDescription')}</p>
          </CardContent>
        </Card>
      )}

      {/* Edit dialog — replaces the button that used to navigate to a
          `/documents/[id]/edit` route that was never built. */}
      {document.canManage && (
        <DocumentEditDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          document={document}
          onSave={async (patch) => {
            await updateDocument({ documentId, ...patch });
            toast.success(t('documents.documentUpdated', 'Document updated'));
            setEditOpen(false);
          }}
        />
      )}
    </div>
  );
}

type EditableFields = {
  title: string;
  description?: string;
  category: DocumentCategoryValue;
  isMandatory: boolean;
  expiresAt?: number;
};

type DocumentCategoryValue =
  | 'policy'
  | 'contract'
  | 'report'
  | 'template'
  | 'form'
  | 'certificate'
  | 'other';

const CATEGORY_VALUES: DocumentCategoryValue[] = [
  'policy',
  'contract',
  'report',
  'template',
  'form',
  'certificate',
  'other',
];

/** Minimal metadata editor: the fields worth changing after upload. */
function DocumentEditDialog({
  open,
  onOpenChange,
  document,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: {
    title: string;
    description?: string;
    category: string;
    isMandatory?: boolean;
    expiresAt?: number;
  };
  onSave: (patch: EditableFields) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(document.title);
  const [description, setDescription] = useState(document.description ?? '');
  const [category, setCategory] = useState<DocumentCategoryValue>(
    (CATEGORY_VALUES as string[]).includes(document.category)
      ? (document.category as DocumentCategoryValue)
      : 'other',
  );
  const [isMandatory, setIsMandatory] = useState(!!document.isMandatory);
  const [expiresAt, setExpiresAt] = useState(
    document.expiresAt ? new Date(document.expiresAt).toISOString().slice(0, 10) : '',
  );
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || undefined,
        category,
        isMandatory,
        expiresAt: expiresAt ? new Date(expiresAt).getTime() : undefined,
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('documents.updateError', 'Could not save'),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="sm" closeLabel={t('common.close', 'Close')}>
        <SheetHeader>
          <SheetTitle>{t('documents.editDocument', 'Edit document')}</SheetTitle>
        </SheetHeader>
        <SheetBody className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="doc-title" className="text-xs font-medium text-muted-foreground">
              {t('documents.documentTitle', 'Title')}
            </label>
            <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="doc-desc" className="text-xs font-medium text-muted-foreground">
              {t('documents.description', 'Description')}
            </label>
            <Input
              id="doc-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="doc-category" className="text-xs font-medium text-muted-foreground">
                {t('documents.category', 'Category')}
              </label>
              <select
                id="doc-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as DocumentCategoryValue)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                {CATEGORY_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {t(`documentCategories.${value}`, value)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="doc-expires" className="text-xs font-medium text-muted-foreground">
                {t('documents.expiresAt', 'Expires on')}
              </label>
              <Input
                id="doc-expires"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={isMandatory}
              onChange={(e) => setIsMandatory(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            {t('documents.mandatoryDocument', 'Mandatory document')}
          </label>
        </SheetBody>
        <SheetFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={saving || !title.trim()}>
            {saving ? t('common.saving', 'Saving…') : t('common.save', 'Save')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
