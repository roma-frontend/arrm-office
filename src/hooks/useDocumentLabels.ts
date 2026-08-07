'use client';

/**
 * Localized static labels for exported documents.
 *
 * The exporters take the labels as data rather than translating internally, so
 * a document's captions match the UI language it was produced in — and a frozen
 * document keeps the labels it was signed with. Shared here because the hiring
 * packet, the template editor and the issued-document registry all need the same
 * six strings.
 */
import { useTranslation } from 'react-i18next';

import type { DocumentLabels } from '@/lib/exportDocument';

export function useDocumentLabels(): DocumentLabels {
  const { t } = useTranslation();
  return {
    signature: t('docLibrary.signature', 'Signature'),
    name: t('docLibrary.nameLabel', 'Name'),
    position: t('docLibrary.positionLabel', 'Position'),
    date: t('docLibrary.dateLabel', 'Date'),
    generatedOn: t('docLibrary.generatedOn', 'Generated on'),
    integrity: t('docLibrary.integrity', 'Integrity'),
  };
}
