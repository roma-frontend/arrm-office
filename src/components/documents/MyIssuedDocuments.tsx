'use client';

/**
 * My Documents — the employee-facing view of the Documents module.
 *
 * The library (policies, forms, templates) is staff-only; an employee sees
 * exactly the documents that were issued to them (sent or signed) and can
 * preview each one with the same renderer the staff registry uses.
 */
import { useState } from 'react';
import { useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { Check, FileText, FileSignature, Loader2 } from 'lucide-react';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
} from '@/components/ui/sheet';
import { DocumentPreview } from '@/components/documents/DocumentBlocksPreview';
import { useBuildIssuedDocument } from '@/components/documents/useBuildIssuedDocument';
import type { RenderableDocument } from '@/lib/exportDocument';
import type { SupportedLocale } from '@/lib/date-format';
import { toast } from 'sonner';

type MyIssuedRow = {
  _id: Id<'issuedDocuments'>;
  recipientId: Id<'users'>;
  recipientName: string;
  primaryLocale: SupportedLocale;
  secondaryLocale?: SupportedLocale;
  title: string;
  status: 'draft' | 'edited' | 'sent' | 'signed' | 'cancelled';
  bodyOverride?: string;
  documentNumber?: string;
  signatureDocumentId?: Id<'signatureDocuments'>;
  createdAt: number;
};

export default function MyIssuedDocuments() {
  const { t } = useTranslation();
  const { buildDoc, orgName } = useBuildIssuedDocument();
  const [previewDoc, setPreviewDoc] = useState<RenderableDocument | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const rows = useQuery(api.issuedDocuments.listMine) as MyIssuedRow[] | undefined;

  const handlePreview = async (row: MyIssuedRow) => {
    setBusyId(row._id);
    try {
      const doc = await buildDoc(row);
      if (!doc) {
        toast.error(t('issued.buildFailed', 'Could not build this document'));
        return;
      }
      setPreviewDoc(doc);
    } finally {
      setBusyId(null);
    }
  };

  if (rows === undefined) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold">
            {t('documents.noIssuedDocuments', 'No documents yet')}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {t('documents.noIssuedDocumentsDesc', 'Documents issued to you by HR will appear here')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rows.map((row) => (
          <Card
            key={row._id}
            className="glass-panel shadow-sm hover:shadow-md hover:-translate-y-0.5"
            style={{ transition: 'all 0.3s cubic-bezier(0.22, 1, 0.36, 1)' }}
          >
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <FileSignature className="h-5 w-5 text-(--purple-text) shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate">{row.title}</h3>
                  <div className="flex items-center gap-2 mt-2">
                    {row.status === 'signed' ? (
                      <Badge className="border-(--success-outline) bg-(--success-quiet) text-(--success-text)">
                        <Check className="mr-1 h-3 w-3" />
                        {t('issued.statusSigned', 'Signed')}
                      </Badge>
                    ) : (
                      <Badge className="border-(--brand-outline) bg-(--brand-quiet) text-(--brand-text)">
                        {t('issued.statusSent', 'Awaiting signature')}
                      </Badge>
                    )}
                    {row.documentNumber && (
                      <Badge variant="outline" className="text-xs">
                        {row.documentNumber}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-4"
                disabled={busyId === row._id}
                onClick={() => void handlePreview(row)}
              >
                {busyId === row._id ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4 mr-1" />
                )}
                {t('issued.preview', 'Preview')}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Preview */}
      <Sheet open={previewDoc !== null} onOpenChange={(open) => !open && setPreviewDoc(null)}>
        <SheetContent side="right" size="xl" closeLabel={t('common.close', 'Close')}>
          {previewDoc && (
            <>
              <SheetHeader>
                <SheetTitle className="pr-8">{previewDoc.title}</SheetTitle>
                <SheetDescription>
                  {orgName}
                  {previewDoc.documentNumber && <> · {previewDoc.documentNumber}</>}
                </SheetDescription>
              </SheetHeader>
              <SheetBody>
                <DocumentPreview doc={previewDoc} />
              </SheetBody>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
