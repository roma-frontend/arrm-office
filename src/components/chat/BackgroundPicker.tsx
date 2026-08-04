'use client';

import React from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { X, Palette } from 'lucide-react';
import { CHAT_BACKGROUNDS, getBackgroundsByCategory } from '@/lib/chatBackgrounds';
import { useTranslation } from 'react-i18next';
import { logger } from '@/lib/logger';

interface Props {
  userId: Id<'users'>;
  currentBackground: string | undefined;
  onSelect: (bgId: string) => void;
  onClose: () => void;
}

const CATEGORIES: Array<{ key: (typeof CHAT_BACKGROUNDS)[number]['category']; label: string }> = [
  { key: 'neutral', label: 'Neutral' },
  { key: 'warm', label: 'Warm' },
  { key: 'cool', label: 'Cool' },
  { key: 'nature', label: 'Nature' },
];

export const BackgroundPicker = React.memo(function BackgroundPicker({
  userId,
  currentBackground,
  onSelect,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const updateChatBackground = useMutation(api.users.mutations.updateChatBackground);
  const [selectedCategory, setSelectedCategory] =
    React.useState<(typeof CHAT_BACKGROUNDS)[number]['category']>('neutral');

  const handleSelect = async (bgId: string) => {
    onSelect(bgId);
    try {
      await updateChatBackground({ userId, backgroundId: bgId });
    } catch (err) {
      logger.error('Failed to save chat background:', err);
    }
  };

  // Lock body scroll when modal is open
  React.useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const filtered = getBackgroundsByCategory(selectedCategory);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md max-h-[85vh] sm:rounded-2xl rounded-t-2xl shadow-2xl border flex flex-col animate-slide-up"
        style={{ background: 'var(--background)', borderColor: 'var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b shrink-0"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--primary)' }}
            >
              <Palette className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              {t('chat.chatBackground', 'Chat Background')}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:opacity-70 transition-opacity"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Category tabs */}
        <div
          className="flex gap-1 px-5 py-3 border-b shrink-0"
          style={{ borderColor: 'var(--border)' }}
        >
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setSelectedCategory(cat.key)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: selectedCategory === cat.key ? 'var(--primary)' : 'transparent',
                color: selectedCategory === cat.key ? 'white' : 'var(--text-muted)',
              }}
            >
              {t(`chat.bgCategory.${cat.key}`, cat.label)}
            </button>
          ))}
        </div>

        {/* Background grid */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-3 gap-3">
            {filtered.map((bg) => {
              const isActive = currentBackground === bg.id;
              return (
                <button
                  key={bg.id}
                  onClick={() => handleSelect(bg.id)}
                  className="relative aspect-square rounded-xl overflow-hidden border-2 transition-all group"
                  style={{
                    borderColor: isActive ? 'var(--primary)' : 'var(--border)',
                    background: bg.type === 'pattern' ? '#f0f0f0' : undefined,
                  }}
                >
                  {/* Background preview */}
                  <div
                    className="absolute inset-0"
                    style={{
                      background: bg.type === 'solid' ? bg.value : undefined,
                      backgroundImage:
                        bg.type === 'gradient' || bg.type === 'pattern' ? bg.value : undefined,
                    }}
                  />
                  {/* Active checkmark */}
                  {isActive && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center"
                        style={{ background: 'var(--primary)' }}
                      >
                        <svg
                          className="w-4 h-4 text-white"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={3}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    </div>
                  )}
                  {/* Label */}
                  <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/50 to-transparent">
                    <span className="text-[10px] font-medium text-white drop-shadow-sm">
                      {t(`chat.bgName.${bg.id}`, bg.name)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer hint */}
        <div
          className="px-5 py-3 border-t text-center shrink-0"
          style={{ borderColor: 'var(--border)', background: 'var(--background-subtle)' }}
        >
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {t('chat.bgHint', 'Choose a background for your chat conversations')}
          </p>
        </div>
      </div>
    </div>
  );
});
