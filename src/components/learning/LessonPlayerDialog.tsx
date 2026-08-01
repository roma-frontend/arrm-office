'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Play,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Video,
  FileText,
  HelpCircle,
  X,
} from 'lucide-react';

type Lesson = {
  _id: Id<'lessons'>;
  _creationTime: number;
  courseId: Id<'courses'>;
  title: string;
  description?: string;
  order: number;
  contentType: 'video' | 'text' | 'quiz' | 'mixed';
  videoUrl?: string;
  textContent?: string;
  durationMinutes?: number;
  isPreview?: boolean;
};

type QuizQuestion = {
  _id: string;
  questionText: string;
  questionType: 'multiple_choice' | 'true_false' | 'short_answer';
  options?: string[];
  correctAnswer?: string;
};

type QuizData = {
  quiz: {
    _id: Id<'quizzes'>;
    title: string;
    description?: string;
    passingScore?: number;
    timeLimitMinutes?: number;
  };
  questions: QuizQuestion[];
};

type QuizResult = {
  passed: boolean;
  score: number;
  attemptNumber: number;
};

interface LessonPlayerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lessons: Lesson[];
  activeLessonIndex: number;
  setActiveLessonIndex: (index: number) => void;
  lessonProgress: Record<string, boolean>;
  onCompleteLesson: () => void;
  onNextLesson: () => void;
  onPrevLesson: () => void;
  quizData: QuizData | null | undefined;
  showQuiz: boolean;
  setShowQuiz: (show: boolean) => void;
  quizSubmitted: boolean;
  setQuizSubmitted: (submitted: boolean) => void;
  quizResult: QuizResult | null;
  onSubmitQuiz: () => void;
  onAnswerChange: (questionId: string, answer: string) => void;
  userAnswers: Record<string, string>;
  onRetryQuiz: () => void;
  onBackToLesson: () => void;
}

export function LessonPlayerDialog({
  open,
  onOpenChange,
  lessons,
  activeLessonIndex,
  onCompleteLesson,
  onNextLesson,
  onPrevLesson,
  quizData,
  showQuiz,
  setShowQuiz,
  quizSubmitted,
  setQuizSubmitted,
  quizResult,
  onSubmitQuiz,
  onAnswerChange,
  userAnswers,
  onRetryQuiz,
  onBackToLesson,
}: LessonPlayerDialogProps) {
  const { t } = useTranslation();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  const currentLesson = lessons[activeLessonIndex];
  if (!currentLesson) return null;

  const ContentTypeIcon =
    currentLesson.contentType === 'video'
      ? Video
      : currentLesson.contentType === 'quiz'
        ? HelpCircle
        : FileText;

  const handleNextQuestion = () => {
    if (quizData && currentQuestionIndex < quizData.questions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
    }
  };

  const handlePrevQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex((prev) => prev - 1);
    }
  };

  const handleStartQuiz = () => {
    setShowQuiz(true);
    setCurrentQuestionIndex(0);
    setQuizSubmitted(false);
  };

  const handleBackToLesson = () => {
    setShowQuiz(false);
    setQuizSubmitted(false);
    onBackToLesson();
  };

  const getEmbedUrl = (url: string): string => {
    if (!url) return url;
    const youtubeMatch = url.match(
      /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/,
    );
    if (youtubeMatch) {
      return `https://www.youtube.com/embed/${youtubeMatch[1]}`;
    }
    return url;
  };

  const sanitizeHtml = (html: string): string => {
    if (!html) return '';
    return html
      .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<object[^>]*>.*?<\/object>/gi, '')
      .replace(/<embed[^>]*>.*?<\/embed>/gi, '');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{currentLesson.title}</span>
            <Badge variant="outline">
              {activeLessonIndex + 1} / {lessons.length}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Lesson Content */}
          <div className="rounded-lg border overflow-hidden">
            {currentLesson.contentType === 'video' && currentLesson.videoUrl ? (
              <div className="aspect-video bg-black flex items-center justify-center">
                <iframe
                  src={getEmbedUrl(currentLesson.videoUrl)}
                  className="w-full h-full"
                  allowFullScreen
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  title={currentLesson.title}
                />
              </div>
            ) : currentLesson.contentType === 'text' ? (
              <div className="p-6 prose prose-sm dark:prose-invert max-w-none">
                {currentLesson.textContent && currentLesson.textContent.trim() ? (
                  <div
                    dangerouslySetInnerHTML={{
                      __html: sanitizeHtml(currentLesson.textContent),
                    }}
                  />
                ) : (
                  <div className="text-center py-8">
                    <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">
                      {t('learning.noContent', 'No content available')}
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      {t('learning.contactAdmin', 'Contact your administrator to add content')}
                    </p>
                  </div>
                )}
              </div>
            ) : currentLesson.contentType === 'quiz' ? (
              <div className="p-6">
                {!showQuiz ? (
                  <div className="text-center space-y-4">
                    <HelpCircle className="h-12 w-12 mx-auto text-muted-foreground" />
                    <h3 className="text-lg font-medium">
                      {quizData?.quiz?.title || t('learning.quiz', 'Quiz')}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {quizData?.quiz?.description ||
                        t('learning.quizDescription', 'Test your knowledge')}
                    </p>
                    {quizData?.quiz && (
                      <div className="flex items-center justify-center gap-4 text-sm">
                        <span className="text-muted-foreground">
                          {quizData.questions?.length || 0} {t('learning.questions', 'Questions')}
                        </span>
                        {quizData.quiz.passingScore && (
                          <>
                            <span>•</span>
                            <span>
                              {t('learning.passingScore', 'Passing Score')}:{' '}
                              {quizData.quiz.passingScore}%
                            </span>
                          </>
                        )}
                        {quizData.quiz.timeLimitMinutes && (
                          <>
                            <span>•</span>
                            <span>
                              {quizData.quiz.timeLimitMinutes} {t('learning.minutes', 'minutes')}
                            </span>
                          </>
                        )}
                      </div>
                    )}
                    <Button onClick={handleStartQuiz} disabled={!quizData}>
                      <Play className="h-4 w-4 mr-2" />
                      {t('learning.startQuiz', 'Start Quiz')}
                    </Button>
                  </div>
                ) : quizSubmitted && quizResult ? (
                  <div className="text-center space-y-4">
                    <div
                      className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center ${
                        quizResult.passed
                          ? 'bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400'
                          : 'bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400'
                      }`}
                    >
                      {quizResult.passed ? (
                        <CheckCircle2 className="h-8 w-8" />
                      ) : (
                        <X className="h-8 w-8" />
                      )}
                    </div>
                    <h3 className="text-lg font-medium">
                      {quizResult.passed
                        ? t('learning.quizPassed', 'Congratulations! You passed')
                        : t('learning.quizFailed', 'You did not pass')}
                    </h3>
                    <p className="text-3xl font-bold">{quizResult.score}%</p>
                    <p className="text-sm text-muted-foreground">
                      {t('learning.attempt', 'Attempt')} #{quizResult.attemptNumber}
                    </p>
                    <div className="flex items-center justify-center gap-2">
                      <Button variant="outline" onClick={handleBackToLesson}>
                        {t('learning.backToLesson', 'Back to Lesson')}
                      </Button>
                      {!quizResult.passed && (
                        <Button onClick={onRetryQuiz}>{t('learning.tryAgain', 'Try Again')}</Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Question Header */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        {t('learning.question', 'Question')} {currentQuestionIndex + 1}{' '}
                        {t('common.of', 'of')} {quizData?.questions?.length || 0}
                      </span>
                      <div className="flex gap-1">
                        {quizData?.questions?.map((_: QuizQuestion, idx: number) => (
                          <div
                            key={idx}
                            className={`w-2 h-2 rounded-full ${
                              idx === currentQuestionIndex
                                ? 'bg-primary'
                                : idx < currentQuestionIndex
                                  ? 'bg-primary/50'
                                  : 'bg-muted'
                            }`}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Question */}
                    {quizData?.questions?.[currentQuestionIndex] &&
                      (() => {
                        const question = quizData.questions[currentQuestionIndex];
                        return (
                          <div className="space-y-4">
                            <h3 className="text-lg font-medium">{question.questionText}</h3>

                            {question.questionType === 'multiple_choice' &&
                              question.options?.map((option: string, optIdx: number) => (
                                <div
                                  key={optIdx}
                                  className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                                    userAnswers[question._id] === option
                                      ? 'border-primary bg-primary/5'
                                      : 'hover:bg-muted/50'
                                  }`}
                                  onClick={() => onAnswerChange(question._id, option)}
                                >
                                  <div className="flex items-center gap-3">
                                    <div
                                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                        userAnswers[question._id] === option
                                          ? 'border-primary bg-primary'
                                          : 'border-muted-foreground'
                                      }`}
                                    >
                                      {userAnswers[question._id] === option && (
                                        <div className="w-2 h-2 rounded-full bg-white" />
                                      )}
                                    </div>
                                    <span>{option}</span>
                                  </div>
                                </div>
                              ))}

                            {question.questionType === 'true_false' && (
                              <div className="grid grid-cols-2 gap-4">
                                {['True', 'False'].map((option) => (
                                  <div
                                    key={option}
                                    className={`p-4 rounded-lg border cursor-pointer text-center transition-colors ${
                                      userAnswers[question._id] === option
                                        ? 'border-primary bg-primary/5'
                                        : 'hover:bg-muted/50'
                                    }`}
                                    onClick={() => onAnswerChange(question._id, option)}
                                  >
                                    {option}
                                  </div>
                                ))}
                              </div>
                            )}

                            {question.questionType === 'short_answer' && (
                              <Input
                                value={userAnswers[question._id] || ''}
                                onChange={(e) => onAnswerChange(question._id, e.target.value)}
                                placeholder={t('learning.enterAnswer', 'Enter your answer')}
                              />
                            )}
                          </div>
                        );
                      })()}

                    {/* Question Navigation */}
                    <div className="flex items-center justify-between">
                      <Button
                        variant="outline"
                        onClick={handlePrevQuestion}
                        disabled={currentQuestionIndex === 0}
                      >
                        <ChevronLeft className="h-4 w-4 mr-2" />
                        {t('learning.previous', 'Previous')}
                      </Button>

                      {currentQuestionIndex < (quizData?.questions?.length || 0) - 1 ? (
                        <Button onClick={handleNextQuestion}>
                          {t('learning.next', 'Next')}
                          <ChevronRight className="h-4 w-4 ml-2" />
                        </Button>
                      ) : (
                        <Button
                          onClick={onSubmitQuiz}
                          disabled={Object.keys(userAnswers).length === 0}
                        >
                          {t('learning.submitQuiz', 'Submit Quiz')}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 text-center">
                <ContentTypeIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  {t('learning.noContent', 'No content available')}
                </p>
              </div>
            )}
          </div>

          {/* Lesson Description */}
          {currentLesson.description && (
            <div>
              <h3 className="font-medium mb-2">{t('learning.aboutLesson', 'About this lesson')}</h3>
              <p className="text-sm text-muted-foreground">{currentLesson.description}</p>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={onPrevLesson} disabled={activeLessonIndex === 0}>
              <ChevronLeft className="h-4 w-4 mr-2" />
              {t('learning.previousLesson', 'Previous')}
            </Button>

            <Button onClick={onCompleteLesson}>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              {t('learning.completeLesson', 'Complete & Continue')}
            </Button>

            <Button
              variant="outline"
              onClick={onNextLesson}
              disabled={activeLessonIndex >= lessons.length - 1}
            >
              {t('learning.nextLesson', 'Next')}
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
