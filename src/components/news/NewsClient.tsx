'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@/lib/convex-typed';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { motion } from '@/lib/cssMotion';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Megaphone,
  Calendar,
  Cake,
  Trophy,
  FileText,
  MessageCircle,
  Zap,
  Plus,
  Pin,
  PinOff,
  Trash2,
  Clock,
  Eye,
  Send,
  Sparkles,
  Newspaper,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

// ── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<
  string,
  {
    icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
    color: string;
    labelKey: string;
  }
> = {
  news: { icon: Newspaper, color: '#3b82f6', labelKey: 'news.category.news' },
  announcement: { icon: Megaphone, color: '#8b5cf6', labelKey: 'news.category.announcement' },
  event: { icon: Calendar, color: '#f59e0b', labelKey: 'news.category.event' },
  birthday: { icon: Cake, color: '#ec4899', labelKey: 'news.category.birthday' },
  achievement: { icon: Trophy, color: '#10b981', labelKey: 'news.category.achievement' },
  policy: { icon: FileText, color: '#06b6d4', labelKey: 'news.category.policy' },
  general: { icon: MessageCircle, color: '#6b7280', labelKey: 'news.category.general' },
};

const EMOJI_REACTIONS = ['👍', '❤️', '😂', '🎉', '🔥', '😮', '👏'];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

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

interface NewsFeedAnnouncement {
  _id: Id<'announcements'>;
  title: string;
  content: string;
  category: 'news' | 'announcement' | 'event' | 'birthday' | 'achievement' | 'policy' | 'general';
  isPinned: boolean;
  isUrgent: boolean;
  imageUrl?: string;
  publishedAt: number;
  viewCount: number;
  authorName: string;
  authorAvatar: string;
  reactionsByEmoji: ReactionGroup[];
  comments: FeedComment[];
  totalComments: number;
}

// ── Create Announcement Dialog ───────────────────────────────────────────────

function CreateAnnouncementDialog({
  open,
  onClose,
  organizationId,
  userId,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: Id<'organizations'>;
  userId: Id<'users'>;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<string>('announcement');
  const [isPinned, setIsPinned] = useState(false);
  const [isUrgent, setIsUrgent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const createAnnouncement = useMutation(api.news.createAnnouncement);

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error(t('news.errors.fillRequired'));
      return;
    }
    setSubmitting(true);
    try {
      await createAnnouncement({
        organizationId,
        authorId: userId,
        title: title.trim(),
        content: content.trim(),
        category: category as
          | 'news'
          | 'announcement'
          | 'event'
          | 'birthday'
          | 'achievement'
          | 'policy'
          | 'general',
        isPinned,
        isUrgent,
      });
      toast.success(t('news.announcementCreated'));
      setTitle('');
      setContent('');
      setCategory('announcement');
      setIsPinned(false);
      setIsUrgent(false);
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-purple-500" />
            {t('news.createAnnouncement')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">{t('news.title')}</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('news.titlePlaceholder')}
              maxLength={200}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">
                {t('news.selectCategory', 'Category')}
              </label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => {
                    const Icon = cfg.icon;
                    return (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4" style={{ color: cfg.color }} />
                          <span>{t(cfg.labelKey)}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">{t('news.options')}</label>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsPinned(!isPinned)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    isPinned
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-600'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <Pin className="w-3 h-3" />
                  {t('news.pin')}
                </button>
                <button
                  type="button"
                  onClick={() => setIsUrgent(!isUrgent)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    isUrgent
                      ? 'bg-red-500/10 border-red-500/30 text-red-600'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <Zap className="w-3 h-3" />
                  {t('news.urgent')}
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">{t('news.content')}</label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t('news.contentPlaceholder')}
              rows={6}
              maxLength={5000}
            />
            <p className="text-xs text-muted-foreground mt-1 text-right">{content.length}/5000</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} className="gap-1.5">
            <Send className="w-4 h-4" />
            {submitting ? t('common.publishing') : t('news.publish')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Comment Section ─────────────────────────────────────────────────────────

function CommentSection({
  announcementId,
  comments,
  totalComments,
  organizationId,
  userId,
  isExpanded,
  onToggle,
  t,
}: {
  announcementId: Id<'announcements'>;
  comments: {
    _id: string;
    authorName: string;
    authorAvatar?: string;
    content: string;
    createdAt: number;
  }[];
  totalComments: number;
  organizationId: Id<'organizations'>;
  userId: Id<'users'>;
  isExpanded: boolean;
  onToggle: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const [newComment, setNewComment] = useState('');
  const addComment = useMutation(api.news.addComment);

  const handleSubmit = async () => {
    if (!newComment.trim()) return;
    try {
      await addComment({
        organizationId,
        announcementId,
        authorId: userId,
        content: newComment.trim(),
      });
      setNewComment('');
      toast.success(t('news.commentAdded'));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    }
  };

  return (
    <div className="mt-3">
      {/* Comment input */}
      <div className="flex gap-2">
        <Input
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder={t('news.writeComment')}
          className="text-sm h-9"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        <Button
          size="sm"
          variant="ghost"
          onClick={handleSubmit}
          disabled={!newComment.trim()}
          className="h-9 w-9 p-0"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>

      {/* Comments list */}
      {comments.length > 0 && (
        <div className="mt-2 space-y-2">
          {comments.map((comment) => (
            <div key={comment._id} className="flex gap-2 text-sm">
              <Avatar className="w-6 h-6 shrink-0 mt-0.5">
                <AvatarImage src={comment.authorAvatar} />
                <AvatarFallback className="text-[8px]">
                  {comment.authorName?.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-xs">{comment.authorName}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {format(comment.createdAt, 'MMM d, HH:mm')}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{comment.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Show more comments link */}
      {totalComments > comments.length && !isExpanded && (
        <button
          onClick={onToggle}
          className="text-xs text-primary hover:underline mt-1 flex items-center gap-1"
        >
          <MessageCircle className="w-3 h-3" />
          {t('news.viewAllComments', { count: totalComments })}
        </button>
      )}
    </div>
  );
}

// ── Announcement Card ────────────────────────────────────────────────────────

function AnnouncementCard({
  announcement,
  organizationId,
  userId,
  userRole,
  t,
  onDelete,
}: {
  announcement: NewsFeedAnnouncement;
  organizationId: Id<'organizations'>;
  userId: Id<'users'>;
  userRole: string;
  t: (key: string) => string;
  onDelete: (id: Id<'announcements'>) => void;
}) {
  const [showComments, setShowComments] = useState(false);
  const [showAllComments, setShowAllComments] = useState(false);
  const addReaction = useMutation(api.news.addReaction);
  const incrementView = useMutation(api.news.incrementViewCount);
  const togglePin = useMutation(api.news.togglePinAnnouncement);

  const categoryConfig = CATEGORY_CONFIG[announcement.category] || CATEGORY_CONFIG.general!;
  const CategoryIcon = categoryConfig.icon;

  // Increment view once on mount (unique per user)
  React.useEffect(() => {
    incrementView({ announcementId: announcement._id, userId });
  }, [announcement._id, userId, incrementView]);

  const timeAgo = getTimeAgo(announcement.publishedAt);

  const isAdmin = userRole === 'admin' || userRole === 'superadmin';

  const reactionsList: Array<{
    emoji: string;
    users: Array<{ userId: string; userName: string }>;
  }> = announcement.reactionsByEmoji ?? [];
  const _totalReactions = reactionsList.reduce((sum: number, r) => sum + r.users.length, 0);

  const _hasMyReaction = reactionsList.some((r) => r.users.some((u) => u.userId === userId));

  const handleReact = async (emoji: string) => {
    try {
      await addReaction({
        organizationId,
        announcementId: announcement._id,
        userId,
        emoji,
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    }
  };

  return (
    <motion.div variants={itemVariants}>
      <Card
        className={`overflow-hidden transition-all duration-200 hover:shadow-md ${
          announcement.isUrgent ? 'ring-1 ring-red-500/30' : ''
        } ${announcement.isPinned ? 'ring-1 ring-amber-500/20' : ''}`}
      >
        <CardContent className="p-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <Avatar className="w-9 h-9 shrink-0">
                <AvatarImage src={announcement.authorAvatar} />
                <AvatarFallback className="text-xs">
                  {announcement.authorName?.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {announcement.isUrgent && (
                    <Badge className="bg-red-500/10 text-red-600 border-red-500/20 text-[10px] px-1.5 py-0 gap-1">
                      <Zap className="w-2.5 h-2.5" />
                      {t('news.urgent')}
                    </Badge>
                  )}
                  {announcement.isPinned && (
                    <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] px-1.5 py-0 gap-1">
                      <Pin className="w-2.5 h-2.5" />
                      {t('news.pinned')}
                    </Badge>
                  )}
                  <Badge
                    className="text-[10px] px-1.5 py-0 gap-1"
                    style={{
                      backgroundColor: `${categoryConfig.color}15`,
                      color: categoryConfig.color,
                      borderColor: `${categoryConfig.color}25`,
                    }}
                  >
                    <CategoryIcon className="w-2.5 h-2.5" />
                    {t(categoryConfig.labelKey)}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  <span className="font-medium text-foreground">{announcement.authorName}</span>
                  <span>·</span>
                  <span className="flex items-center gap-0.5">
                    <Clock className="w-3 h-3" />
                    {timeAgo}
                  </span>
                  <span>·</span>
                  <span className="flex items-center gap-0.5">
                    <Eye className="w-3 h-3" />
                    {announcement.viewCount}
                  </span>
                </div>
              </div>
            </div>

            {/* Admin actions */}
            {isAdmin && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => togglePin({ announcementId: announcement._id, userId })}
                  className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                  title={announcement.isPinned ? t('news.unpin') : t('news.pin')}
                >
                  {announcement.isPinned ? (
                    <PinOff className="w-3.5 h-3.5 text-muted-foreground" />
                  ) : (
                    <Pin className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </button>
                <button
                  onClick={() => onDelete(announcement._id)}
                  className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                  title={t('common.delete')}
                >
                  <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-red-500" />
                </button>
              </div>
            )}
          </div>

          {/* Title */}
          <h3 className="font-semibold text-sm mb-1">{announcement.title}</h3>

          {/* Content */}
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
            {announcement.content}
          </p>

          {/* Image */}
          {announcement.imageUrl && (
            <div className="mt-2 rounded-lg overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={announcement.imageUrl}
                alt={announcement.title}
                className="w-full h-48 object-cover"
              />
            </div>
          )}

          {/* Reactions bar */}
          <div className="flex items-center gap-1.5 mt-3 flex-wrap">
            {/* Emoji reaction buttons */}
            {EMOJI_REACTIONS.map((emoji) => {
              const reactors = reactionsList.find((r) => r.emoji === emoji)?.users ?? [];
              const count = reactors.length;
              const isActive = reactors.some((r) => r.userId === userId);
              return (
                <button
                  key={emoji}
                  onClick={() => handleReact(emoji)}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-all ${
                    isActive
                      ? 'bg-primary/10 text-primary border border-primary/20'
                      : 'bg-muted/50 hover:bg-muted border border-transparent'
                  }`}
                  title={reactors.map((r) => r.userName).join(', ')}
                >
                  <span>{emoji}</span>
                  {count > 0 && <span className="font-medium">{count}</span>}
                </button>
              );
            })}
          </div>

          {/* Action bar */}
          <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border/50">
            <button
              onClick={() => setShowComments(!showComments)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded-lg hover:bg-muted/50"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>{announcement.totalComments ?? 0}</span>
            </button>
            <span className="text-[10px] text-muted-foreground">
              {format(announcement.publishedAt, 'MMM d, yyyy HH:mm')}
            </span>
          </div>

          {/* Comments section */}
          {showComments && (
            <CommentSection
              announcementId={announcement._id}
              comments={announcement.comments ?? []}
              totalComments={announcement.totalComments ?? 0}
              organizationId={organizationId}
              userId={userId}
              isExpanded={showAllComments}
              onToggle={() => setShowAllComments(!showAllComments)}
              t={t}
            />
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function NewsClient() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const selectedOrgId = useSelectedOrganization();
  const organizationId = (selectedOrgId ?? user?.organizationId ?? undefined) as
    | Id<'organizations'>
    | undefined;

  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const newsFeed = useQuery(
    api.news.getNewsFeed,
    organizationId
      ? {
          organizationId,
          category:
            categoryFilter !== 'all'
              ? (categoryFilter as
                  | 'news'
                  | 'announcement'
                  | 'event'
                  | 'birthday'
                  | 'achievement'
                  | 'policy'
                  | 'general')
              : undefined,
        }
      : 'skip',
  );

  const newsStats = useQuery(api.news.getNewsStats, organizationId ? { organizationId } : 'skip');

  const deleteAnnouncement = useMutation(api.news.deleteAnnouncement);

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  const handleDelete = async (id: Id<'announcements'>) => {
    if (!confirm(t('news.confirmDelete'))) return;
    try {
      await deleteAnnouncement({ announcementId: id, userId: user!.id as Id<'users'> });
      toast.success(t('news.announcementDeleted'));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    }
  };

  if (!user || !organizationId) return <ShieldLoader />;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
              <Megaphone className="w-7 h-7 text-purple-500" />
              {t('news.title')}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">{t('news.subtitle')}</p>
          </div>
          {isAdmin && (
            <Button onClick={() => setShowCreateDialog(true)} className="gap-1.5 w-full sm:w-auto">
              <Plus className="w-4 h-4" />
              {t('news.createAnnouncement')}
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      {newsStats && (
        <motion.div variants={itemVariants}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-3 flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-500/10">
                  <Newspaper className="w-4 h-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-lg font-bold">{newsStats.active}</p>
                  <p className="text-[10px] text-muted-foreground">{t('news.activePosts')}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-500/10">
                  <Pin className="w-4 h-4 text-amber-500" />
                </div>
                <div>
                  <p className="text-lg font-bold">{newsStats.pinned}</p>
                  <p className="text-[10px] text-muted-foreground">{t('news.pinned')}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-red-500/10">
                  <Zap className="w-4 h-4 text-red-500" />
                </div>
                <div>
                  <p className="text-lg font-bold">{newsStats.urgent}</p>
                  <p className="text-[10px] text-muted-foreground">{t('news.urgent')}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-green-500/10">
                  <Sparkles className="w-4 h-4 text-green-500" />
                </div>
                <div>
                  <p className="text-lg font-bold">{newsStats.recentCount}</p>
                  <p className="text-[10px] text-muted-foreground">{t('news.thisWeek')}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.div>
      )}

      {/* Category Filter */}
      <motion.div variants={itemVariants}>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setCategoryFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              categoryFilter === 'all'
                ? 'bg-primary text-white shadow-sm'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted'
            }`}
          >
            {t('news.allCategories')}
          </button>
          {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => {
            const Icon = cfg.icon;
            return (
              <button
                key={key}
                onClick={() => setCategoryFilter(key)}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  categoryFilter === key
                    ? 'text-white shadow-sm'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
                style={
                  categoryFilter === key
                    ? { backgroundColor: cfg.color }
                    : { backgroundColor: 'transparent' }
                }
              >
                <Icon className="w-3 h-3" />
                {t(cfg.labelKey)}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* News Feed */}
      {newsFeed === undefined ? (
        <ShieldLoader />
      ) : newsFeed.length === 0 ? (
        <motion.div variants={itemVariants}>
          <Card>
            <CardContent className="py-12 text-center">
              <Megaphone className="w-14 h-14 mx-auto text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-semibold mb-1">{t('news.emptyFeed')}</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
                {t('news.emptyFeedHint')}
              </p>
              {isAdmin && (
                <Button onClick={() => setShowCreateDialog(true)} variant="outline">
                  <Plus className="w-4 h-4 mr-1" />
                  {t('news.createFirst')}
                </Button>
              )}
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <div className="space-y-3 max-w-2xl">
          {newsFeed.map((announcement) => (
            <AnnouncementCard
              key={announcement._id}
              announcement={announcement}
              organizationId={organizationId}
              userId={user.id as Id<'users'>}
              userRole={user.role}
              t={t}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Create Dialog */}
      {showCreateDialog && organizationId && (
        <CreateAnnouncementDialog
          open={showCreateDialog}
          onClose={() => setShowCreateDialog(false)}
          organizationId={organizationId}
          userId={user.id as Id<'users'>}
        />
      )}
    </motion.div>
  );
}

// ── Helper ───────────────────────────────────────────────────────────────────

function getTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return format(timestamp, 'MMM d');
}
