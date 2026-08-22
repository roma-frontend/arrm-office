'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from 'react-i18next';

import { DetailSheet } from '@/components/ui/detail-sheet';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import type { Id } from '../../../convex/_generated/dataModel';

const SurveyEditClient = dynamic(() => import('@/components/surveys/SurveyEditClient'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-64 items-center justify-center">
      <ShieldLoader size="md" />
    </div>
  ),
});

export interface SurveyEditSheetProps {
  surveyId: Id<'surveys'> | null;
  onClose: () => void;
  /** Survey title, shown as the subtitle. */
  surveyTitle?: string;
}

export function SurveyEditSheet({ surveyId, onClose, surveyTitle }: SurveyEditSheetProps) {
  const { t } = useTranslation();

  return (
    <DetailSheet
      open={surveyId !== null}
      onClose={onClose}
      size="xl"
      title={t('surveys.edit', 'Edit Survey')}
      {...(surveyTitle ? { subtitle: surveyTitle } : {})}
    >
      {surveyId && <SurveyEditClient surveyId={surveyId} onClose={onClose} />}
    </DetailSheet>
  );
}

export default SurveyEditSheet;
