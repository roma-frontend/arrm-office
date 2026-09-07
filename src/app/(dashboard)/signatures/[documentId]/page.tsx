'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@/lib/convex-typed';
import { useAuthStore } from '@/store/useAuthStore';
import { useShallow } from 'zustand/shallow';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { toast } from 'sonner';
import { PenTool, FileText, CheckCircle, ChevronLeft, ArrowLeft } from 'lucide-react';
import {
  SignaturePad,
  SignatureUpload,
  documentDisplayBody,
  buildActBody,
  localizedDocTitle,
} from '@/components/ESignaturesClient';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Id } from '@/convex/_generated/dataModel';
import { api } from '@/convex/_generated/api';
import { parseDocumentContent } from '@/lib/bilingualDocument';
import { DocumentBlocksPreview } from '@/components/documents/DocumentBlocksPreview';

/**
 * Standalone signing page reached from /signatures/[documentId].
 *
 * Created so that clicking "Sign" in the Leave detail view navigates to a
 * full-page signing experience instead of hitting a 404.
 */
export default function SignatureDocumentPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { user } = useAuthStore(useShallow((s) => ({ user: s.user })));

  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [isSigning, setIsSigning] = useState(false);

  const userId = user?.id ? (user.id as Id<'users'>) : null;

  const doc = useQuery(
    api.signatures.getDocument,
    documentId && userId ? { documentId: documentId as Id<'signatureDocuments'> } : 'skip',
  );

  const signMutation = useMutation(api.signatures.signDocument);

  if (!userId || !documentId) return <ShieldLoader />;
  if (doc === undefined) return <ShieldLoader />;
  if (doc === null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <FileText className="w-16 h-16 text-muted-foreground" />
        <h2 className="text-xl font-semibold">{t('signatures.notFound', 'Document not found')}</h2>
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('common.back', 'Back')}
        </Button>
      </div>
    );
  }

  // Find the current user's request among the signers
  const myRequest = doc.requests?.find((r) => r.signerId === userId && r.status === 'pending');

  const isSigned = doc.status === 'completed';
  const canSign = !!myRequest;

  // Determine signing order — who needs to sign before this user
  const myOrder = myRequest?.order;
  const waitingFor =
    myOrder == null
      ? []
      : (doc.requests ?? [])
          .filter((r) => r.order < myOrder && r.status === 'pending')
          .sort((a, b) => a.order - b.order)
          .map((r) => r.signerName);
  const isMyTurn = waitingFor.length === 0;

  const handleSign = async () => {
    if (!myRequest || !signatureData) return;
    if (!isMyTurn) {
      toast.error(
        t('signatures.waitingForSigners', {
          names: waitingFor.join(', '),
          defaultValue: 'Waiting for {{names}}',
        }),
      );
      return;
    }
    setIsSigning(true);
    try {
      await signMutation({
        requestId: myRequest._id,
        signatureData,
        userId,
      });
      toast.success(t('signatures.signed', 'Document signed successfully!'));
      setSignatureData(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      toast.error(msg || t('signatures.errors.signFailed', 'Failed to sign document'));
    } finally {
      setIsSigning(false);
    }
  };

  const statusColor: Record<string, string> = {
    pending: 'bg-(--warning-quiet) text-(--warning-text)',
    signed: 'bg-(--success-quiet) text-(--success-text)',
    completed: 'bg-(--success-quiet) text-(--success-text)',
    declined: 'bg-(--danger-quiet) text-(--danger-text)',
    expired: 'bg-(--surface-3) text-(--text-3)',
  };

  // Parse structured content (bilingual documents, asset acts, etc.)
  const act = buildActBody(doc, t, i18n.language);
  const displayBody = documentDisplayBody(doc, act);
  const displayTitle = localizedDocTitle(doc, t);
  const parsedContent = doc.content ? parseDocumentContent(doc.content) : null;

  return (
    <div className="max-w-2xl mx-auto py-6 px-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{displayTitle || doc.title}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge className={`text-xs ${statusColor[doc.status] || ''}`}>
              {String(t(`signatures.status.${doc.status}`, doc.status))}
            </Badge>
          </div>
        </div>
      </div>

      {/* Document Content */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <h3 className="font-semibold mb-2 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            {t('signatures.documentContent', 'Document Content')}
          </h3>
          <div className="p-3 bg-muted/50 rounded-lg text-sm max-h-[400px] overflow-y-auto">
            {parsedContent ? (
              <DocumentBlocksPreview blocks={parsedContent.blocks} />
            ) : (
              <div className="whitespace-pre-wrap text-(--text-muted)">{displayBody}</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Signers */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <h3 className="font-semibold mb-3">{t('signatures.signers', 'Signers')}</h3>
          <div className="space-y-2">
            {doc.requests?.map((req) => (
              <div key={req._id} className="flex items-center justify-between p-2 rounded border">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    #{req.order}
                  </Badge>
                  <span className="text-sm">
                    {req.signerName}
                    {req.signerId === userId && (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({t('signatures.you', 'You')})
                      </span>
                    )}
                  </span>
                </div>
                <Badge className={`text-xs ${statusColor[req.status] || ''}`}>
                  {String(t(`signatures.requestStatus.${req.status}`, req.status))}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Signing Section */}
      {canSign && !isSigned && (
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <PenTool className="w-4 h-4 text-primary" />
              {t('signatures.signDocument', 'Sign Document')}
            </h3>

            {!isMyTurn && waitingFor.length > 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                <p className="text-sm">
                  {t('signatures.waitingForSigners', {
                    names: waitingFor.join(', '),
                    defaultValue: 'Waiting for {{names}} to sign first',
                  })}
                </p>
              </div>
            ) : signatureData ? (
              <div className="space-y-3">
                <div className="border rounded-lg p-3 bg-white flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element -- live data-URL preview of the just-drawn signature; next/image adds nothing for a blob */}
                  <img src={signatureData} alt="Your signature" className="max-h-[80px]" />
                </div>
                <div className="flex justify-between">
                  <Button variant="outline" size="sm" onClick={() => setSignatureData(null)}>
                    {t('signatures.pad.redraw', 'Redraw')}
                  </Button>
                  <Button size="sm" onClick={handleSign} disabled={isSigning}>
                    <CheckCircle className="w-4 h-4 mr-1" />
                    {isSigning
                      ? t('signatures.signing', 'Signing…')
                      : t('signatures.sign', 'Sign Document')}
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-sm text-muted-foreground mb-3">
                  {t('signatures.drawOrUpload', 'Draw or upload your signature below')}
                </p>
                <Tabs defaultValue="draw" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-3">
                    <TabsTrigger value="draw" className="flex items-center gap-1.5">
                      <PenTool className="w-3.5 h-3.5" />
                      {t('signatures.pad.tabDraw', 'Draw')}
                    </TabsTrigger>
                    <TabsTrigger value="upload" className="flex items-center gap-1.5">
                      {t('signatures.pad.tabUpload', 'Upload')}
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="draw" className="mt-0">
                    <SignaturePad onSave={setSignatureData} />
                  </TabsContent>
                  <TabsContent value="upload" className="mt-0">
                    <SignatureUpload onSave={setSignatureData} />
                  </TabsContent>
                </Tabs>
                <p className="text-xs text-muted-foreground mt-2">
                  {t(
                    'signatures.consent',
                    'By signing, you agree to be legally bound by this document.',
                  )}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Already signed message */}
      {isSigned && (
        <Card>
          <CardContent className="p-6 text-center">
            <CheckCircle className="w-12 h-12 mx-auto text-(--success-text) mb-3" />
            <p className="font-medium">
              {t('signatures.alreadySigned', 'This document has been fully signed')}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Not a signer */}
      {!canSign && !isSigned && (
        <Card>
          <CardContent className="p-6 text-center">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">
              {t('signatures.notASigner', 'You are not a signer on this document')}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
