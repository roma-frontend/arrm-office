'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  User,
  Heart,
  Star,
  Award,
  MessageSquare,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';
import { EmployeeHoverCard } from '@/components/employees/EmployeeHoverCard';

const CategoryBadge = ({ category }: { category: string }) => {
  const { t } = useTranslation();
  const categoryIcons: Record<string, LucideIcon> = {
    teamwork: Users,
    innovation: Star,
    leadership: Award,
    dedication: Heart,
    customer_focus: User,
    mentorship: MessageSquare,
    excellence: Star,
    above_and_beyond: Award,
  };

  const Icon = categoryIcons[category] || Heart;

  return (
    <Badge variant="secondary" className="flex items-center gap-1">
      <Icon className="h-3 w-3" />
      {t(
        `recognitionCategories.${category}`,
        category.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
      )}
    </Badge>
  );
};

export default function RecognitionDetailClient() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const { t, i18n } = useTranslation();
  const kudoId = params.id as Id<'kudos'>;

  const dateLocale = i18n.language === 'ru' ? ru : i18n.language === 'hy' ? hy : enUS;

  const kudo = useQuery(api.recognition.getKudoById, { kudoId });
  const _currentUser = useQuery(
    api.users.queries.getUserById,
    user?.id ? { userId: user.id as Id<'users'> } : 'skip',
  );

  if (!kudo || !kudo.sender || !kudo.receiver) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const createdAt = new Date(kudo.createdAt);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/recognition')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{t('recognition.kudoDetails')}</h1>
          <p className="text-muted-foreground">
            {t('recognition.from')} {kudo.sender.name} {t('recognition.to')} {kudo.receiver.name}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="h-12 w-12">
                <AvatarImage src={kudo.sender.avatarUrl} />
                <AvatarFallback>{kudo.sender.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div>
                <EmployeeHoverCard
                  userId={kudo.sender._id as unknown as string}
                  name={kudo.sender.name}
                >
                  <p className="font-medium cursor-pointer hover:underline hover:underline-offset-2">
                    {kudo.sender.name}
                  </p>
                </EmployeeHoverCard>
                <p className="text-sm text-muted-foreground">{t('recognition.sender')}</p>
              </div>
            </div>
            <div className="text-right">
              <CategoryBadge category={kudo.category} />
              <p className="text-xs text-muted-foreground mt-1">
                {format(createdAt, 'dd MMM yyyy HH:mm', { locale: dateLocale })}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-center">
            <ArrowLeft className="h-6 w-6 text-muted-foreground rotate-180" />
          </div>

          <div className="flex items-center gap-4 justify-center">
            <Avatar className="h-12 w-12">
              <AvatarImage src={kudo.receiver.avatarUrl} />
              <AvatarFallback>{kudo.receiver.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <EmployeeHoverCard
                userId={kudo.receiver._id as unknown as string}
                name={kudo.receiver.name}
              >
                <p className="font-medium cursor-pointer hover:underline hover:underline-offset-2">
                  {kudo.receiver.name}
                </p>
              </EmployeeHoverCard>
              <p className="text-sm text-muted-foreground">{t('recognition.receiver')}</p>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="font-medium mb-2">{t('recognition.form.message')}</h3>
            <p className="text-muted-foreground italic">"{kudo.message}"</p>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Heart className="h-4 w-4 text-(--danger-text)" />
              <span className="text-sm">
                {kudo.reactions?.length || 0} {t('recognition.reactions')}
              </span>
            </div>
            <Badge variant={kudo.isPublic ? 'default' : 'secondary'}>
              {kudo.isPublic ? t('recognition.public') : t('recognition.private')}
            </Badge>
          </div>

          {kudo.reactions && kudo.reactions.length > 0 && (
            <div className="border-t pt-4">
              <h3 className="font-medium mb-3">{t('recognition.reactions')}</h3>
              <div className="flex flex-wrap gap-2">
                {kudo.reactions.map(
                  (
                    reaction: { userId: string; emoji: string; createdAt: number },
                    index: number,
                  ) => (
                    <Badge key={index} variant="outline" className="flex items-center gap-1">
                      {reaction.emoji}
                      <span className="text-xs">{reaction.userId}</span>
                    </Badge>
                  ),
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('recognition.context')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">{t('recognition.categoryLabel')}</p>
              <p className="font-medium capitalize">
                {/* i18n type */}
                {t(`recognitionCategories.${kudo.category}`, kudo.category.replace('_', ' '))}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('recognition.visibility')}</p>
              <p className="font-medium">
                {kudo.isPublic ? t('recognition.public') : t('recognition.private')}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('recognition.date')}</p>
              <p className="font-medium">
                {format(createdAt, 'dd MMM yyyy', { locale: dateLocale })}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('recognition.time')}</p>
              <p className="font-medium">{format(createdAt, 'HH:mm', { locale: dateLocale })}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
