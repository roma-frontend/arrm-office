'use client';

import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Lightbulb, Sparkles } from 'lucide-react';
import { ShieldLoader } from '@/components/ui/ShieldLoader';

interface SmartSuggestionsProps {
  organizationId?: string;
}

export default function SmartSuggestions({ organizationId }: SmartSuggestionsProps) {
  const { t } = useTranslation();
  const suggestions = useQuery(api.admin.getSmartSuggestions, {
    organizationId: organizationId as Id<'organizations'> | undefined,
  });

  if (!suggestions) {
    return (
      <Card className="border-(--border)">
        <CardContent className="flex items-center justify-center p-8">
          <ShieldLoader size="lg" />
        </CardContent>
      </Card>
    );
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'optimization':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/30';
      case 'cost':
        return 'bg-green-500/10 text-green-500 border-green-500/30';
      case 'conflict':
        return 'bg-red-500/10 text-red-500 border-red-500/30';
      case 'policy':
        return 'bg-sky-400/10 text-sky-400 border-sky-400/30';
      default:
        return 'bg-(--surface-3) text-(--text-3) border-(--border-default)';
    }
  };

  return (
    <Card className="border-(--border)">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-sky-400" />
          {t('aiSuggestions.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {suggestions.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <Lightbulb className="mb-3 h-12 w-12 text-sky-400 opacity-50" />
            <p className="text-sm font-medium text-(--text-primary)">
              {t('aiSuggestions.noSuggestions')}
            </p>
            <p className="text-xs text-(--text-secondary)">{t('aiSuggestions.optimal')}</p>
          </div>
        ) : (
          <div className="max-h-[400px] space-y-3 overflow-y-auto">
            {suggestions.map((suggestion) => (
              <div
                key={suggestion.id}
                className={`rounded-lg border p-4 ${getCategoryColor(suggestion.category)}`}
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <Lightbulb className="h-4 w-4" />
                      <p className="font-semibold text-(--text-primary)">
                        {t(
                          suggestion.titleKey,
                          suggestion.descriptionParams as Record<string, unknown>,
                        )}
                      </p>
                    </div>
                    <p className="text-sm text-(--text-primary) opacity-90">
                      {t(
                        suggestion.descriptionKey,
                        suggestion.descriptionParams as Record<string, unknown>,
                      )}
                    </p>
                  </div>
                  {suggestion.impact === 'high' ? (
                    <Badge variant="destructive">{t('aiSuggestions.highImpact')}</Badge>
                  ) : suggestion.impact === 'medium' ? (
                    <Badge variant="secondary">{t('aiSuggestions.mediumImpact')}</Badge>
                  ) : suggestion.impact === 'low' ? (
                    <Badge variant="outline">{t('aiSuggestions.lowImpact')}</Badge>
                  ) : null}
                </div>

                <div className="mt-2">
                  <Badge variant="outline" className="text-xs capitalize">
                    {t(`suggestion.category.${suggestion.category}`)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
