'use client';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useScrollLock } from '@/hooks/useScrollLock';

/**
 * Shared dialog frame for the meeting-room modals.
 *
 * Extracted because the three room dialogs (form, booking, details) only differ
 * in their body — duplicating the portal, backdrop, escape handling and scroll
 * lock three times is how those behaviours drift apart.
 *
 * The panel fades and scales in place (`modal-panel-in`) rather than using the
 * app's generic `fade-in`, which also translates upwards and made centred
 * dialogs look like they jumped on open.
 */
export function RoomModalShell({
  open,
  onClose,
  title,
  subtitle,
  icon,
  accent,
  footer,
  size = 'md',
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  /** Colour used for the header wash — usually the room's accent colour. */
  accent?: string;
  footer?: React.ReactNode;
  size?: 'md' | 'lg';
  children: React.ReactNode;
}) {
  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (typeof document === 'undefined' || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="modal-backdrop-in absolute inset-0 bg-black/60 backdrop-blur-md"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'modal-panel-in relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-3xl bg-(--card) shadow-2xl',
          size === 'lg' ? 'max-w-3xl' : 'max-w-xl',
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative shrink-0 overflow-hidden px-6 pt-5 pb-4">
          <div
            className="absolute inset-0 opacity-15"
            style={{
              background: `linear-gradient(135deg, ${accent ?? 'var(--primary)'} 0%, transparent 70%)`,
            }}
            aria-hidden="true"
          />
          <div className="relative flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {icon && (
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg"
                  style={{ background: accent ?? 'var(--primary)' }}
                >
                  {icon}
                </div>
              )}
              <div className="min-w-0">
                <h3 className="truncate text-xl font-bold text-(--text-primary)">{title}</h3>
                {subtitle && (
                  <p className="mt-0.5 truncate text-sm text-(--text-muted)">{subtitle}</p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 cursor-pointer rounded-full p-2 text-(--text-muted) transition-colors hover:bg-(--background-subtle) hover:text-(--text-primary)"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-4 scrollbar-thin scrollbar-thumb-(--border) scrollbar-track-transparent">
          {children}
        </div>

        {footer && (
          <div className="shrink-0 border-t border-(--border) bg-(--background-subtle) px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
