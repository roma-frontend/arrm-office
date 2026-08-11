'use client';

import React, { useState } from 'react';
import { useMainRef } from '@/hooks/useMainRef';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { useTranslation } from 'react-i18next';
import {
  Briefcase,
  Plus,
  Users,
  ChevronRight,
  ChevronLeft,
  CheckCircle,
  CheckCircle2,
  XCircle,
  Calendar,
  Star,
  ArrowRight,
  Mail,
  Phone,
  MapPin,
  Clock,
  FileText,
  UserPlus,
  TrendingUp,
  Pencil,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation, useAction } from '@/lib/convex-typed';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useAuthUser } from '@/store/useAuthStore';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { InterviewPrepDialog } from '@/components/recruitment/InterviewPrepDialog';

// ============ PIPELINE STAGES ============

const STAGES = ['applied', 'screening', 'interview', 'offer', 'hired'] as const;

/** Stages an unreviewed CV holds a candidate back from (mirrors the backend). */
const CV_GATED_STAGES = new Set<string>(['interview', 'offer', 'hired']);

const CV_BADGE: Record<string, string> = {
  pending: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  approved: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  rejected: 'bg-red-500/10 text-red-600 border-red-500/20',
};

function getStageBadgeColor(stage: string) {
  switch (stage) {
    case 'applied':
      return 'bg-blue-100 text-blue-800';
    case 'screening':
      return 'bg-yellow-100 text-yellow-800';
    case 'interview':
      return 'bg-purple-100 text-purple-800';
    case 'offer':
      return 'bg-orange-100 text-orange-800';
    case 'hired':
      return 'bg-green-100 text-green-800';
    case 'rejected':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

// ============ CREATE VACANCY WIZARD ============

function CreateVacancyWizard({
  organizationId,
  userId,
  onClose,
}: {
  organizationId: Id<'organizations'>;
  userId: Id<'users'>;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const createVacancy = useMutation(api.recruitment.createVacancy);
  const generateDescription = useAction(api.recruitmentAI.generateVacancyDescription);

  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [location, setLocation] = useState('');
  const [employmentType, setEmploymentType] = useState<
    'full_time' | 'part_time' | 'contract' | 'internship'
  >('full_time');
  const [description, setDescription] = useState('');
  const [requirements, setRequirements] = useState('');
  const [salaryMin, setSalaryMin] = useState('');
  const [salaryMax, setSalaryMax] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [submitting, setSubmitting] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);

  const steps = [
    t('recruitment.wizard.step1', 'Job Info'),
    t('recruitment.wizard.step2', 'Description'),
    t('recruitment.wizard.step3', 'Review'),
  ];

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await createVacancy({
        organizationId,
        title: title.trim(),
        department: department.trim() || undefined,
        location: location.trim() || undefined,
        employmentType,
        description: description.trim(),
        requirements: requirements.trim() || undefined,
        salary:
          salaryMin && salaryMax
            ? { min: Number(salaryMin), max: Number(salaryMax), currency }
            : undefined,
        hiringManagerId: userId,
      });
      toast.success(t('recruitment.wizard.success', 'Vacancy created'));
      onClose();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden max-h-[95vh]">
      <DialogHeader className="px-5 pt-5 pb-0">
        <DialogTitle>{t('recruitment.wizard.title', 'Create Vacancy')}</DialogTitle>
      </DialogHeader>

      <div className="flex flex-col">
        {/* Stepper */}
        <div className="px-5 pt-4 pb-3">
          <div className="relative h-1.5 bg-muted rounded-full overflow-hidden mb-4">
            <div
              className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all duration-300"
              style={{ width: `${((step + 1) / steps.length) * 100}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-1">
            {steps.map((s, idx) => (
              <React.Fragment key={idx}>
                <div className="flex flex-col items-center flex-1 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all shrink-0 ${
                      idx < step
                        ? 'bg-primary border-primary text-primary-foreground'
                        : idx === step
                          ? 'border-primary bg-background text-primary scale-110'
                          : 'border-muted-foreground/30 bg-background text-muted-foreground'
                    }`}
                  >
                    {idx < step ? <CheckCircle className="w-4 h-4" /> : idx + 1}
                  </div>
                  <p
                    className={`text-[10px] font-medium mt-1.5 text-center truncate w-full px-1 ${
                      idx === step ? 'text-primary' : 'text-muted-foreground'
                    }`}
                  >
                    {s}
                  </p>
                </div>
                {idx < steps.length - 1 && (
                  <div className="flex-1 h-0.5 bg-muted mx-1 max-w-8 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${idx < step ? 'bg-primary' : 'bg-transparent'}`}
                      style={{ width: idx < step ? '100%' : '0%' }}
                    />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="px-5 py-4 min-h-[280px] overflow-y-auto max-h-[50vh]">
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <Label>{t('recruitment.fields.title', 'Job Title')}</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t(
                    'recruitment.fields.titlePlaceholder',
                    'e.g. Senior Frontend Developer',
                  )}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>{t('recruitment.fields.department', 'Department')}</Label>
                  <Input
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder={t('recruitment.fields.deptPlaceholder', 'e.g. Engineering')}
                  />
                </div>
                <div>
                  <Label>{t('recruitment.fields.location', 'Location')}</Label>
                  <Input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder={t('recruitment.fields.locPlaceholder', 'e.g. Remote / Yerevan')}
                  />
                </div>
              </div>
              <div>
                <Label>{t('recruitment.fields.type', 'Employment Type')}</Label>
                <Select
                  value={employmentType}
                  onValueChange={(v) => setEmploymentType(v as typeof employmentType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full_time">
                      {t('recruitment.type.fullTime', 'Full-time')}
                    </SelectItem>
                    <SelectItem value="part_time">
                      {t('recruitment.type.partTime', 'Part-time')}
                    </SelectItem>
                    <SelectItem value="contract">
                      {t('recruitment.type.contract', 'Contract')}
                    </SelectItem>
                    <SelectItem value="internship">
                      {t('recruitment.type.internship', 'Internship')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              {/* AI Generate Button */}
              <div className="flex items-center justify-between gap-2 p-3 rounded-xl border border-blue-500/20 bg-blue-500/5">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-lg">✨</span>
                  <div>
                    <p className="font-medium text-blue-700 dark:text-blue-300 text-xs">
                      {t('recruitmentAI.title', 'AI-Powered Generation')}
                    </p>
                    <p className="text-[11px] text-blue-600/60 dark:text-blue-400/60">
                      {t(
                        'recruitmentAI.hint',
                        'Generate a professional description and requirements based on the job title',
                      )}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    if (!title.trim()) {
                      toast.error(
                        t('recruitmentAI.titleRequired', 'Please enter a job title first'),
                      );
                      return;
                    }
                    setAiGenerating(true);
                    try {
                      const lang = i18n.language || 'en';
                      const result = await generateDescription({
                        title: title.trim(),
                        department: department.trim() || undefined,
                        location: location.trim() || undefined,
                        employmentType,
                        language: lang as 'en' | 'ru' | 'hy' | 'de',
                      });
                      setDescription(result.description);
                      setRequirements(result.requirements);
                      toast.success(t('recruitmentAI.generated', 'Description generated!'));
                    } catch (err: unknown) {
                      toast.error(
                        err instanceof Error
                          ? err.message
                          : t('recruitmentAI.error', 'Generation failed'),
                      );
                    } finally {
                      setAiGenerating(false);
                    }
                  }}
                  disabled={aiGenerating || !title.trim()}
                  className="gap-1.5 shrink-0 bg-blue-500 hover:bg-blue-600 text-white border-blue-500 hover:text-white"
                >
                  {aiGenerating ? (
                    <>
                      <ShieldLoader size="xs" variant="inline" />
                      {t('common.loading', 'Generating...')}
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      {t('recruitmentAI.generate', 'Generate with AI')}
                    </>
                  )}
                </Button>
              </div>

              <div>
                <Label>{t('recruitment.fields.description', 'Job Description')}</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t(
                    'recruitment.fields.descPlaceholder',
                    'Describe the role, responsibilities...',
                  )}
                  rows={5}
                />
              </div>
              <div>
                <Label>{t('recruitment.fields.requirements', 'Requirements')}</Label>
                <Textarea
                  value={requirements}
                  onChange={(e) => setRequirements(e.target.value)}
                  placeholder={t(
                    'recruitment.fields.reqPlaceholder',
                    'Skills, experience, education...',
                  )}
                  rows={4}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">
                    {t('recruitment.fields.salaryMin', 'Min Salary')}
                  </Label>
                  <Input
                    type="number"
                    value={salaryMin}
                    onChange={(e) => setSalaryMin(e.target.value)}
                    className="h-8"
                  />
                </div>
                <div>
                  <Label className="text-xs">
                    {t('recruitment.fields.salaryMax', 'Max Salary')}
                  </Label>
                  <Input
                    type="number"
                    value={salaryMax}
                    onChange={(e) => setSalaryMax(e.target.value)}
                    className="h-8"
                  />
                </div>
                <div>
                  <Label className="text-xs">{t('recruitment.fields.currency', 'Currency')}</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="AMD">AMD</SelectItem>
                      <SelectItem value="RUB">RUB</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <Card>
                <CardContent className="p-4 space-y-2">
                  <h3 className="font-semibold">{title}</h3>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {department && <Badge variant="outline">{department}</Badge>}
                    {location && (
                      <Badge variant="outline">
                        <MapPin className="h-3 w-3 mr-1" />
                        {location}
                      </Badge>
                    )}
                    <Badge variant="outline">
                      {t(
                        `recruitment.type.${employmentType === 'full_time' ? 'fullTime' : employmentType === 'part_time' ? 'partTime' : employmentType}`,
                        employmentType,
                      )}
                    </Badge>
                  </div>
                  {salaryMin && salaryMax && (
                    <p className="text-sm text-muted-foreground">
                      {currency} {salaryMin} - {salaryMax}
                    </p>
                  )}
                </CardContent>
              </Card>
              {description && (
                <div>
                  <p className="text-xs font-medium mb-1">
                    {t('recruitment.fields.description', 'Description')}
                  </p>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-4">
                    {description}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between px-5 py-4 border-t">
          <Button variant="outline" onClick={() => (step === 0 ? onClose() : setStep(step - 1))}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            {step === 0 ? t('common.cancel', 'Cancel') : t('common.back', 'Back')}
          </Button>
          {step < 2 ? (
            <Button onClick={() => setStep(step + 1)} disabled={step === 0 && !title.trim()}>
              {t('common.next', 'Next')} <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={submitting || !title.trim() || !description.trim()}
            >
              {submitting ? '...' : t('recruitment.wizard.create', 'Create Vacancy')}
            </Button>
          )}
        </div>
      </div>
    </DialogContent>
  );
}

// ============ ADD CANDIDATE DIALOG ============

function AddCandidateDialog({
  vacancyId,
  organizationId,
  onClose,
}: {
  vacancyId: Id<'vacancies'>;
  organizationId: Id<'organizations'>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const addCandidate = useMutation(api.recruitment.addCandidate);
  const validateEmail = useAction(api.emailValidation.validateEmail);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [source, setSource] = useState<
    'manual' | 'referral' | 'career_page' | 'linkedin' | 'other'
  >('manual');
  const [resumeText, setResumeText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [emailError, setEmailError] = useState('');

  const handleSubmit = async () => {
    if (!name.trim() || !email.trim()) {
      toast.error(t('recruitment.candidate.fillRequired', 'Name and email are required'));
      return;
    }
    setEmailError('');
    setSubmitting(true);
    try {
      // Validate email
      const validation = await validateEmail({ email: email.trim() });
      if (!validation.valid) {
        const reasons: Record<string, string> = {
          invalid_format: t('careers.emailInvalidFormat', 'Invalid email format'),
          disposable_email: t('careers.emailDisposable', 'Disposable emails not allowed'),
          no_mx_records: t('careers.emailNoMx', 'This domain cannot receive email'),
          domain_not_found: t('careers.emailDomainNotFound', 'Email domain does not exist'),
        };
        setEmailError(
          reasons[validation.reason || ''] || t('careers.emailInvalid', 'Invalid email'),
        );
        setSubmitting(false);
        return;
      }

      await addCandidate({
        organizationId,
        vacancyId,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        resumeText: resumeText.trim() || undefined,
        source,
      });
      toast.success(t('recruitment.candidate.added', 'Candidate added'));
      onClose();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{t('recruitment.candidate.addTitle', 'Add Candidate')}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <Label>{t('recruitment.candidate.name', 'Full Name')}</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('recruitment.fields.namePlaceholder', 'John Doe')}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>{t('recruitment.candidate.email', 'Email')}</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailError('');
              }}
              placeholder={t('recruitment.fields.emailPlaceholder', 'john@example.com')}
              className={emailError ? 'border-red-500' : ''}
            />
            {emailError && <p className="text-xs text-red-500 mt-1">{emailError}</p>}
          </div>
          <div>
            <Label>{t('recruitment.candidate.phone', 'Phone')}</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+374..." />
          </div>
        </div>
        <div>
          <Label>{t('recruitment.candidate.source', 'Source')}</Label>
          <Select value={source} onValueChange={(v) => setSource(v as typeof source)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">{t('recruitment.source.manual', 'Manual')}</SelectItem>
              <SelectItem value="referral">
                {t('recruitment.source.referral', 'Referral')}
              </SelectItem>
              <SelectItem value="linkedin">
                {t('recruitment.source.linkedin', 'LinkedIn')}
              </SelectItem>
              <SelectItem value="career_page">
                {t('recruitment.source.careerPage', 'Career Page')}
              </SelectItem>
              <SelectItem value="other">{t('recruitment.source.other', 'Other')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{t('recruitment.candidate.resume', 'Resume / Summary')}</Label>
          <Textarea
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            placeholder={t(
              'recruitment.candidate.resumePlaceholder',
              'Brief summary or paste resume...',
            )}
            rows={3}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? t('common.loading', '...') : t('recruitment.candidate.add', 'Add')}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

// ============ CANDIDATE DETAIL DIALOG ============

function CandidateDetailDialog({
  applicationId,
  userId,
  onClose,
}: {
  applicationId: Id<'applications'>;
  userId: Id<'users'>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const data = useQuery(api.recruitment.getCandidate, { applicationId });
  const moveMutation = useMutation(api.recruitment.moveCandidate);
  const rejectMutation = useMutation(api.recruitment.rejectCandidate);
  const reviewCvMutation = useMutation(api.recruitment.reviewCv);

  const deleteCandidateMut = useMutation(api.recruitment.deleteCandidate);

  const [prepType, setPrepType] = useState<
    'phone' | 'video' | 'onsite' | 'technical' | 'hr' | undefined
  >(undefined);
  const [showPrep, setShowPrep] = useState(false);

  const handleDelete = async () => {
    try {
      await deleteCandidateMut({ applicationId });
      toast.success(t('recruitment.candidateRemoved', 'Candidate removed'));
      onClose();
    } catch (e) {
      toast.error(String(e));
    }
  };

  if (!data)
    return (
      <DialogContent className="sm:max-w-2xl">
        <ShieldLoader />
      </DialogContent>
    );

  const { candidate, vacancy, interviews, scorecards, events } = data;
  const currentStageIdx = STAGES.indexOf(data.stage as (typeof STAGES)[number]);
  const nextStage = currentStageIdx < STAGES.length - 1 ? STAGES[currentStageIdx + 1] : null;

  const handleMove = async (stage: string) => {
    try {
      await moveMutation({
        applicationId,
        newStage: stage as 'applied' | 'screening' | 'interview' | 'offer' | 'hired',
        userId,
      });
      toast.success(t('recruitment.candidate.moved', 'Candidate moved'));
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleReject = async () => {
    try {
      await rejectMutation({ applicationId, userId });
      toast.success(t('recruitment.candidate.rejected', 'Candidate rejected'));
    } catch (e) {
      toast.error(String(e));
    }
  };

  // An attached CV holds the candidate at screening until someone reads it. An
  // application without one — a referral typed in by hand — is not gated.
  const cvGateBlocks = !!data.cvFileUrl && data.cvStatus !== 'approved';

  const handleReviewCv = async (decision: 'approved' | 'rejected' | 'pending') => {
    try {
      await reviewCvMutation({ applicationId, decision });
      toast.success(t(`recruitment.cv.saved.${decision}`));
    } catch (e) {
      toast.error(String(e));
    }
  };

  return (
    <DialogContent className="sm:max-w-2xl max-h-[95vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          {candidate?.name ?? 'Candidate'}
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        {/* Contact & Meta */}
        <div className="flex flex-wrap gap-3 text-sm">
          {candidate?.email && (
            <span className="flex items-center gap-1">
              <Mail className="h-3 w-3" />
              {candidate.email}
            </span>
          )}
          {candidate?.phone && (
            <span className="flex items-center gap-1">
              <Phone className="h-3 w-3" />
              {candidate.phone}
            </span>
          )}
          <Badge className={getStageBadgeColor(data.stage)}>
            {t(`recruitment.stage.${data.stage}`, data.stage)}
          </Badge>
        </div>

        {/* Vacancy link */}
        {vacancy && (
          <p className="text-xs text-muted-foreground">
            {t('recruitment.candidate.appliedTo', 'Applied to')}:{' '}
            <span className="font-medium">{vacancy.title}</span>
          </p>
        )}

        {/* Resume */}
        {candidate?.resumeText && (
          <div>
            <p className="text-xs font-medium mb-1">
              {t('recruitment.candidate.resume', 'Resume')}
            </p>
            <p className="text-xs text-muted-foreground whitespace-pre-wrap border rounded p-2 max-h-32 overflow-y-auto">
              {candidate.resumeText}
            </p>
          </div>
        )}

        {/* CV review — the first stage's gate */}
        {data.cvFileUrl && (
          <div className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <a
                href={data.cvFileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm font-medium text-primary hover:underline min-w-0"
              >
                <FileText className="h-4 w-4 shrink-0" />
                <span className="truncate">{data.cvFileName ?? t('recruitment.cv.open')}</span>
              </a>
              <Badge className={CV_BADGE[data.cvStatus ?? 'pending']}>
                {t(`recruitment.cv.${data.cvStatus ?? 'pending'}`)}
              </Badge>
            </div>

            {data.cvReviewNote && (
              <p className="text-xs text-muted-foreground">{data.cvReviewNote}</p>
            )}

            <div className="flex flex-wrap gap-2">
              {data.cvStatus !== 'approved' && (
                <Button size="sm" onClick={() => handleReviewCv('approved')}>
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  {t('recruitment.cv.approve')}
                </Button>
              )}
              {data.cvStatus !== 'rejected' && (
                <Button size="sm" variant="outline" onClick={() => handleReviewCv('rejected')}>
                  <XCircle className="h-4 w-4 mr-1" />
                  {t('recruitment.cv.rejectCv')}
                </Button>
              )}
              {data.cvStatus === 'rejected' && (
                <Button size="sm" variant="ghost" onClick={() => handleReviewCv('pending')}>
                  {t('recruitment.cv.reopen')}
                </Button>
              )}
            </div>

            {cvGateBlocks && (
              <p className="text-xs text-amber-600">{t('recruitment.cv.gateHint')}</p>
            )}
          </div>
        )}

        {/* Actions */}
        {data.stage !== 'rejected' && data.stage !== 'hired' && (
          <div className="flex flex-wrap gap-2 border-t pt-3">
            {nextStage && (
              <Button
                size="sm"
                onClick={() => handleMove(nextStage)}
                disabled={cvGateBlocks && CV_GATED_STAGES.has(nextStage)}
              >
                <ArrowRight className="h-4 w-4 mr-1" />
                {t(`recruitment.stage.${nextStage}`, nextStage)}
              </Button>
            )}
            <Button size="sm" variant="destructive" onClick={handleReject}>
              <XCircle className="h-4 w-4 mr-1" />
              {t('recruitment.candidate.reject', 'Reject')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive ml-auto"
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              {t('recruitment.candidate.delete', 'Remove')}
            </Button>
          </div>
        )}
        {(data.stage === 'rejected' || data.stage === 'hired') && (
          <div className="flex justify-end border-t pt-3">
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              {t('recruitment.candidate.delete', 'Remove')}
            </Button>
          </div>
        )}

        {/* Scorecards */}
        {scorecards.length > 0 && (
          <div>
            <p className="text-sm font-semibold mb-2">
              {t('recruitment.scorecards', 'Scorecards')} ({scorecards.length})
            </p>
            {scorecards.map((sc) => (
              <Card key={sc._id} className="mb-2">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{sc.interviewerName}</span>
                    <div className="flex items-center gap-1">
                      <Star className="h-3 w-3 text-yellow-500" />
                      <span className="font-bold">{sc.overallScore}/5</span>
                      <Badge variant="outline" className="text-xs ml-1">
                        {String(t(`recruitment.rec.${sc.recommendation}`, sc.recommendation))}
                      </Badge>
                    </div>
                  </div>
                  {sc.summary && <p className="text-xs text-muted-foreground mt-1">{sc.summary}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Interviews */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold">
              {t('recruitment.interviews', 'Interviews')} ({interviews.length})
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={() => {
                setPrepType(interviews[0]?.type);
                setShowPrep(true);
              }}
            >
              <Sparkles className="h-3 w-3 text-purple-500" />
              {t('interviewPrep.prep', 'AI Prep')}
            </Button>
          </div>
          {interviews.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {t('recruitment.noInterviews', 'No upcoming interviews')}
            </p>
          )}
          {interviews.map((iv) => (
            <div key={iv._id} className="flex items-center gap-2 text-xs p-2 border rounded mb-1">
              <Calendar className="h-3 w-3 text-muted-foreground" />
              <span>{new Date(iv.scheduledAt).toLocaleString()}</span>
              <Badge variant="outline" className="text-xs">
                {String(t(`recruitment.interviewType.${iv.type}`, iv.type))}
              </Badge>
              <span className="text-muted-foreground">{iv.interviewerName}</span>
              <Badge
                className={
                  iv.status === 'completed'
                    ? 'bg-green-100 text-green-800'
                    : iv.status === 'cancelled'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-blue-100 text-blue-800'
                }
              >
                {iv.status}
              </Badge>
            </div>
          ))}
        </div>

        {/* Timeline */}
        {events.length > 0 && (
          <div>
            <p className="text-sm font-semibold mb-2">{t('recruitment.timeline', 'Timeline')}</p>
            {events.map((ev) => (
              <div
                key={ev._id}
                className="flex items-center gap-2 text-xs text-muted-foreground mb-1"
              >
                <Clock className="h-3 w-3" />
                <span>{new Date(ev.createdAt).toLocaleDateString()}</span>
                {ev.fromStage && (
                  <>
                    <Badge variant="outline" className="text-xs">
                      {ev.fromStage}
                    </Badge>
                    <ArrowRight className="h-3 w-3" />
                  </>
                )}
                <Badge className={getStageBadgeColor(ev.toStage) + ' text-xs'}>{ev.toStage}</Badge>
                <span>— {ev.changedByName}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Nested AI Interview Prep dialog */}
      <Dialog open={showPrep} onOpenChange={setShowPrep}>
        {showPrep && (
          <InterviewPrepDialog
            applicationId={applicationId}
            interviewType={prepType}
            onClose={() => setShowPrep(false)}
          />
        )}
      </Dialog>
    </DialogContent>
  );
}

// ============ PIPELINE KANBAN ============

function PipelineView({
  vacancyId,
  userId,
  onSelectCandidate,
}: {
  vacancyId: Id<'vacancies'>;
  userId: Id<'users'>;
  onSelectCandidate: (id: Id<'applications'>) => void;
}) {
  const { t } = useTranslation();
  const candidates = useQuery(api.recruitment.listCandidatesByVacancy, { vacancyId });
  const moveMutation = useMutation(api.recruitment.moveCandidate);

  if (!candidates) return <ShieldLoader />;

  const byStage = STAGES.reduce(
    (acc, stage) => {
      acc[stage] = candidates.filter((c) => c.stage === stage);
      return acc;
    },
    {} as Record<string, typeof candidates>,
  );

  const handleMove = async (appId: Id<'applications'>, newStage: string) => {
    try {
      await moveMutation({
        applicationId: appId,
        newStage: newStage as (typeof STAGES)[number],
        userId,
      });
    } catch (e) {
      toast.error(String(e));
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      {STAGES.map((stage) => {
        const stageIdx = STAGES.indexOf(stage);
        const nextStage = stageIdx < STAGES.length - 1 ? STAGES[stageIdx + 1] : null;
        return (
          <div key={stage} className="border rounded-lg p-3 bg-muted/30">
            <div className="flex items-center justify-between mb-2">
              <Badge className={getStageBadgeColor(stage) + ' text-xs'}>
                {String(t(`recruitment.stage.${stage}`, stage))}
              </Badge>
              <span className="text-xs text-muted-foreground font-medium">
                {byStage[stage]?.length || 0}
              </span>
            </div>
            <div className="space-y-2 min-h-[60px]">
              {(byStage[stage] || []).map((app) => (
                <Card key={app._id} className="cursor-pointer hover:shadow-sm transition-shadow">
                  <CardContent className="p-2">
                    <p
                      className="text-xs font-medium truncate"
                      onClick={() => onSelectCandidate(app._id)}
                    >
                      {app.candidate?.name ?? 'Unknown'}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      {app.avgScore && (
                        <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                          <Star className="h-3 w-3 text-yellow-500" />
                          {app.avgScore}
                        </span>
                      )}
                      {nextStage && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-5 px-1 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMove(app._id, nextStage);
                          }}
                        >
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============ MAIN COMPONENT ============

export default function RecruitmentClient() {
  const { t } = useTranslation();
  const mainRef = useMainRef();
  const user = useAuthUser();
  // Follow the superadmin org selector, like the rest of the dashboard.
  const selectedOrgId = useSelectedOrganization();
  const organizationId = (selectedOrgId ?? user?.organizationId ?? undefined) as
    | Id<'organizations'>
    | undefined;
  const userId = user?.id as Id<'users'> | undefined;
  const userRole = user?.role || 'employee';

  const [showWizard, setShowWizard] = useState(false);
  const [selectedVacancy, setSelectedVacancy] = useState<Id<'vacancies'> | null>(null);
  const [addCandidateVacancy, setAddCandidateVacancy] = useState<Id<'vacancies'> | null>(null);
  const [selectedApplication, setSelectedApplication] = useState<Id<'applications'> | null>(null);
  const [editVacancyId, setEditVacancyId] = useState<Id<'vacancies'> | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: 'vacancy' | 'candidate';
    id: string;
  } | null>(null);
  const [prepFor, setPrepFor] = useState<{
    applicationId: Id<'applications'>;
    interviewType?: 'phone' | 'video' | 'onsite' | 'technical' | 'hr';
  } | null>(null);

  const isAdmin = userRole === 'admin' || userRole === 'superadmin' || userRole === 'supervisor';

  const vacancies = useQuery(
    api.recruitment.listVacancies,
    organizationId ? { organizationId } : 'skip',
  );

  const stats = useQuery(
    api.recruitment.getPipelineStats,
    organizationId ? { organizationId } : 'skip',
  );

  const myInterviews = useQuery(
    api.recruitment.getMyInterviews,
    organizationId && userId ? { organizationId } : 'skip',
  );

  const deleteVacancyMut = useMutation(api.recruitment.deleteVacancy);
  const deleteCandidateMainMut = useMutation(api.recruitment.deleteCandidate);

  if (!user || !organizationId) return <ShieldLoader />;

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      if (deleteConfirm.type === 'vacancy') {
        await deleteVacancyMut({ vacancyId: deleteConfirm.id as Id<'vacancies'> });
        toast.success(t('recruitment.vacancyDeleted', 'Vacancy deleted'));
      } else {
        await deleteCandidateMainMut({ applicationId: deleteConfirm.id as Id<'applications'> });
        toast.success(t('recruitment.candidateRemoved', 'Candidate removed'));
      }
    } catch (e) {
      toast.error(String(e));
    }
    setDeleteConfirm(null);
  };

  return (
    <div className="">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-6 bg-(--background)/95 backdrop-blur supports-backdrop-filter:bg-(--background)/60 border-b border-(--border)">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 py-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              {t('recruitment.title', 'Recruitment')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('recruitment.subtitle', 'Manage vacancies, candidates, and hiring pipeline')}
            </p>
          </div>
          {isAdmin && (
            <Button
              onClick={() => {
                const mainEl = mainRef.current;
                if (mainEl) {
                  mainEl.scrollTo({ top: 0, behavior: 'smooth' });
                }
                window.scrollTo({ top: 0, behavior: 'smooth' });
                setShowWizard(true);
              }}
              className="w-full sm:w-auto"
            >
              <Plus className="h-4 w-4 mr-1" /> {t('recruitment.createVacancy', 'New Vacancy')}
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Briefcase className="w-5 h-5 text-blue-700" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.openVacancies}</p>
                <p className="text-xs text-muted-foreground">
                  {t('recruitment.stats.openVacancies', 'Open Vacancies')}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100">
                <Users className="w-5 h-5 text-purple-700" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalCandidates}</p>
                <p className="text-xs text-muted-foreground">
                  {t('recruitment.stats.totalCandidates', 'Total Candidates')}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <CheckCircle className="w-5 h-5 text-green-700" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.pipeline.hired}</p>
                <p className="text-xs text-muted-foreground">
                  {t('recruitment.stats.hired', 'Hired')}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-100">
                <TrendingUp className="w-5 h-5 text-orange-700" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.pipeline.interview}</p>
                <p className="text-xs text-muted-foreground">
                  {t('recruitment.stats.inInterview', 'In Interview')}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="vacancies">
        <TabsList className="w-full my-4 gap-2 bg-transparent p-0 h-auto grid grid-cols-2 md:grid-cols-4">
          <TabsTrigger
            className="w-full px-4 py-2.5 rounded-xl data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] transition-all duration-200 shadow-sm font-medium flex items-center justify-center"
            value="vacancies"
          >
            {t('recruitment.tabs.vacancies', 'Vacancies')}
          </TabsTrigger>
          <TabsTrigger
            className="w-full px-4 py-2.5 rounded-xl data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] transition-all duration-200 shadow-sm font-medium flex items-center justify-center"
            value="pipeline"
          >
            {t('recruitment.tabs.pipeline', 'Pipeline')}
          </TabsTrigger>
          <TabsTrigger
            className="w-full px-4 py-2.5 rounded-xl data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] transition-all duration-200 shadow-sm font-medium flex items-center justify-center"
            value="interviews"
          >
            {t('recruitment.tabs.interviews', 'My Interviews')}
            {myInterviews && myInterviews.length > 0 && (
              <Badge
                variant="destructive"
                className="ml-1 text-xs h-5 w-5 p-0 flex items-center justify-center rounded-full"
              >
                {myInterviews.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Vacancies Tab */}
        <TabsContent value="vacancies" className="mt-4">
          {!vacancies ? (
            <ShieldLoader />
          ) : vacancies.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Briefcase className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="font-medium">{t('recruitment.empty', 'No vacancies yet')}</p>
                {isAdmin && (
                  <Button
                    className="mt-4"
                    onClick={() => {
                      const mainEl = mainRef.current;
                      if (mainEl) {
                        mainEl.scrollTo({ top: 0, behavior: 'smooth' });
                      }
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                      setShowWizard(true);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1" />{' '}
                    {t('recruitment.createVacancy', 'New Vacancy')}
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {vacancies.map((vac) => (
                <Card key={vac._id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{vac.title}</p>
                          <Badge
                            className={
                              vac.status === 'open'
                                ? 'bg-green-100 text-green-800'
                                : vac.status === 'paused'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-gray-100 text-gray-600'
                            }
                          >
                            {String(t(`recruitment.status.${vac.status}`, vac.status))}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-1">
                          {vac.department && <span>{vac.department}</span>}
                          {vac.location && (
                            <span>
                              <MapPin className="h-3 w-3 inline mr-0.5" />
                              {vac.location}
                            </span>
                          )}
                          <span>
                            <Users className="h-3 w-3 inline mr-0.5" />
                            {vac.candidateCount} {t('recruitment.candidates', 'candidates')}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                        {isAdmin && vac.status === 'open' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setAddCandidateVacancy(vac._id)}
                          >
                            <UserPlus className="h-4 w-4 mr-1" />
                            <span className="hidden sm:inline">
                              {t('recruitment.addCandidate', 'Add')}
                            </span>
                          </Button>
                        )}
                        {isAdmin && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditVacancyId(vac._id)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {isAdmin && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteConfirm({ type: 'vacancy', id: vac._id })}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelectedVacancy(vac._id)}
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {/* Mini pipeline */}
                    <div className="flex gap-1 mt-3">
                      {STAGES.map((stage) => (
                        <div key={stage} className="flex-1">
                          <div
                            className="h-1.5 rounded-full overflow-hidden"
                            style={{ backgroundColor: 'var(--input)' }}
                          >
                            <div
                              className={`h-full rounded-full ${getStageBadgeColor(stage).replace('text-', 'bg-').replace('-800', '-400')}`}
                              style={{
                                width:
                                  vac.candidateCount > 0
                                    ? `${(((vac.stageCounts as Record<string, number>)[stage] ?? 0) / vac.candidateCount) * 100}%`
                                    : '0%',
                              }}
                            />
                          </div>
                          <p className="text-[9px] text-muted-foreground text-center mt-0.5">
                            {(vac.stageCounts as Record<string, number>)[stage] ?? 0}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Pipeline Tab */}
        <TabsContent value="pipeline" className="mt-4">
          {selectedVacancy ? (
            <div>
              <Button
                variant="ghost"
                size="sm"
                className="mb-3"
                onClick={() => setSelectedVacancy(null)}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> {t('common.back', 'Back')}
              </Button>
              <PipelineView
                vacancyId={selectedVacancy}
                userId={userId!}
                onSelectCandidate={setSelectedApplication}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground mb-3">
                {t('recruitment.selectVacancy', 'Select a vacancy to view pipeline:')}
              </p>
              {vacancies
                ?.filter((v) => v.status === 'open')
                .map((vac) => (
                  <Card
                    key={vac._id}
                    className="cursor-pointer hover:shadow-sm"
                    onClick={() => setSelectedVacancy(vac._id)}
                  >
                    <CardContent className="p-3 flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{vac.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {vac.candidateCount} {t('recruitment.candidates', 'candidates')}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </CardContent>
                  </Card>
                ))}
            </div>
          )}
        </TabsContent>

        {/* My Interviews Tab */}
        <TabsContent value="interviews" className="mt-4">
          {!myInterviews ? (
            <ShieldLoader />
          ) : myInterviews.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Calendar className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="font-medium">
                  {t('recruitment.noInterviews', 'No upcoming interviews')}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {myInterviews.map((iv) => (
                <Card key={iv._id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{iv.candidateName}</p>
                      <p className="text-xs text-muted-foreground">{iv.vacancyTitle}</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs shrink-0">
                      <Badge variant="outline">
                        {String(t(`recruitment.interviewType.${iv.type}`, iv.type))}
                      </Badge>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(iv.scheduledAt).toLocaleString()}
                      </span>
                      <span>{iv.duration}min</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1"
                        onClick={() =>
                          setPrepFor({ applicationId: iv.applicationId, interviewType: iv.type })
                        }
                      >
                        <Sparkles className="h-3 w-3 text-purple-500" />
                        {t('interviewPrep.prep', 'Prep')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <Dialog open={showWizard} onOpenChange={setShowWizard}>
        {showWizard && organizationId && userId && (
          <CreateVacancyWizard
            organizationId={organizationId}
            userId={userId}
            onClose={() => setShowWizard(false)}
          />
        )}
      </Dialog>

      <Dialog open={!!addCandidateVacancy} onOpenChange={() => setAddCandidateVacancy(null)}>
        {addCandidateVacancy && organizationId && userId && (
          <AddCandidateDialog
            vacancyId={addCandidateVacancy}
            organizationId={organizationId}
            onClose={() => setAddCandidateVacancy(null)}
          />
        )}
      </Dialog>

      <Dialog open={!!selectedApplication} onOpenChange={() => setSelectedApplication(null)}>
        {selectedApplication && userId && (
          <CandidateDetailDialog
            applicationId={selectedApplication}
            userId={userId}
            onClose={() => setSelectedApplication(null)}
          />
        )}
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('common.confirmDelete', 'Confirm Deletion')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {deleteConfirm?.type === 'vacancy'
              ? t(
                  'recruitment.deleteVacancyConfirm',
                  'This will permanently delete the vacancy and all related applications. This action cannot be undone.',
                )
              : t(
                  'recruitment.deleteCandidateConfirm',
                  'This will remove the candidate from this vacancy. This action cannot be undone.',
                )}
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              {t('common.delete', 'Delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Vacancy Dialog */}
      <Dialog open={!!editVacancyId} onOpenChange={() => setEditVacancyId(null)}>
        {editVacancyId && (
          <EditVacancyDialog vacancyId={editVacancyId} onClose={() => setEditVacancyId(null)} />
        )}
      </Dialog>

      {/* AI Interview Prep Dialog */}
      <Dialog open={!!prepFor} onOpenChange={() => setPrepFor(null)}>
        {prepFor && (
          <InterviewPrepDialog
            applicationId={prepFor.applicationId}
            interviewType={prepFor.interviewType}
            onClose={() => setPrepFor(null)}
          />
        )}
      </Dialog>
    </div>
  );
}

// ============ EDIT VACANCY DIALOG ============

function EditVacancyDialog({
  vacancyId,
  onClose,
}: {
  vacancyId: Id<'vacancies'>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const vacancy = useQuery(api.recruitment.getVacancy, { vacancyId });
  const updateVacancy = useMutation(api.recruitment.updateVacancy);

  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [location, setLocation] = useState('');
  const [employmentType, setEmploymentType] = useState<
    'full_time' | 'part_time' | 'contract' | 'internship'
  >('full_time');
  const [description, setDescription] = useState('');
  const [requirements, setRequirements] = useState('');
  const [salaryMin, setSalaryMin] = useState('');
  const [salaryMax, setSalaryMax] = useState('');
  const [salaryCurrency, setSalaryCurrency] = useState('AMD');
  const [status, setStatus] = useState<'draft' | 'open' | 'paused' | 'closed'>('open');
  const [submitting, setSubmitting] = useState(false);
  const [loaded, setLoaded] = useState(false);

  React.useEffect(() => {
    if (vacancy && !loaded) {
      setTitle(vacancy.title || '');
      setDepartment(vacancy.department || '');
      setLocation(vacancy.location || '');
      setEmploymentType(vacancy.employmentType || 'full_time');
      setDescription(vacancy.description || '');
      setRequirements(vacancy.requirements || '');
      setStatus(vacancy.status || 'open');
      if (vacancy.salary) {
        setSalaryMin(String(vacancy.salary.min || ''));
        setSalaryMax(String(vacancy.salary.max || ''));
        setSalaryCurrency(vacancy.salary.currency || 'AMD');
      }
      setLoaded(true);
    }
  }, [vacancy, loaded]);

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error(t('recruitment.titleRequired', 'Title is required'));
      return;
    }
    setSubmitting(true);
    try {
      await updateVacancy({
        vacancyId,
        title: title.trim(),
        department: department.trim() || undefined,
        location: location.trim() || undefined,
        employmentType,
        description: description.trim() || undefined,
        requirements: requirements.trim() || undefined,
        salary:
          salaryMin && salaryMax
            ? { min: Number(salaryMin), max: Number(salaryMax), currency: salaryCurrency }
            : undefined,
        status,
      });
      toast.success(t('recruitment.vacancyUpdated', 'Vacancy updated'));
      onClose();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (!vacancy)
    return (
      <DialogContent className="sm:max-w-lg">
        <div className="flex justify-center p-8">
          <ShieldLoader />
        </div>
      </DialogContent>
    );

  return (
    <DialogContent className="sm:max-w-lg max-h-[95vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{t('recruitment.editVacancy', 'Edit Vacancy')}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <Label>{t('recruitment.vacancy.title', 'Job Title')}</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t('recruitment.vacancy.department', 'Department')}</Label>
            <Input value={department} onChange={(e) => setDepartment(e.target.value)} />
          </div>
          <div>
            <Label>{t('recruitment.vacancy.location', 'Location')}</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t('recruitment.vacancy.type', 'Employment Type')}</Label>
            <Select
              value={employmentType}
              onValueChange={(v) => setEmploymentType(v as typeof employmentType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full_time">
                  {t('recruitment.type.fullTime', 'Full-time')}
                </SelectItem>
                <SelectItem value="part_time">
                  {t('recruitment.type.partTime', 'Part-time')}
                </SelectItem>
                <SelectItem value="contract">
                  {t('recruitment.type.contract', 'Contract')}
                </SelectItem>
                <SelectItem value="internship">
                  {t('recruitment.type.internship', 'Internship')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t('recruitment.vacancy.status', 'Status')}</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">{t('recruitment.status.open', 'Open')}</SelectItem>
                <SelectItem value="paused">{t('recruitment.status.paused', 'Paused')}</SelectItem>
                <SelectItem value="closed">{t('recruitment.status.closed', 'Closed')}</SelectItem>
                <SelectItem value="draft">{t('recruitment.status.draft', 'Draft')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>{t('recruitment.salary.min', 'Min Salary')}</Label>
            <Input type="number" value={salaryMin} onChange={(e) => setSalaryMin(e.target.value)} />
          </div>
          <div>
            <Label>{t('recruitment.salary.max', 'Max Salary')}</Label>
            <Input type="number" value={salaryMax} onChange={(e) => setSalaryMax(e.target.value)} />
          </div>
          <div>
            <Label>{t('recruitment.salary.currency', 'Currency')}</Label>
            <Input value={salaryCurrency} onChange={(e) => setSalaryCurrency(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>{t('recruitment.vacancy.description', 'Description')}</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
        </div>
        <div>
          <Label>{t('recruitment.vacancy.requirements', 'Requirements')}</Label>
          <Textarea
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
            rows={3}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting ? '...' : t('common.save', 'Save')}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}
