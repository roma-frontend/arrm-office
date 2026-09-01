'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/useAuthStore';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FileText,
  Upload,
  Eye,
  BarChart3,
  FolderOpen,
  CheckCircle,
  Clock,
  Plus,
  Trash2,
  PenTool,
  Languages,
  FileSignature,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import DocumentUploadWizard from '@/components/documents/DocumentUploadWizard';
import DocumentTemplateUseWizard from '@/components/documents/DocumentTemplateUseWizard';
import DocumentTemplateWizard from '@/components/documents/DocumentTemplateWizard';
import DocumentBuilderTab from '@/components/documents/DocumentBuilderTab';
import IssuedDocumentsTab from '@/components/documents/IssuedDocumentsTab';
import MyIssuedDocuments from '@/components/documents/MyIssuedDocuments';
import { Badge } from '@/components/ui/badge';
import { useDraftResume } from '@/hooks/useDraftResume';
import { DraftResumeBar } from '@/components/ui/DraftResumeBar';
type DocumentWithUploader = {
  _id: Id<'documents'>;
  _creationTime: number;
  organizationId: Id<'organizations'>;
  title: string;
  description?: string;
  category: 'policy' | 'contract' | 'report' | 'template' | 'form' | 'certificate' | 'other';
  fileUrl: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  uploadedBy: Id<'users'>;
  isPublished?: boolean;
  isMandatory?: boolean;
  expiresAt?: number;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
  uploaderName: string;
};

type _DocumentView = {
  _id: Id<'documentViews'>;
  _creationTime: number;
  organizationId: Id<'organizations'>;
  documentId: Id<'documents'>;
  userId: Id<'users'>;
  viewedAt: number;
  acknowledged?: boolean;
};

export default function DocumentsClient() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuthStore();
  const selectedOrgId = useSelectedOrganization();
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const effectiveOrgId = selectedOrgId ?? user?.organizationId;

  // Employees land on their issued documents — the library is staff-only.
  const [activeTab, setActiveTab] = useState(isAdmin ? 'all' : 'my');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showUploadWizard, setShowUploadWizard] = useState(false);
  const [showTemplateWizard, setShowTemplateWizard] = useState(false);
  const uploadDraft = useDraftResume('document-upload', !showUploadWizard);
  const templateDraft = useDraftResume('document-template', !showTemplateWizard);
  const [_selectedDocument, setSelectedDocument] = useState<DocumentWithUploader | null>(null);
  const [createDocFromTemplate, setCreateDocFromTemplate] =
    useState<Id<'documentTemplates'> | null>(null);

  // Fetch data
  const documents = useQuery(
    api.documents.listDocuments,
    effectiveOrgId && user?.id
      ? {
          organizationId: effectiveOrgId as Id<'organizations'>,
          category: categoryFilter !== 'all' ? categoryFilter : undefined,
          search: searchQuery || undefined,
          includeUnpublished: isAdmin,
        }
      : 'skip',
  );

  const templates = useQuery(
    api.signatures.listTemplates,
    effectiveOrgId ? { organizationId: effectiveOrgId as Id<'organizations'> } : 'skip',
  );

  const deleteTemplateMutation = useMutation(api.signatures.deleteTemplate);

  const myViews = useQuery(
    api.documents.getMyDocumentViews,
    effectiveOrgId && user?.id
      ? {
          organizationId: effectiveOrgId as Id<'organizations'>,
        }
      : 'skip',
  );

  const teamOverview = useQuery(
    api.documents.getTeamDocumentOverview,
    effectiveOrgId && user?.id && isAdmin
      ? {
          organizationId: effectiveOrgId as Id<'organizations'>,
        }
      : 'skip',
  );

  const _categories = useQuery(
    api.documents.getDocumentCategories,
    effectiveOrgId && user?.id
      ? {
          organizationId: effectiveOrgId as Id<'organizations'>,
        }
      : 'skip',
  );

  // Mutations
  const updateDocumentMutation = useMutation(api.documents.updateDocument);
  const deleteDocumentMutation = useMutation(api.documents.deleteDocument);
  const recordViewMutation = useMutation(api.documents.recordDocumentView);

  const handleWizardSuccess = () => {
    setShowUploadWizard(false);
  };

  const handleViewDocument = async (doc: DocumentWithUploader) => {
    if (!effectiveOrgId || !user?.id) return;

    try {
      await recordViewMutation({
        organizationId: effectiveOrgId as Id<'organizations'>,
        documentId: doc._id,
      });
      setSelectedDocument(doc);
      window.open(doc.fileUrl, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error(t('documents.viewError', 'Failed to record document view'));
    }
  };

  const handleDeleteDocument = async (documentId: Id<'documents'>) => {
    if (!user?.id) return;

    try {
      await deleteDocumentMutation({
        documentId,
      });

      toast.success(t('documents.documentDeleted', 'Document deleted successfully'));
    } catch {
      toast.error(t('documents.deleteError', 'Failed to delete document'));
    }
  };

  const handlePublishDocument = async (documentId: Id<'documents'>) => {
    if (!user?.id) return;

    try {
      await updateDocumentMutation({
        documentId,
        isPublished: true,
      });

      toast.success(t('documents.documentPublished', 'Document published successfully'));
    } catch {
      toast.error(t('documents.publishError', 'Failed to publish document'));
    }
  };

  const _isViewed = (documentId: Id<'documents'>) => {
    return myViews?.some((v) => v.documentId === documentId);
  };

  const isAcknowledged = (documentId: Id<'documents'>) => {
    return myViews?.some((v) => v.documentId === documentId && v.acknowledged);
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString();
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'policy':
        return <FileText className="h-5 w-5 text-(--brand-text)" />;
      case 'contract':
        return <FileText className="h-5 w-5 text-(--success-text)" />;
      case 'report':
        return <BarChart3 className="h-5 w-5 text-(--purple-text)" />;
      case 'template':
        return <FolderOpen className="h-5 w-5 text-(--warning-text)" />;
      case 'form':
        return <FileText className="h-5 w-5 text-(--cyan-text)" />;
      case 'certificate':
        return <CheckCircle className="h-5 w-5 text-(--warning-text)" />;
      default:
        return <FileText className="h-5 w-5 text-(--text-3)" />;
    }
  };

  // Loading state
  if (documents === undefined) {
    return (
      <div className="flex items-center justify-center h-96">
        <ShieldLoader message={t('documents.loading', 'Loading documents...')} />
      </div>
    );
  }

  const handleTemplateSuccess = () => {
    setShowTemplateWizard(false);
  };

  const handleDeleteTemplate = async (templateId: Id<'documentTemplates'>) => {
    try {
      await deleteTemplateMutation({ templateId });
      toast.success(t('documents.templateDeleted', 'Template deleted successfully'));
    } catch {
      toast.error(t('documents.templateDeleteError', 'Failed to delete template'));
    }
  };

  const handleCreateDocFromTemplate = (templateId: Id<'documentTemplates'>) => {
    setCreateDocFromTemplate(templateId);
  };

  // Filter documents by tab
  const filteredDocuments = documents.filter((doc) => {
    if (activeTab === 'mandatory') return doc.isMandatory;
    if (activeTab === 'unpublished') return !doc.isPublished;
    return true;
  });

  return (
    <div className="mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-(--text-primary)">
              {t('documents.title', 'Document Management')}
            </h2>
            <p className="text-(--text-muted) text-sm mt-1">
              {t('documents.subtitle', 'Manage and organize your organization documents')}
            </p>
          </div>
          {isAdmin && (
            <Button onClick={() => setShowUploadWizard(true)}>
              <Upload className="h-4 w-4 mr-2" />
              {t('documents.uploadDocument', 'Upload Document')}
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      {isAdmin && teamOverview && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="glass-panel shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{teamOverview.totalDocuments}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('documents.totalDocuments', 'Total Documents')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-panel shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{teamOverview.publishedDocuments}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('documents.publishedDocuments', 'Published Documents')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-panel shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Eye className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{teamOverview.totalViews}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('documents.totalViews', 'Total Views')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-panel shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{teamOverview.acknowledgmentRate}%</p>
                  <p className="text-sm text-muted-foreground">
                    {t('documents.acknowledgmentRate', 'Acknowledgment Rate')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search and Filter Bar — only the file tabs are searchable this way;
          the builder and the registry carry their own filters. */}
      {activeTab !== 'builder' && activeTab !== 'issued' && (
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1">
            <input
              type="text"
              placeholder={t('documents.searchDocuments', 'Search documents...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="w-full sm:w-48">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full grid grid-cols-2 md:grid-cols-3 px-4 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">{t('documents.allCategories', 'All Categories')}</option>
              <option value="policy">{t('documents.categoryPolicy', 'Policy')}</option>
              <option value="contract">{t('documents.categoryContract', 'Contract')}</option>
              <option value="report">{t('documents.categoryReport', 'Report')}</option>
              <option value="template">{t('documents.categoryTemplate', 'Template')}</option>
              <option value="form">{t('documents.categoryForm', 'Form')}</option>
              <option value="certificate">
                {t('documents.categoryCertificate', 'Certificate')}
              </option>
              <option value="other">{t('documents.categoryOther', 'Other')}</option>
            </select>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList
          className={`w-full mb-4 gap-2 bg-transparent p-0 h-auto ${isAdmin ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6' : 'grid grid-cols-2 md:grid-cols-3'}`}
        >
          {isAdmin && (
            <TabsTrigger
              value="all"
              className="w-full px-4 py-2.5 rounded-xl data-[state=active]:bg-(--brand) data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center gap-2"
            >
              <FileText className="h-4 w-4" />
              {t('documents.allDocuments', 'All Documents')}
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger
              value="mandatory"
              className="w-full px-4 py-2.5 rounded-xl data-[state=active]:bg-(--brand) data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center gap-2"
            >
              <CheckCircle className="h-4 w-4" />
              {t('documents.mandatoryDocuments', 'Mandatory')}
            </TabsTrigger>
          )}
          {!isAdmin && (
            <TabsTrigger
              value="my"
              className="w-full px-4 py-2.5 rounded-xl data-[state=active]:bg-(--brand) data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center gap-2"
            >
              <FileSignature className="h-4 w-4" />
              {t('documents.myDocuments', 'My Documents')}
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger
              value="unpublished"
              className="w-full px-4 py-2.5 rounded-xl data-[state=active]:bg-(--brand) data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center gap-2"
            >
              <Clock className="h-4 w-4" />
              {t('documents.unpublishedDocuments', 'Unpublished')}
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger
              value="builder"
              className="w-full px-4 py-2.5 rounded-xl data-[state=active]:bg-(--brand) data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center gap-2"
            >
              <Languages className="h-4 w-4" />
              {t('documents.builderTab', 'Bilingual templates')}
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger
              value="issued"
              className="w-full px-4 py-2.5 rounded-xl data-[state=active]:bg-(--brand) data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center gap-2"
            >
              <FileSignature className="h-4 w-4" />
              {t('documents.issuedTab', 'Issued')}
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger
              value="templates"
              className="w-full px-4 py-2.5 rounded-xl data-[state=active]:bg-(--brand) data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center gap-2"
            >
              <FolderOpen className="h-4 w-4" />
              {t('documents.templates', 'Templates')}
            </TabsTrigger>
          )}
        </TabsList>

        {/* ── My issued documents (employee view) ───────────────── */}
        {!isAdmin && (
          <TabsContent value="my" className="space-y-4">
            <MyIssuedDocuments />
          </TabsContent>
        )}

        {/* ── Bilingual template builder ───────────────────────── */}
        {isAdmin && effectiveOrgId && (
          <TabsContent value="builder" className="space-y-4">
            <DocumentBuilderTab organizationId={effectiveOrgId as Id<'organizations'>} />
          </TabsContent>
        )}

        {/* ── Issued documents registry ────────────────────────── */}
        {isAdmin && effectiveOrgId && (
          <TabsContent value="issued" className="space-y-4">
            <IssuedDocumentsTab organizationId={effectiveOrgId as Id<'organizations'>} />
          </TabsContent>
        )}

        {/* Documents List (staff library — employees see My Documents above) */}
        <TabsContent
          value={
            activeTab === 'templates' ? 'templates' : activeTab === 'my' ? 'my-library' : activeTab
          }
          className="space-y-4"
        >
          {activeTab === 'builder' || activeTab === 'issued' ? null : activeTab === 'templates' ? (
            <div>
              {/* Templates header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-semibold">
                    {t('documents.documentTemplates', 'Document Templates')}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('documents.templatesDesc', 'Reusable templates for document signing')}
                  </p>
                </div>
                {isAdmin && (
                  <Button onClick={() => setShowTemplateWizard(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    {t('documents.createTemplate', 'Create Template')}
                  </Button>
                )}
              </div>

              {/* Templates list */}
              {templates === undefined ? (
                <div className="flex items-center justify-center py-12">
                  <ShieldLoader message={t('documents.loadingTemplates', 'Loading templates...')} />
                </div>
              ) : templates.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <FolderOpen className="h-12 w-12 text-muted-foreground/40 mb-3" />
                    <p className="text-muted-foreground">
                      {t('documents.noTemplates', 'No templates available')}
                    </p>
                    {isAdmin && (
                      <Button
                        variant="outline"
                        className="mt-3"
                        onClick={() => setShowTemplateWizard(true)}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        {t('documents.createFirstTemplate', 'Create your first template')}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {templates.map((template) => (
                    <Card
                      key={template._id}
                      className="glass-panel shadow-sm hover:shadow-md hover:-translate-y-0.5"
                      style={{ transition: 'all 0.3s cubic-bezier(0.22, 1, 0.36, 1)' }}
                    >
                      <CardContent className="pt-6">
                        <div className="flex items-start gap-3">
                          <PenTool className="h-5 w-5 text-(--purple-text) shrink-0" />
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold truncate">{template.title}</h3>
                            {template.description && (
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                {template.description}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-2">
                              <Badge variant="secondary" className="text-xs">
                                {t(
                                  `documents.template${template.category.charAt(0).toUpperCase() + template.category.slice(1)}`,
                                  template.category,
                                )}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {template.fields.length} {t('documents.fields', 'fields')}
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-4">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCreateDocFromTemplate(template._id)}
                            className="flex-1"
                          >
                            <FileText className="h-4 w-4 mr-1" />
                            {t('documents.useTemplate', 'Use Template')}
                          </Button>
                          {isAdmin && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDeleteTemplate(template._id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          ) : filteredDocuments.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold">
                  {t('documents.noDocuments', 'No documents available')}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('documents.noDocumentsDesc', 'Check back later or contact your admin')}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDocuments.map((doc) => (
                <Card
                  key={doc._id}
                  className="glass-panel shadow-sm hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
                  style={{ transition: 'all 0.3s cubic-bezier(0.22, 1, 0.36, 1)' }}
                  onClick={() => router.push(`/documents/${doc._id}`)}
                >
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-3">
                      {getCategoryIcon(doc.category)}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">{doc.title}</h3>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {doc.description ||
                            t('documents.noDescription', 'No description available')}
                        </p>
                        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                          <span>{doc.uploaderName}</span>
                          <span>{formatDate(doc.createdAt)}</span>
                          {doc.fileSize && <span>{formatFileSize(doc.fileSize)}</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-3">
                          {doc.isMandatory && (
                            <span className="px-2 py-0.5 rounded-full bg-(--danger-quiet) text-(--danger-text) text-xs font-medium">
                              {t('documents.mandatory', 'Mandatory')}
                            </span>
                          )}
                          {!doc.isPublished && (
                            <span className="px-2 py-0.5 rounded-full bg-(--warning-quiet) text-(--warning-text) text-xs font-medium">
                              {t('documents.unpublished', 'Unpublished')}
                            </span>
                          )}
                          {isAcknowledged(doc._id) && (
                            <span className="px-2 py-0.5 rounded-full bg-(--success-quiet) text-(--success-text) text-xs font-medium">
                              {t('documents.acknowledged', 'Acknowledged')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewDocument(doc);
                        }}
                        className="flex-1"
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        {t('documents.view', 'View')}
                      </Button>
                      {isAdmin && !doc.isPublished && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePublishDocument(doc._id);
                          }}
                        >
                          {t('documents.publish', 'Publish')}
                        </Button>
                      )}
                      {isAdmin && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteDocument(doc._id);
                          }}
                        >
                          {t('common.delete', 'Delete')}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Upload Wizard */}
      {showUploadWizard && (
        <DocumentUploadWizard
          onClose={() => {
            setShowUploadWizard(false);
          }}
          onSuccess={handleWizardSuccess}
        />
      )}

      {/* Use Template Wizard */}
      {createDocFromTemplate && (
        <DocumentTemplateUseWizard
          open={!!createDocFromTemplate}
          onClose={() => setCreateDocFromTemplate(null)}
          onSuccess={handleWizardSuccess}
          templateId={createDocFromTemplate}
        />
      )}

      {/* Template Wizard */}
      {showTemplateWizard && (
        <DocumentTemplateWizard
          open={showTemplateWizard}
          onClose={() => setShowTemplateWizard(false)}
          onSuccess={handleTemplateSuccess}
        />
      )}

      {/* "Draft saved. Restore?" — one bar at a time; the upload wizard is the
          longer form, so its draft wins over the template one. */}
      <DraftResumeBar
        show={uploadDraft.available}
        label={t('documents.uploadTitle', 'Upload Document')}
        step={uploadDraft.step}
        onResume={() => {
          uploadDraft.dismiss();
          setShowUploadWizard(true);
        }}
        onDismiss={uploadDraft.dismiss}
        onDiscard={uploadDraft.discard}
      />
      <DraftResumeBar
        show={!uploadDraft.available && templateDraft.available}
        label={t('documents.templateTitle', 'Document Template')}
        step={templateDraft.step}
        onResume={() => {
          templateDraft.dismiss();
          setShowTemplateWizard(true);
        }}
        onDismiss={templateDraft.dismiss}
        onDiscard={templateDraft.discard}
      />
    </div>
  );
}
