'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import { Star, Car, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { logger } from '@/lib/logger';

interface RatingModalProps {
  driverName: string;
  driverAvatar?: string;
  tripInfo: { from: string; to: string };
  onSubmit: (rating: number, comment?: string) => Promise<void>;
  onClose: () => void;
}

export function RatingModal({
  driverName,
  driverAvatar,
  tripInfo,
  onSubmit,
  onClose,
}: RatingModalProps) {
  const { t } = useTranslation();
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) return;
    setIsSubmitting(true);
    try {
      await onSubmit(rating, comment || undefined);
      onClose();
    } catch (error) {
      logger.error('Failed to submit rating:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const ratingLabels = {
    1: t('driver.ratingVeryBad', 'Very Bad'),
    2: t('driver.ratingBad', 'Bad'),
    3: t('driver.ratingOkay', 'Okay'),
    4: t('driver.ratingGood', 'Good'),
    5: t('driver.ratingExcellent', 'Excellent'),
  } as const;

  const currentRating = hoveredRating || rating;
  const ratingKey = (
    currentRating >= 1 && currentRating <= 5 ? currentRating : 5
  ) as keyof typeof ratingLabels;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="w-full max-w-md bg-(--card) rounded-2xl border border-(--border) shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative p-6 btn-gradient">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
          >
            <X className="w-4 h-4 text-white" />
          </button>
          <div className="flex items-center gap-4">
            <Avatar className="w-14 h-14 ring-4 ring-white/30">
              {driverAvatar && <AvatarImage src={driverAvatar} />}
              <AvatarFallback className="text-lg bg-white/20 text-white">
                {driverName
                  ?.split(' ')
                  .map((n) => n[0])
                  .join('')}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-xl font-bold text-white">
                {t('driver.rateDriver', 'Rate Driver')}
              </h2>
              <p className="text-white/80 text-sm mt-0.5">{driverName}</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Trip Info */}
          <div className="flex items-center gap-2 p-3 rounded-xl bg-(--background-subtle)">
            <Car className="w-4 h-4 text-(--primary) shrink-0" />
            <span className="text-sm text-(--text-muted)">
              {tripInfo.from} → {tripInfo.to}
            </span>
          </div>

          {/* Star Rating */}
          <div className="text-center space-y-3">
            <p className="text-sm font-medium text-(--text-primary)">
              {t('driver.howWasTrip', 'How was your trip?')}
            </p>
            <div className="flex items-center justify-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  onClick={() => setRating(star)}
                  className="p-1 transition-transform hover:scale-110"
                >
                  <Star
                    className={`w-10 h-10 transition-all duration-200 ${
                      star <= (hoveredRating || rating)
                        ? 'fill-yellow-400 text-(--warning-text) drop-shadow-lg'
                        : 'fill-(--border) text-(--border)'
                    }`}
                  />
                </button>
              ))}
            </div>
            <AnimatePresence mode="wait">
              {(hoveredRating || rating) > 0 && (
                <motion.p
                  key={hoveredRating || rating}
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="text-sm font-medium text-(--primary)"
                >
                  {ratingLabels[ratingKey]}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* Comment */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-(--text-primary)">
              {t('driver.comment', 'Comment')} ({t('driver.optional', 'Optional')})
            </label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t('driver.commentPlaceholder', 'Tell us about your experience...')}
              className="resize-none border-(--border) bg-(--input)"
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1" disabled={isSubmitting}>
              {t('driver.cancel', 'Cancel')}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={rating === 0 || isSubmitting}
              className="flex-1 gap-2"
            >
              <Star className={`w-4 h-4 ${rating > 0 ? 'fill-current' : ''}`} />
              {isSubmitting
                ? t('driver.submitting', 'Submitting...')
                : t('driver.submitRating', 'Submit Rating')}
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
