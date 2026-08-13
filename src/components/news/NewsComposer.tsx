'use client';

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@/lib/convex-typed';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AiTextActions } from '@/components/ai/AiTextActions';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Globe, Image as ImageIcon, Pin, Users2, Zap } from 'lucide-react';
import { CATEGORY_CONFIG, type NewsCategory } from './newsCategories';

const TARGET_ROLES = ['admin', 'supervisor', 'employee', 'driver'] as const;
type TargetRole = (typeof TARGET_ROLES)[number];

interface NewsComposerProps {
  open: boolean;
  onClose: () => void;
  organizationId: Id<'organizations'>;
}

/**
 * Publish dialog.
 *
 * Targeting is the part that was missing: `targetDepartment` and `targetRoles`
 * existed in the schema and were silently dropped, so "for HR only" was not
 * expressible from the UI at all. Now the audience is chosen here and enforced
 * server-side, and the dialog says how many people will be notified rather than
 * leaving that to be discovered.
 */
export function NewsComposer({ open, onClose, organizationId }: NewsComposerProps) {
  const { t } = useTranslation();
  const createAnnouncement = useMutation(api.news.createAnnouncement);
  const departments = useQuery(api.departments.list, { organizationId });

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [summary, setSummary] = useState('');
  const [category, setCategory] = useState<NewsCategory>('announcement');
  const [imageUrl, setImageUrl] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [isUrgent, setIsUrgent] = useState(false);
  const [targetDepartment, setTargetDepartment] = useState<string>('');
  const [targetRoles, setTargetRoles] = useState<TargetRole[]>([]);
  const [expiresAt, setExpiresAt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const audienceLabel = useMemo(() => {
    const parts: string[] = [];
    if (targetDepartment) {
      const dept = (departments ?? []).find((d) => d._id === targetDepartment);
      if (dept) parts.push(dept.name);
    }
    if (targetRoles.length > 0) {
      parts.push(targetRoles.map((role) => t(`roles.${role}`, role)).join(', '));
    }
    return parts.length > 0 ? parts.join(' · ') : t('news.compose.everyone');
  }, [departments, targetDepartment, targetRoles, t]);

  const toggleRole = (role: TargetRole) => {
    setTargetRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  };

  const submit = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error(t('news.compose.fillRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const result = await createAnnouncement({
        organizationId,
        title: title.trim(),
        content: content.trim(),
        summary: summary.trim() || undefined,
        category,
        isPinned,
        isUrgent,
        imageUrl: imageUrl.trim() || undefined,
        targetDepartment: targetDepartment ? (targetDepartment as Id<'departments'>) : undefined,
        targetRoles: targetRoles.length > 0 ? targetRoles : undefined,
        expiresAt: expiresAt ? new Date(expiresAt).getTime() : undefined,
      });
      toast.success(t('news.compose.published', { count: result.notified ?? 0 }));
      onClose();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t('news.compose.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('news.compose.title')}</DialogTitle>
          <DialogDescription>{t('news.compose.subtitle')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Category */}
          <div className="space-y-2">
            <Label>{t('news.compose.category')}</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(CATEGORY_CONFIG) as NewsCategory[]).map((key) => {
                const cfg = CATEGORY_CONFIG[key];
                const Icon = cfg.icon;
                const active = category === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCategory(key)}
                    aria-pressed={active}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                      active
                        ? 'border-transparent text-white shadow-sm'
                        : 'border-border text-muted-foreground hover:bg-muted'
                    }`}
                    style={active ? { backgroundColor: cfg.color } : undefined}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t(cfg.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="news-title">{t('news.compose.headline')}</Label>
            <Input
              id="news-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t('news.compose.headlinePlaceholder')}
              maxLength={200}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="news-content">{t('news.compose.body')}</Label>
            <Textarea
              id="news-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder={t('news.compose.bodyPlaceholder')}
              rows={8}
            />
            {/* An announcement goes to the whole company, so tone and length are
                the two things authors most often want a second pass on — and
                translation matters here more than anywhere: the same post has to
                land for four interface languages. */}
            <AiTextActions
              value={content}
              onChange={setContent}
              context="company announcement"
              actions={['improve', 'shorten', 'professional', 'proofread', 'translate']}
            />
            <p className="text-xs text-muted-foreground">{t('news.compose.markdownHint')}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="news-summary">{t('news.compose.summary')}</Label>
            <Input
              id="news-summary"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder={t('news.compose.summaryPlaceholder')}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="news-image" className="flex items-center gap-1.5">
                <ImageIcon className="h-3.5 w-3.5" />
                {t('news.compose.image')}
              </Label>
              <Input
                id="news-image"
                value={imageUrl}
                onChange={(event) => setImageUrl(event.target.value)}
                placeholder="https://…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="news-expires">{t('news.compose.expires')}</Label>
              <Input
                id="news-expires"
                type="date"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
            </div>
          </div>

          {/* Audience */}
          <div className="rounded-xl border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Users2 className="h-4 w-4" />
              <span className="text-sm font-medium">{t('news.compose.audience')}</span>
              <Badge variant="secondary" className="ml-auto font-normal gap-1">
                <Globe className="h-3 w-3" />
                {audienceLabel}
              </Badge>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="news-department">{t('news.compose.department')}</Label>
              <Select
                value={targetDepartment || 'all'}
                onValueChange={(value) => setTargetDepartment(value === 'all' ? '' : value)}
              >
                <SelectTrigger id="news-department">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('news.compose.allDepartments')}</SelectItem>
                  {(departments ?? []).map((dept) => (
                    <SelectItem key={dept._id} value={dept._id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('news.compose.roles')}</Label>
              <div className="flex flex-wrap gap-3">
                {TARGET_ROLES.map((role) => (
                  <label key={role} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={targetRoles.includes(role)}
                      onCheckedChange={() => toggleRole(role)}
                    />
                    {t(`roles.${role}`, role)}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{t('news.compose.rolesHint')}</p>
            </div>
          </div>

          {/* Emphasis */}
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={isPinned}
                onCheckedChange={(checked) => setIsPinned(checked === true)}
              />
              <Pin className="h-3.5 w-3.5" />
              {t('news.compose.pin')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={isUrgent}
                onCheckedChange={(checked) => setIsUrgent(checked === true)}
              />
              <Zap className="h-3.5 w-3.5 text-red-500" />
              {t('news.compose.urgent')}
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={submitting || !title.trim() || !content.trim()}>
            {submitting ? t('common.sending') : t('news.compose.publish')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
