'use client';

/**
 * Wizard for using a document template to create a document.
 *
 * Steps:
 *   1. Select an employee (for token resolution)
 *   2. Fill in template fields
 *   3. Preview resolved content and create
 */

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { useShallow } from 'zustand/shallow';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
} from '@/components/ui/sheet';
import { WizardStepper } from '@/components/ui/wizard-stepper';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { FileText, ChevronLeft, ChevronRight, CheckCircle, User, Pen } from 'lucide-react';
import { toast } from 'sonner';
import { uploadDocument } from '@/actions/cloudinary';
import { resolveTokens, type MergeSourceData } from '@/lib/documentTokens';
import {
  renderDocumentPdfBase64,
  type RenderableDocument,
  type DocumentLabels,
} from '@/lib/exportDocument';
import { logger } from '@/lib/logger';

interface DocumentTemplateUseWizardProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  templateId: Id<'documentTemplates'>;
}

export default function DocumentTemplateUseWizard({
  open,
  onClose,
  onSuccess,
  templateId,
}: DocumentTemplateUseWizardProps) {
  const { t } = useTranslation();
  const user = useAuthStore(useShallow((s) => s.user));
  const selectedOrgId = useSelectedOrganization();

  const [currentStep, setCurrentStep] = useState(0);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [isMandatory, setIsMandatory] = useState(false);
  const [publishImmediately, setPublishImmediately] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch template data
  const templateData = useQuery(api.signatures.getTemplate, templateId ? { templateId } : 'skip');

  // Fetch employees for the selector
  const employees = useQuery(
    api.users.getUsersByOrganizationId,
    selectedOrgId ? { organizationId: selectedOrgId as Id<'organizations'> } : 'skip',
  );

  // Fetch employee merge data for token resolution
  const mergeData = useQuery(
    api.documentLibrary.getEmployeeMergeData,
    selectedEmployeeId ? { userId: selectedEmployeeId as Id<'users'> } : 'skip',
  );

  // Mutations
  const createDocumentMutation = useMutation(api.documents.createDocument);
  const updateDocumentMutation = useMutation(api.documents.updateDocument);

  // Build merge source for token resolution
  const mergeSource: MergeSourceData | null = useMemo(() => {
    if (!mergeData) return null;
    return {
      employee: mergeData.employee,
      organization: mergeData.organization,
      signatory: { name: user?.name ?? null, position: user?.position ?? null },
      now: Date.now(),
    };
  }, [mergeData, user?.name, user?.position]);

  // Resolved content with tokens replaced
  const resolvedContent = useMemo(() => {
    if (!templateData?.content || !mergeSource) return templateData?.content ?? '';
    return resolveTokens(templateData.content, mergeSource, 'en');
  }, [templateData?.content, mergeSource]);

  // Resolved title
  const resolvedTitle = useMemo(() => {
    if (!templateData?.title || !mergeSource) return templateData?.title ?? '';
    return resolveTokens(templateData.title, mergeSource, 'en');
  }, [templateData?.title, mergeSource]);

  const employeeList = useMemo(() => {
    if (!employees) return [];
    return (employees as { _id: string; name: string; role: string }[]).filter(
      (e) => e.role !== 'superadmin',
    );
  }, [employees]);

  const steps = [
    {
      id: 'employee',
      title: t('documents.selectEmployee', 'Employee'),
      icon: <User className="w-4 h-4" />,
    },
    {
      id: 'fields',
      title: t('documents.templateFields', 'Fields'),
      icon: <Pen className="w-4 h-4" />,
    },
    {
      id: 'review',
      title: t('documents.reviewStep', 'Review'),
      icon: <CheckCircle className="w-4 h-4" />,
    },
  ];

  const canGoNext = () => {
    switch (currentStep) {
      case 0:
        return !!selectedEmployeeId;
      case 1:
        return true;
      case 2:
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((p) => p + 1);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep((p) => p - 1);
  };

  const handleSubmit = async () => {
    if (!templateData || !mergeSource || !selectedOrgId || !user?.id) return;

    setIsSubmitting(true);
    try {
      // Build renderable document for PDF generation
      const labels: DocumentLabels = {
        signature: t('docLibrary.signature', 'Signature'),
        name: t('docLibrary.nameLabel', 'Name'),
        position: t('docLibrary.positionLabel', 'Position'),
        date: t('docLibrary.dateLabel', 'Date'),
        generatedOn: t('docLibrary.generatedOn', 'Generated on'),
        integrity: t('docLibrary.integrity', 'Integrity'),
      };

      const renderable: RenderableDocument = {
        title: resolvedTitle,
        body: resolvedContent,
        // Templates carry no accent of their own (only sent documents do), so
        // the default theme applies — this read was always 'blue' in practice.
        accent: 'blue',
        signature: false,
        orgName: mergeSource.organization.name ?? '',
        now: Date.now(),
        labels,
      };

      // Yield to browser before heavy PDF render so loading spinner appears
      await new Promise((r) => setTimeout(r, 50));
      const pdfBase64 = await renderDocumentPdfBase64(renderable);

      // Upload PDF to Cloudinary
      const result = await uploadDocument(
        pdfBase64,
        `${resolvedTitle.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
        'application/pdf',
      );

      // Create the document
      const docId = await createDocumentMutation({
        organizationId: selectedOrgId as Id<'organizations'>,
        title: resolvedTitle,
        description: templateData.description || undefined,
        category: 'other',
        fileUrl: result.url,
        fileName: result.name,
        fileSize: result.size,
        mimeType: result.type,
        isMandatory,
        tags: [`template:${templateData._id}`],
      });

      // Publish immediately if selected
      if (publishImmediately && docId) {
        await updateDocumentMutation({
          documentId: docId,
          isPublished: true,
        });
      }

      toast.success(t('documents.documentCreated', 'Document created successfully'));
      onSuccess?.();
      onClose();
    } catch (error) {
      logger.error('Create document from template error:', error);
      toast.error(t('documents.createFailed', 'Failed to create document'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" size="lg" closeLabel={t('common.close', 'Close')} className="p-0">
        <SheetHeader className="gap-3.5">
          <SheetTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t('documents.useTemplate', 'Use Template')}
          </SheetTitle>
          <p className="text-label text-(--text-muted)">
            {t('documents.useTemplateDesc', 'Fill in the template fields and create a document')}
          </p>
          <WizardStepper
            steps={steps.map((s) => ({ id: s.id, title: s.title }))}
            current={currentStep}
            labels="auto"
            onStepClick={(i) => {
              if (i < currentStep) setCurrentStep(i);
            }}
          />
        </SheetHeader>

        <SheetBody className="px-5 py-5">
          {/* Step 1: Select Employee */}
          {currentStep === 0 && (
            <div className="space-y-4">
              <div>
                <Label>{t('documents.selectEmployee', 'Select Employee')} *</Label>
                <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t(
                        'documents.selectEmployeePlaceholder',
                        'Choose an employee for this document',
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {employeeList.map((emp) => (
                      <SelectItem key={emp._id} value={emp._id}>
                        {emp.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedEmployeeId && mergeSource && (
                <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase">
                    {t('documents.resolvedData', 'Resolved Employee Data')}
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">{t('documents.name', 'Name')}:</span>{' '}
                      {mergeSource.employee.name || '—'}
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        {t('documents.department', 'Department')}:
                      </span>{' '}
                      {mergeSource.employee.department || '—'}
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        {t('documents.position', 'Position')}:
                      </span>{' '}
                      {mergeSource.employee.position || '—'}
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        {t('documents.email', 'Email')}:
                      </span>{' '}
                      {mergeSource.employee.email || '—'}
                    </div>
                  </div>
                </div>
              )}

              {templateData && (
                <div className="bg-muted/20 rounded-lg p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    {t('documents.templateContent', 'Template Content')}
                  </p>
                  <p className="text-xs whitespace-pre-wrap line-clamp-6">{templateData.content}</p>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Fill Template Fields */}
          {currentStep === 1 && (
            <div className="space-y-4">
              {templateData?.fields && templateData.fields.length > 0 ? (
                templateData.fields.map(
                  (field: {
                    id: string;
                    label: string;
                    type: string;
                    required: boolean;
                    placeholder?: string;
                  }) => (
                    <div key={field.id} className="space-y-1">
                      <Label className="text-sm">
                        {field.label}
                        {field.required && <span className="text-destructive ml-1">*</span>}
                      </Label>
                      {field.type === 'text' && (
                        <Input
                          value={fieldValues[field.id] || ''}
                          onChange={(e) =>
                            setFieldValues((prev) => ({
                              ...prev,
                              [field.id]: e.target.value,
                            }))
                          }
                          placeholder={field.placeholder || ''}
                        />
                      )}
                      {field.type === 'date' && (
                        <Input
                          type="date"
                          value={fieldValues[field.id] || ''}
                          onChange={(e) =>
                            setFieldValues((prev) => ({
                              ...prev,
                              [field.id]: e.target.value,
                            }))
                          }
                        />
                      )}
                      {field.type === 'signature' && (
                        <div className="border rounded-lg p-4 text-center text-sm text-muted-foreground">
                          <Pen className="w-6 h-6 mx-auto mb-2" />
                          {t(
                            'documents.signaturePlaceholder',
                            'Signature will be collected during signing',
                          )}
                        </div>
                      )}
                    </div>
                  ),
                )
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {t('documents.noFields', 'This template has no custom fields')}
                </p>
              )}

              <div className="flex items-center gap-2">
                <Checkbox checked={isMandatory} onCheckedChange={(c) => setIsMandatory(!!c)} />
                <Label className="text-sm">{t('documents.fieldRequired', 'Required')}</Label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  checked={publishImmediately}
                  onCheckedChange={(c) => setPublishImmediately(!!c)}
                />
                <Label className="text-sm">
                  {t('documents.publishImmediately', 'Publish immediately')}
                </Label>
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">{t('documents.title', 'Title')}</p>
                  <p className="font-medium">{resolvedTitle}</p>
                </div>
                {templateData?.description && (
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t('documents.description', 'Description')}
                    </p>
                    <p className="text-sm">{templateData.description}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t('documents.employee', 'Employee')}
                  </p>
                  <p className="text-sm">{mergeSource?.employee.name || '—'}</p>
                </div>
              </div>

              {/* Resolved content preview */}
              <div>
                <p className="text-sm font-medium mb-2">
                  {t('documents.resolvedContent', 'Resolved Content')}
                </p>
                <div className="bg-muted/20 rounded-lg p-3 max-h-60 overflow-y-auto">
                  <p className="text-xs whitespace-pre-wrap font-mono">{resolvedContent}</p>
                </div>
              </div>

              {/* Filled fields */}
              {Object.keys(fieldValues).length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">
                    {t('documents.filledFields', 'Filled Fields')}
                  </p>
                  <div className="space-y-1">
                    {Object.entries(fieldValues).map(([fieldId, value]) => {
                      const field = templateData?.fields?.find(
                        (f: { id: string }) => f.id === fieldId,
                      );
                      return (
                        <div key={fieldId} className="flex items-center gap-2 p-2 rounded border">
                          <span className="text-xs text-muted-foreground">
                            {field?.label || fieldId}:
                          </span>
                          <span className="text-sm flex-1">{value}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </SheetBody>

        <SheetFooter className="justify-between">
          <Button
            variant="ghost"
            onClick={currentStep === 0 ? onClose : handleBack}
            disabled={isSubmitting}
            size="sm"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            {currentStep === 0 ? t('common.cancel', 'Cancel') : t('common.back', 'Back')}
          </Button>
          <Button
            onClick={handleNext}
            disabled={!canGoNext() || isSubmitting}
            size="sm"
            className="gap-1"
          >
            {currentStep === steps.length - 1 ? (
              <>
                <CheckCircle className="h-4 w-4" />
                {isSubmitting
                  ? t('common.sending', 'Creating...')
                  : t('documents.createDocument', 'Create Document')}
              </>
            ) : (
              <>
                {t('common.next', 'Next')}
                <ChevronRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
