'use client';

import { useTranslation } from 'react-i18next';
import React, { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { Star, Send, X } from 'lucide-react';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/useAuthStore';
import type { Id } from '../../../convex/_generated/dataModel';

interface SupervisorRatingFormProps {
  employeeId: Id<'users'>;
  employeeName: string;
  onClose?: () => void;
  onSuccess?: () => void;
}

interface RatingCategory {
  key: 'qualityOfWork' | 'efficiency' | 'teamwork' | 'initiative' | 'communication' | 'reliability';
  label: string;
  description: string;
}

export function SupervisorRatingForm({
  employeeId,
  employeeName,
  onClose,
  onSuccess,
}: SupervisorRatingFormProps) {
  const { t } = useTranslation();

  const categories: RatingCategory[] = [
    {
      key: 'qualityOfWork',
      label: t('dashboard.qualityOfWork'),
      description: t('rating.qualityOfWorkDesc', 'Accuracy, thoroughness, and attention to detail'),
    },
    {
      key: 'efficiency',
      label: t('dashboard.efficiency'),
      description: t('rating.efficiencyDesc', 'Speed and productivity in completing tasks'),
    },
    {
      key: 'teamwork',
      label: t('dashboard.teamwork'),
      description: t('rating.teamworkDesc', 'Collaboration and support for colleagues'),
    },
    {
      key: 'initiative',
      label: t('dashboard.initiative'),
      description: t('rating.initiativeDesc', 'Proactiveness and self-motivation'),
    },
    {
      key: 'communication',
      label: t('dashboard.communication'),
      description: t('rating.communicationDesc', 'Clarity and effectiveness in communication'),
    },
    {
      key: 'reliability',
      label: t('dashboard.reliability'),
      description: t('rating.reliabilityDesc', 'Dependability and consistency'),
    },
  ];
  const { user } = useAuthStore();
  const createRating = useMutation(api.supervisorRatings.createRating);

  const [ratings, setRatings] = useState<Record<string, number>>({
    qualityOfWork: 3,
    efficiency: 3,
    teamwork: 3,
    initiative: 3,
    communication: 3,
    reliability: 3,
  });

  const [strengths, setStrengths] = useState('');
  const [areasForImprovement, setAreasForImprovement] = useState('');
  const [generalComments, setGeneralComments] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRatingChange = (category: string, value: number) => {
    setRatings((prev) => ({ ...prev, [category]: value }));
  };

  const handleSubmit = async () => {
    if (!user?.id || user.id === '') return;

    setIsSubmitting(true);
    try {
      await createRating({
        employeeId,
        supervisorId: user.id as Id<'users'>,
        qualityOfWork: ratings.qualityOfWork ?? 3,
        efficiency: ratings.efficiency ?? 3,
        teamwork: ratings.teamwork ?? 3,
        initiative: ratings.initiative ?? 3,
        communication: ratings.communication ?? 3,
        reliability: ratings.reliability ?? 3,
        strengths: strengths || undefined,
        areasForImprovement: areasForImprovement || undefined,
        generalComments: generalComments || undefined,
      });

      toast.success(
        t('rating.submittedSuccess', 'Rating submitted for {{name}}!', { name: employeeName }),
      );
      onSuccess?.();
      onClose?.();
    } catch (error: any) {
      toast.error(error.message || t('rating.submitFailed', 'Failed to submit rating'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const averageRating = Object.values(ratings).reduce((sum, r) => sum + r, 0) / 6;

  return (
    <Card className="w-full max-w-3xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{t('rating.performanceRating', 'Performance Rating')}</CardTitle>
            <CardDescription>
              {t('rating.evaluatePerformance', "Evaluate {{name}}'s performance", {
                name: employeeName,
              })}
            </CardDescription>
          </div>
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-white hover:bg-white/20"
            >
              <X className="w-5 h-5" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        {/* Rating Categories */}
        <div className="space-y-4">
          <h3 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>
            {t('rating.ratePerformance', 'Rate Performance (1-5)')}
          </h3>

          {categories.map((category) => (
            <div key={category.key} className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">{category.label}</Label>
                  <p className="text-sm text-(--text-muted)">{category.description}</p>
                </div>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => handleRatingChange(category.key, value)}
                      className="p-1 transition-transform hover:scale-110"
                    >
                      <Star
                        className={`w-6 h-6 ${
                          value <= (ratings[category.key] ?? 0)
                            ? 'fill-yellow-400 text-yellow-400'
                            : 'text-gray-300'
                        }`}
                      />
                    </button>
                  ))}
                  <span
                    className="ml-2 text-lg font-semibold w-8 text-center"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {ratings[category.key] ?? 0}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Average Score */}
        <div className="p-4 rounded-lg bg-(--input)">
          <div className="flex items-center justify-between">
            <span className="font-medium text-black/70 dark:text-white/70">
              {t('rating.overallAverage', 'Overall Average')}
            </span>
            <div className="flex items-center gap-2">
              <Star className="w-6 h-6 fill-yellow-400 text-yellow-400" />
              <span className="text-3xl font-bold text-sky-500 dark:text-sky-400">
                {averageRating.toFixed(1)}
              </span>
              <span className="text-sm text-(--text-muted)">/ 5.0</span>
            </div>
          </div>
        </div>

        {/* Text Feedback */}
        <div className="space-y-4">
          <h3 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>
            {t('rating.writtenFeedback', 'Written Feedback (Optional)')}
          </h3>

          <div className="space-y-2">
            <Label>{t('labels.strengths')}</Label>
            <Textarea
              placeholder={t('placeholders.whatDoesWell', 'What does this employee do well?')}
              value={strengths}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setStrengths(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('labels.areasForImprovement')}</Label>
            <Textarea
              placeholder={t('placeholders.canImprove', 'What areas can be improved?')}
              value={areasForImprovement}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setAreasForImprovement(e.target.value)
              }
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('labels.generalComments')}</Label>
            <Textarea
              placeholder={t(
                'placeholders.additionalFeedbackNotes',
                'Any additional feedback or notes...',
              )}
              value={generalComments}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setGeneralComments(e.target.value)
              }
              rows={3}
            />
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex gap-3 pt-4">
          {onClose && (
            <Button variant="outline" onClick={onClose} className="flex-1">
              {t('common.cancel', 'Cancel')}
            </Button>
          )}
          <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1" variant="info">
            {isSubmitting ? (
              t('rating.submitting', 'Submitting...')
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                {t('rating.submitRating', 'Submit Rating')}
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default SupervisorRatingForm;
