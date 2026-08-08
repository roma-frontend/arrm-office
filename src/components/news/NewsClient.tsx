'use client';

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@/lib/convex-typed';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { motion } from '@/lib/cssMotion';
import { toast } from 'sonner';
import {
  ChevronDown,
  Eye,
  MessageCircle,
  Pin,
  PinOff,
  Plus,
  Search,
  Send,
  SmilePlus,
  Sparkles,
  Trash2,
  Users2,
  Zap,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton, SkeletonText } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { MarkdownMessage } from '@/components/MarkdownMessage';
import { NewsComposer } from './NewsComposer';
import {
  ACCENT,
  CATEGORY_CONFIG,
  CATEGORY_ORDER,
  EMOJI_REACTIONS,
  relativeTime,
  type NewsCategory,
} from './newsCategories';

// ── Types ────────────────────────────────────────────────────────────────────

interface ReactionGroup {
  emoji: string;
  users: Array<{ userId: string; userName: string }>;
}

interface FeedComment {
  _id: string;
  authorName: string;
  authorAvatar?: string;
  content: string;
  createdAt: number;
}

interface FeedItem {
  _id: Id<'announcements'>;
  title: string;
  content: string;
  summary?: string;
  category: NewsCategory;
  isPinned: boolean;
  isUrgent: boolean;
  imageUrl?: string;
  tags?: string[];
  targetDepartment?: Id<'departments'>;
  targetRoles?: string[];
  publishedAt: number;
  viewCount: number;
  authorName: string;
  authorAvatar: string;
  authorRole: string;
  reactionsByEmoji: ReactionGroup[];
  comments: FeedComment[];
  totalComments: number;
  isUnread: boolean;
  myReactions: string[];
  canManage: boolean;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function NewsClient() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const selectedOrgId = useSelectedOrganization();
  const organizationId = (selectedOrgId ?? user?.organizationId ?? undefined) as
    | Id<'organizations'>
    | undefined;

  const [categoryFilter, setCategoryFilter] = useState<'all' | NewsCategory>('all');
  const [search, setSearch] = useState('');
  const [composing, setComposing] = useState(false);

  const feed = useQuery(
    api.news.getNewsFeed,
    organizationId
      ? { organizationId, category: categoryFilter === 'all' ? undefined : categoryFilter }
      : 'skip',
  );
  const stats = useQuery(api.news.getNewsStats, organizationId ? { organizationId } : 'skip');

  // Staff-only actions are gated by `canManage` on each row, which the server
  // computes — the client no longer guesses from the role alone.
  const canPublish =
    user?.role === 'admin' || user?.role === 'supervisor' || user?.role === 'superadmin';

  const items = useMemo(() => {
    const rows = (feed ?? []) as unknown as FeedItem[];
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (row) =>
        row.title.toLowerCase().includes(needle) ||
        row.content.toLowerCase().includes(needle) ||
        row.authorName.toLowerCase().includes(needle),
    );
  }, [feed, search]);

  const featured = items.filter((row) => row.isPinned || row.isUrgent);
  const rest = items.filter((row) => !row.isPinned && !row.isUrgent);

  if (!user || !organizationId) {
    return <FeedSkeleton />;
  }

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 bg-background/80 backdrop-blur-xl border-b">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
              {t('news.title')}
              {stats && stats.unreadCount > 0 && (
                <Badge className="text-white" style={{ backgroundColor: ACCENT }}>
                  {t('news.unreadBadge', { count: stats.unreadCount })}
                </Badge>
              )}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">{t('news.subtitle')}</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 lg:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('news.searchPlaceholder')}
                className="pl-8"
                aria-label={t('news.searchPlaceholder')}
              />
            </div>
            {canPublish && (
              <Button onClick={() => setComposing(true)} className="gap-1.5 shrink-0">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">{t('news.compose.publish')}</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Category chips with live counts */}
      <div className="flex flex-wrap gap-2">
        <Chip
          active={categoryFilter === 'all'}
          label={t('news.allCategories')}
          count={stats?.active}
          onClick={() => setCategoryFilter('all')}
        />
        {CATEGORY_ORDER.map((key) => {
          const cfg = CATEGORY_CONFIG[key];
          const count = stats?.byCategory?.[key];
          if (!count && categoryFilter !== key) return null;
          return (
            <Chip
              key={key}
              active={categoryFilter === key}
              label={t(cfg.labelKey)}
              count={count}
              color={cfg.color}
              icon={cfg.icon}
              onClick={() => setCategoryFilter(key)}
            />
          );
        })}
      </div>

      {feed === undefined ? (
        <FeedSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          canPublish={canPublish}
          searching={search.trim().length > 0}
          onCompose={() => setComposing(true)}
        />
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
          {featured.length > 0 && (
            <section className="space-y-3">
              <SectionLabel icon={Sparkles} text={t('news.featured')} />
              <div className="grid gap-4 lg:grid-cols-2">
                {featured.map((item) => (
                  <FeaturedCard key={item._id} item={item} />
                ))}
              </div>
            </section>
          )}

          {rest.length > 0 && (
            <section className="space-y-3">
              {featured.length > 0 && <SectionLabel icon={MessageCircle} text={t('news.latest')} />}
              <div className="space-y-4 max-w-3xl">
                {rest.map((item) => (
                  <PostCard key={item._id} item={item} />
                ))}
              </div>
            </section>
          )}
        </motion.div>
      )}

      {composing && organizationId && (
        <NewsComposer
          open={composing}
          onClose={() => setComposing(false)}
          organizationId={organizationId}
        />
      )}
    </div>
  );
}

// ── Small pieces ─────────────────────────────────────────────────────────────

function SectionLabel({
  icon: Icon,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
      <Icon className="h-4 w-4" />
      {text}
    </div>
  );
}

function Chip({
  active,
  label,
  count,
  color,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
  color?: string;
  icon?: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
        active
          ? 'border-transparent text-white shadow-sm'
          : 'border-border text-muted-foreground hover:bg-muted'
      }`}
      style={active ? { backgroundColor: color ?? ACCENT } : undefined}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label}
      {count !== undefined && count > 0 && (
        <span className={active ? 'opacity-80' : 'text-muted-foreground/70'}>{count}</span>
      )}
    </button>
  );
}

function AuthorLine({ item }: { item: FeedItem }) {
  const { i18n, t } = useTranslation();
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Avatar className="h-8 w-8">
        <AvatarImage src={item.authorAvatar || undefined} alt="" />
        <AvatarFallback>{item.authorName.charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{item.authorName}</p>
        <p className="text-xs text-muted-foreground">
          {relativeTime(item.publishedAt, i18n.language)}
          {item.authorRole ? ` · ${t(`roles.${item.authorRole}`, item.authorRole)}` : ''}
        </p>
      </div>
    </div>
  );
}

function CategoryChip({ category }: { category: NewsCategory }) {
  const { t } = useTranslation();
  const cfg = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.general;
  const Icon = cfg.icon;
  return (
    <Badge
      variant="outline"
      className="gap-1 font-normal border-transparent"
      style={{ backgroundColor: `${cfg.color}1a`, color: cfg.color }}
    >
      <Icon className="h-3 w-3" />
      {t(cfg.labelKey)}
    </Badge>
  );
}

/** Marks a post whose audience is narrower than the whole company. */
function AudienceChip({ item }: { item: FeedItem }) {
  const { t } = useTranslation();
  if (!item.targetDepartment && !(item.targetRoles && item.targetRoles.length > 0)) return null;
  return (
    <Badge variant="outline" className="gap-1 font-normal">
      <Users2 className="h-3 w-3" />
      {t('news.targeted')}
    </Badge>
  );
}

function EmptyState({
  canPublish,
  searching,
  onCompose,
}: {
  canPublish: boolean;
  searching: boolean;
  onCompose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent className="py-14 text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-muted">
          <MessageCircle className="h-7 w-7 text-muted-foreground/60" />
        </div>
        <h3 className="text-lg font-semibold mb-1">
          {searching ? t('news.noMatches') : t('news.emptyFeed')}
        </h3>
        <p className="mx-auto mb-4 max-w-md text-sm text-muted-foreground">
          {searching ? t('news.noMatchesHint') : t('news.emptyFeedHint')}
        </p>
        {!searching && canPublish && (
          <Button variant="outline" onClick={onCompose}>
            <Plus className="mr-1 h-4 w-4" />
            {t('news.createFirst')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function FeedSkeleton() {
  return (
    <div className="space-y-4 max-w-3xl">
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton variant="circular" width={32} height={32} />
              <div className="space-y-1.5">
                <Skeleton variant="text" width={120} height={12} />
                <Skeleton variant="text" width={80} height={10} />
              </div>
            </div>
            <Skeleton variant="rounded" width="70%" height={20} />
            <SkeletonText lines={3} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Featured (pinned / urgent) ───────────────────────────────────────────────

/**
 * Pinned and urgent posts get a poster treatment: the image becomes the
 * background, everything else sits on top. A noticeboard where the important
 * item looks like every other row is a noticeboard nobody reads.
 */
function FeaturedCard({ item }: { item: FeedItem }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const cfg = CATEGORY_CONFIG[item.category] ?? CATEGORY_CONFIG.general;

  return (
    <Card
      className="group relative overflow-hidden border-0 shadow-sm"
      style={{
        background: item.imageUrl
          ? undefined
          : `linear-gradient(135deg, ${cfg.color}22 0%, ${cfg.color}0a 60%, transparent 100%)`,
      }}
    >
      {item.imageUrl && (
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
          style={{ backgroundImage: `url(${item.imageUrl})` }}
          aria-hidden
        />
      )}
      {item.imageUrl && <div className="absolute inset-0 bg-black/55" aria-hidden />}

      <CardContent className={`relative p-5 space-y-3 ${item.imageUrl ? 'text-white' : ''}`}>
        <div className="flex flex-wrap items-center gap-2">
          {item.isUrgent && (
            <Badge className="gap-1 bg-red-500 text-white hover:bg-red-500">
              <Zap className="h-3 w-3" />
              {t('news.urgent')}
            </Badge>
          )}
          {item.isPinned && (
            <Badge variant="secondary" className="gap-1 font-normal">
              <Pin className="h-3 w-3" />
              {t('news.pinned')}
            </Badge>
          )}
          <CategoryChip category={item.category} />
          <AudienceChip item={item} />
          {item.isUnread && (
            <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: ACCENT }}
                aria-hidden
              />
              {t('news.new')}
            </span>
          )}
        </div>

        <h2 className="text-lg font-bold leading-snug">{item.title}</h2>
        <p className={`text-sm ${item.imageUrl ? 'text-white/85' : 'text-muted-foreground'}`}>
          {item.summary || item.content.slice(0, 160)}
        </p>

        <div className="flex items-center justify-between gap-2 pt-1">
          <AuthorLine item={item} />
          <Button
            size="sm"
            variant={item.imageUrl ? 'secondary' : 'outline'}
            onClick={() => setOpen((prev) => !prev)}
          >
            {open ? t('news.collapse') : t('news.readMore')}
          </Button>
        </div>

        {open && (
          <div className="rounded-xl bg-background/95 p-4 text-foreground">
            <PostBody item={item} />
            <ReactionBar item={item} />
            <CommentSection item={item} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Regular post ─────────────────────────────────────────────────────────────

function PostCard({ item }: { item: FeedItem }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const long = item.content.length > 420;

  return (
    <Card
      className="overflow-hidden transition-shadow hover:shadow-md"
      style={item.isUnread ? { borderColor: ACCENT } : undefined}
    >
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <AuthorLine item={item} />
          <div className="flex items-center gap-1.5">
            {item.isUnread && (
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: ACCENT }}
                aria-label={t('news.new')}
                role="img"
              />
            )}
            <PostMenu item={item} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <CategoryChip category={item.category} />
          <AudienceChip item={item} />
          {item.tags?.slice(0, 3).map((tag) => (
            <span key={tag} className="text-xs text-muted-foreground">
              #{tag}
            </span>
          ))}
        </div>

        <h3 className="text-base font-semibold leading-snug">{item.title}</h3>

        {item.imageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element -- author-supplied external URL */
          <img
            src={item.imageUrl}
            alt=""
            className="max-h-80 w-full rounded-xl object-cover"
            loading="lazy"
          />
        )}

        <div className={!expanded && long ? 'relative max-h-40 overflow-hidden' : undefined}>
          <PostBody item={item} />
          {!expanded && long && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent" />
          )}
        </div>
        {long && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 px-2"
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? t('news.collapse') : t('news.readMore')}
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
          </Button>
        )}

        <ReactionBar item={item} />
        <CommentSection item={item} />
      </CardContent>
    </Card>
  );
}

function PostBody({ item }: { item: FeedItem }) {
  return (
    <div className="text-sm">
      <MarkdownMessage content={item.content} />
    </div>
  );
}

/** Pin and delete, shown only when the server says this reader may manage the post. */
function PostMenu({ item }: { item: FeedItem }) {
  const { t } = useTranslation();
  const togglePin = useMutation(api.news.togglePinAnnouncement);
  const remove = useMutation(api.news.deleteAnnouncement);
  const [busy, setBusy] = useState(false);

  if (!item.canManage) return null;

  const run = async (action: () => Promise<unknown>, successKey: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(t(successKey));
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        disabled={busy}
        aria-label={item.isPinned ? t('news.unpin') : t('news.pin')}
        onClick={() => run(() => togglePin({ announcementId: item._id }), 'news.pinToggled')}
      >
        {item.isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-destructive"
        disabled={busy}
        aria-label={t('common.delete')}
        onClick={() => {
          if (!window.confirm(t('news.confirmDelete'))) return;
          void run(() => remove({ announcementId: item._id }), 'news.announcementDeleted');
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// ── Reactions ────────────────────────────────────────────────────────────────

function ReactionBar({ item }: { item: FeedItem }) {
  const { t } = useTranslation();
  const react = useMutation(api.news.addReaction);
  const [picking, setPicking] = useState(false);

  const toggle = async (emoji: string) => {
    setPicking(false);
    try {
      await react({ announcementId: item._id, emoji });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t('common.error'));
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t pt-3">
      {item.reactionsByEmoji.map((group) => {
        const mine = item.myReactions.includes(group.emoji);
        return (
          <button
            key={group.emoji}
            type="button"
            onClick={() => toggle(group.emoji)}
            title={group.users.map((u) => u.userName).join(', ')}
            className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition-colors hover:bg-muted"
            style={
              mine
                ? {
                    borderColor: ACCENT,
                    color: ACCENT,
                    backgroundColor: 'color-mix(in srgb, var(--primary) 12%, transparent)',
                  }
                : undefined
            }
          >
            <span aria-hidden>{group.emoji}</span>
            {group.users.length}
          </button>
        );
      })}

      <div className="relative">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setPicking((prev) => !prev)}
          aria-label={t('news.addReaction')}
        >
          <SmilePlus className="h-4 w-4" />
        </Button>
        {picking && (
          <div className="absolute bottom-9 left-0 z-20 flex gap-1 rounded-full border bg-popover p-1.5 shadow-lg">
            {EMOJI_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => toggle(emoji)}
                className="rounded-full px-1.5 py-0.5 text-base transition-transform hover:scale-125"
                aria-label={emoji}
              >
                <span aria-hidden>{emoji}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Eye className="h-3.5 w-3.5" />
          {item.viewCount}
        </span>
        <span className="inline-flex items-center gap-1">
          <MessageCircle className="h-3.5 w-3.5" />
          {item.totalComments}
        </span>
      </span>
    </div>
  );
}

// ── Comments ─────────────────────────────────────────────────────────────────

function CommentSection({ item }: { item: FeedItem }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const addComment = useMutation(api.news.addComment);
  const markViewed = useMutation(api.news.incrementViewCount);

  const openThread = () => {
    setOpen((prev) => !prev);
    // Opening the thread is the moment a post is genuinely read, so the view is
    // recorded here rather than on mount, where a scroll past counted as a read.
    if (!open && item.isUnread) {
      void markViewed({ announcementId: item._id }).catch(() => undefined);
    }
  };

  const submit = async () => {
    const content = draft.trim();
    if (!content) return;
    setSending(true);
    try {
      await addComment({ announcementId: item._id, content });
      setDraft('');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t('common.error'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button variant="ghost" size="sm" className="gap-1 px-2" onClick={openThread}>
        <MessageCircle className="h-3.5 w-3.5" />
        {item.totalComments > 0
          ? t('news.commentsCount', { count: item.totalComments })
          : t('news.beFirstToComment')}
      </Button>

      {open && (
        <div className="space-y-3 rounded-xl bg-muted/40 p-3">
          {item.comments.length === 0 && (
            <p className="text-xs text-muted-foreground">{t('news.noComments')}</p>
          )}
          {item.comments.map((comment) => (
            <div key={comment._id} className="flex gap-2">
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarImage src={comment.authorAvatar || undefined} alt="" />
                <AvatarFallback>{comment.authorName.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 rounded-xl bg-background px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium truncate">{comment.authorName}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {relativeTime(comment.createdAt, i18n.language)}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap break-words">{comment.content}</p>
              </div>
            </div>
          ))}

          {item.totalComments > item.comments.length && (
            <p className="text-xs text-muted-foreground">
              {t('news.showingLatest', { count: item.comments.length })}
            </p>
          )}

          <div className="flex items-end gap-2">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t('news.commentPlaceholder')}
              rows={2}
              className="min-h-0 resize-none bg-background"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void submit();
                }
              }}
            />
            <Button
              size="icon"
              onClick={submit}
              disabled={sending || !draft.trim()}
              aria-label={t('news.sendComment')}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
