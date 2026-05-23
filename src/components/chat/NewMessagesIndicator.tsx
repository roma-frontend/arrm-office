'use client';

import React from 'react';
import { ArrowDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface NewMessagesIndicatorProps {
  count: number;
  onClick: () => void;
}

export function NewMessagesIndicator({ count, onClick }: NewMessagesIndicatorProps) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full shadow-lg flex items-center gap-2 animate-bounce-in z-10"
      style={{
        background: 'var(--primary)',
        color: 'var(--text-on-primary)',
      }}
    >
      <span className="text-xs font-medium">{t('chat.newMessages', { count })}</span>
      <ArrowDown className="w-3.5 h-3.5" />
    </button>
  );
}
