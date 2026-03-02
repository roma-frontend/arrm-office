"use client";

import { useTranslation } from "react-i18next";
import React, { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { Star, Send, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useAuthStore } from "@/store/useAuthStore";
import type { Id } from "../../../convex/_generated/dataModel";

interface SupervisorRatingFormProps {
  employeeId: Id<"users">;
  employeeName: string;
  onClose?: () => void;
  onSuccess?: () => void;
}

interface RatingCategory {
  key: "qualityOfWork" | "efficiency" | "teamwork" | "initiative" | "communication" | "reliability";
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
      key: "qualityOfWork",
      label: t('dashboard.qualityOfWork'),
      description: "Accuracy, thoroughness, and attention to detail",
    },
    {
      key: "efficiency",
      label: t('dashboard.efficiency'),
      description: "Speed and productivity in completing tasks",
    },
    {
      key: "teamwork",
      label: t('dashboard.teamwork'),
      description: "Collaboration and support for colleagues",
    },
    {
      key: "initiative",
      label: t('dashboard.initiative'),
      description: "Proactiveness and self-motivation",
    },
    {
      key: "communication",
      label: t('dashboard.communication'),
      description: "Clarity and effectiveness in communication",
    },
    {
      key: "reliability",
      label: t('dashboard.reliability'),
      description: "Dependability and consistency",
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

  const [strengths, setStrengths] = useState("");
  const [areasForImprovement, setAreasForImprovement] = useState("");
  const [generalComments, setGeneralComments] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRatingChange = (category: string, value: number) => {
    setRatings((prev) => ({ ...prev, [category]: value }));
  };

  const handleSubmit = async () => {
    if (!user?.id) return;

    setIsSubmitting(true);
    try {
      await createRating({
        employeeId,
        supervisorId: user.id as any,
        qualityOfWork: ratings.qualityOfWork,
        efficiency: ratings.efficiency,
        teamwork: ratings.teamwork,
        initiative: ratings.initiative,
        communication: ratings.communication,
        reliability: ratings.reliability,
        strengths: strengths || undefined,
        areasForImprovement: areasForImprovement || undefined,
        generalComments: generalComments || undefined,
      });

      toast.success(`Rating submitted for ${employeeName}! 🌟`);
      onSuccess?.();
      onClose?.();
    } catch (error: any) {
      toast.error(error.message || "Failed to submit rating");
    } finally {
      setIsSubmitting(false);
    }
  };

  const averageRating = Object.values(ratings).reduce((sum, r) => sum + r, 0) / 6;

  return (
    <Card className="w-full max-w-3xl">
      <CardHeader className="bg-gradient-to-r from-sky-400 to-pink-500 text-white">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-white">Performance Rating</CardTitle>
            <CardDescription className="text-white/90">
              Evaluate {employeeName}'s performance
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
          <h3 className="font-semibold text-lg" style={{ color: "var(--text-primary)" }}>
            Rate Performance (1-5)
          </h3>

          {categories.map((category) => (
            <div key={category.key} className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">{category.label}</Label>
                  <p className="text-sm text-[var(--text-muted)]">{category.description}</p>
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
                          value <= ratings[category.key]
                            ? "fill-yellow-400 text-yellow-400"
                            : "text-gray-300"
                        }`}
                      />
                    </button>
                  ))}
                  <span className="ml-2 text-lg font-semibold w-8 text-center" style={{ color: "var(--text-primary)" }}>
                    {ratings[category.key]}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Average Score */}
        <div className="p-4 rounded-lg bg-gradient-to-r from-sky-50 to-pink-50 dark:from-sky-950 dark:to-pink-950">
          <div className="flex items-center justify-between">
            <span className="font-medium" style={{ color: "var(--text-primary)" }}>
              Overall Average
            </span>
            <div className="flex items-center gap-2">
              <Star className="w-6 h-6 fill-yellow-400 text-yellow-400" />
              <span className="text-3xl font-bold text-sky-500 dark:text-sky-400">
                {averageRating.toFixed(1)}
              </span>
              <span className="text-sm text-[var(--text-muted)]">/ 5.0</span>
            </div>
          </div>
        </div>

        {/* Text Feedback */}
        <div className="space-y-4">
          <h3 className="font-semibold text-lg" style={{ color: "var(--text-primary)" }}>
            Written Feedback (Optional)
          </h3>

          <div className="space-y-2">
            <Label>{t('labels.strengths')}</Label>
            <Textarea
              placeholder={t('placeholders.whatDoesWell')}
              value={strengths}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setStrengths(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('labels.areasForImprovement')}</Label>
            <Textarea
              placeholder={t('placeholders.canImprove')}
              value={areasForImprovement}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setAreasForImprovement(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('labels.generalComments')}</Label>
            <Textarea
              placeholder={t('placeholders.additionalFeedbackNotes')}
              value={generalComments}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setGeneralComments(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex gap-3 pt-4">
          {onClose && (
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
          )}
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 bg-gradient-to-r from-sky-400 to-pink-500 hover:from-sky-500 hover:to-pink-600 text-white"
          >
            {isSubmitting ? (
              "Submitting..."
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Submit Rating
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default SupervisorRatingForm;
