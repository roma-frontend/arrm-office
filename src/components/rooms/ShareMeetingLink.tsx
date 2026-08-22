'use client';

/**
 * ShareMeetingLink — a polished dialog for sharing a video conference link
 * with external clients. Shows platform branding, the meeting link with a
 * copy button, and optional details (time, attendees).
 */

import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, ExternalLink, Video } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type VideoProvider = 'livekit' | 'teams' | 'zoom' | 'meet';

interface ShareMeetingLinkProps {
  open: boolean;
  onClose: () => void;
  provider: VideoProvider;
  videoUrl: string;
  meetingTitle?: string;
  meetingTime?: string;
}

const PROVIDER_CONFIG: Record<
  VideoProvider,
  { label: string; color: string; bgColor: string; icon: string; baseUrl?: string }
> = {
  livekit: {
    label: 'LiveKit',
    color: '#fff',
    bgColor: '#0a0c12',
    icon: '🎥',
  },
  teams: {
    label: 'Microsoft Teams',
    color: '#fff',
    bgColor: '#6264A7',
    icon: '💼',
    baseUrl: 'https://teams.microsoft.com',
  },
  zoom: {
    label: 'Zoom',
    color: '#fff',
    bgColor: '#2D8CFF',
    icon: '📹',
    baseUrl: 'https://zoom.us',
  },
  meet: {
    label: 'Google Meet',
    color: '#fff',
    bgColor: '#00897B',
    icon: '🟢',
    baseUrl: 'https://meet.google.com',
  },
};

function buildFullUrl(videoUrl: string): string {
  if (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
    return videoUrl;
  }
  // Relative path (e.g. "meetings/room-name") — prepend the current origin
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/${videoUrl.replace(/^\//, '')}`;
  }
  return videoUrl;
}

export function ShareMeetingLink({
  open,
  onClose,
  provider,
  videoUrl,
  meetingTitle,
  meetingTime,
}: ShareMeetingLinkProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const config = PROVIDER_CONFIG[provider];
  const fullUrl = buildFullUrl(videoUrl);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      toast.success(t('rooms.share.copied', 'Link copied to clipboard'));
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error(t('rooms.share.copyFailed', 'Failed to copy link'));
    }
  }, [fullUrl, t]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md overflow-hidden p-0">
        {/* Platform color header */}
        <div
          className="relative flex items-center justify-center px-6 py-8"
          style={{ background: config.bgColor }}
        >
          <div className="pointer-events-none absolute inset-0 opacity-10">
            <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white" />
            <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-white" />
          </div>
          <div className="relative z-10 flex flex-col items-center text-center">
            <span className="mb-3 text-4xl">{config.icon}</span>
            <h3 className="text-lg font-bold text-white">{config.label}</h3>
            <p className="mt-1 text-sm text-white/80">
              {t('rooms.share.ready', 'Your meeting link is ready to share')}
            </p>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          {/* Meeting info */}
          {meetingTitle && (
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-(--primary)/10">
                <Video className="h-4 w-4 text-(--primary)" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-(--text-primary)">
                  {meetingTitle}
                </p>
                {meetingTime && <p className="text-xs text-(--text-muted)">{meetingTime}</p>}
              </div>
            </div>
          )}

          {/* Link display */}
          <div className="rounded-xl border border-(--border) bg-(--background-subtle) p-3">
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={fullUrl}
                className="flex-1 truncate bg-transparent text-sm text-(--text-primary) outline-none"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <Button
                size="sm"
                variant={copied ? 'default' : 'outline'}
                className={cn(
                  'shrink-0 gap-1.5',
                  copied && 'bg-emerald-500 text-white hover:bg-emerald-600',
                )}
                onClick={handleCopy}
              >
                <AnimatePresence mode="wait">
                  {copied ? (
                    <motion.span
                      key="check"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </motion.span>
                  ) : (
                    <motion.span
                      key="copy"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </motion.span>
                  )}
                </AnimatePresence>
                {copied ? t('rooms.share.copiedLabel', 'Copied!') : t('rooms.share.copy', 'Copy')}
              </Button>
            </div>
          </div>

          {/* Instruction text */}
          <div className="space-y-2 rounded-lg border border-(--border) bg-(--background-subtle) px-3 py-2.5 text-xs text-(--text-muted)">
            <p className="font-medium text-(--text-primary)">
              {t('rooms.share.howToShare', 'How to share with guests:')}
            </p>
            <ul className="list-inside list-disc space-y-1">
              {provider === 'teams' && (
                <>
                  <li>{t('rooms.share.teamsTip1', 'Paste the link in a Teams chat or email')}</li>
                  <li>{t('rooms.share.teamsTip2', 'Guests can join without a Teams account')}</li>
                </>
              )}
              {provider === 'zoom' && (
                <>
                  <li>{t('rooms.share.zoomTip1', 'Send the link via email or messaging app')}</li>
                  <li>
                    {t('rooms.share.zoomTip2', 'Guests join via browser — no Zoom app needed')}
                  </li>
                </>
              )}
              {provider === 'meet' && (
                <>
                  <li>
                    {t('rooms.share.meetTip1', 'Share the link in an email or calendar invite')}
                  </li>
                  <li>{t('rooms.share.meetTip2', 'Guests can join from any browser')}</li>
                </>
              )}
              {provider === 'livekit' && (
                <>
                  <li>
                    {t('rooms.share.livekitTip1', 'Share the link for the built-in video room')}
                  </li>
                  <li>{t('rooms.share.livekitTip2', 'Works in any modern browser')}</li>
                </>
              )}
            </ul>
          </div>

          {/* Footer buttons */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose}>
              {t('buttons.close', 'Close')}
            </Button>
            {config.baseUrl && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => window.open(fullUrl, '_blank')}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t('rooms.share.openPlatform', 'Open in')} {config.label}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
