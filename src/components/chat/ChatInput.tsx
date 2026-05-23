'use client';

import React, { useRef, useState } from 'react';
import { Paperclip, BarChart2, Clock, Mic, Smile, Plus, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import EmojiPicker from './EmojiPicker';
import { VoiceMessageRecorder } from './VoiceMessageRecorder';
import { useTranslation } from 'react-i18next';
import type { ChatConversationMemberInfo } from './types';

interface ChatInputMentionSuggestion {
  userId: string;
  user?: { name?: string; avatarUrl?: string; department?: string } | null;
}

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  canSend: boolean;
  sending: boolean;
  pendingFilesCount: number;
  onAttachFile: () => void;
  onTogglePoll: () => void;
  onToggleSchedule: () => void;
  onToggleVoiceRecorder: () => void;
  onToggleEmoji: () => void;
  showEmoji: boolean;
  showPollCreator: boolean;
  showSchedule: boolean;
  showVoiceRecorder: boolean;
  scheduledFor: string;
  mentionQuery: string | null;
  mentionSuggestions: ChatInputMentionSuggestion[];
  mentionIndex: number;
  setMentionIndex: (index: number) => void;
  insertMention: (name: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  fileInputRef: React.RefObject<HTMLInputElement>;
}

export function ChatInput({
  input,
  setInput,
  onSend,
  onKeyDown,
  onInputChange,
  canSend,
  sending,
  pendingFilesCount,
  onAttachFile,
  onTogglePoll,
  onToggleSchedule,
  onToggleVoiceRecorder,
  onToggleEmoji,
  showEmoji,
  showPollCreator,
  showSchedule,
  showVoiceRecorder,
  scheduledFor,
  mentionQuery,
  mentionSuggestions,
  mentionIndex,
  setMentionIndex,
  insertMention,
  inputRef,
  fileInputRef,
}: ChatInputProps) {
  const { t } = useTranslation();
  const [showMobileActions, setShowMobileActions] = useState(false);

  const handleMobileAction = (action: () => void) => {
    action();
    setShowMobileActions(false);
  };

  return (
    <div
      className="px-2 xs:px-3 sm:px-4 py-4 xs:py-3 border-t shrink-0"
      style={{ borderColor: 'var(--border)', background: 'var(--background)' }}
    >
      <div
        className="flex items-center gap-1.5 xs:gap-2 rounded-2xl border px-2 xs:px-3 py-1.5 xs:py-2 transition-all"
        style={{ borderColor: 'var(--border)', background: 'var(--background-subtle)' }}
      >
        {/* Desktop: show all icons */}
        <button
          onClick={onAttachFile}
          className="hidden xs:flex w-6 xs:w-7 h-6 xs:h-7 items-center justify-center rounded-lg transition-all hover:scale-110 hover:opacity-100 relative group/attach shrink-0"
          style={{
            color: pendingFilesCount > 0 ? 'var(--primary)' : 'var(--text-disabled)',
          }}
          title={t('chat.attachFile')}
          type="button"
        >
          <Paperclip className="w-4 xs:w-4.5 h-4 xs:h-4.5" />
          {pendingFilesCount > 0 && (
            <span
              className="absolute -top-1 -right-1 w-3 h-3 rounded-full text-[7px] xs:text-[8px] font-bold text-white flex items-center justify-center"
              style={{ background: 'var(--primary)' }}
            >
              {pendingFilesCount}
            </span>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
          className="hidden"
          aria-hidden="true"
        />

        <button
          onClick={onTogglePoll}
          className="hidden xs:flex w-6 xs:w-7 h-6 xs:h-7 items-center justify-center rounded-lg transition-all hover:scale-110 shrink-0"
          style={{ color: showPollCreator ? 'var(--primary)' : 'var(--text-disabled)' }}
          title={t('chat.createPollShort')}
        >
          <BarChart2 className="w-4 xs:w-4.5 h-4 xs:h-4.5" />
        </button>

        <button
          onClick={onToggleSchedule}
          className="hidden xs:flex w-6 xs:w-7 h-6 xs:h-7 items-center justify-center rounded-lg transition-all hover:scale-110 shrink-0"
          style={{ color: scheduledFor ? 'var(--primary)' : 'var(--text-disabled)' }}
          title={t('chat.scheduleMessage')}
        >
          <Clock className="w-4 xs:w-4.5 h-4 xs:h-4.5" />
        </button>

        <button
          onClick={onToggleVoiceRecorder}
          className="hidden xs:flex w-6 xs:w-7 h-6 xs:h-7 items-center justify-center rounded-lg transition-all hover:scale-110 shrink-0"
          style={{
            color: showVoiceRecorder ? 'var(--primary)' : 'var(--text-disabled)',
          }}
          title="Voice message"
        >
          <Mic className="w-4 xs:w-4.5 h-4 xs:h-4.5" />
        </button>

        {/* Mobile: single + button */}
        <button
          onClick={() => setShowMobileActions(!showMobileActions)}
          className="xs:hidden w-6 h-6 flex items-center justify-center rounded-lg transition-all shrink-0"
          style={{
            color: showMobileActions ? 'var(--primary)' : 'var(--text-disabled)',
          }}
        >
          {showMobileActions ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        </button>

        <div className="flex-1 relative min-w-0" style={{ height: '20px' }}>
          {mentionQuery !== null && mentionSuggestions.length > 0 && (
            <div
              className="absolute bottom-full left-0 right-0 mb-2 rounded-xl shadow-2xl border overflow-hidden z-50 animate-slide-up"
              style={{ background: 'var(--background)', borderColor: 'var(--border)' }}
            >
              {mentionSuggestions.map((m, idx) => (
                <button
                  key={m.userId}
                  onClick={() => m.user?.name && insertMention(m.user.name)}
                  className="w-full flex items-center gap-2 px-2 xs:px-3 py-1.5 xs:py-2 text-[9px] xs:text-xs transition-all"
                  style={{
                    background: idx === mentionIndex ? 'var(--sidebar-item-active)' : 'transparent',
                    color: idx === mentionIndex ? 'var(--primary)' : 'var(--text-primary)',
                  }}
                  onMouseEnter={() => setMentionIndex(idx)}
                >
                  <Avatar className="w-4 xs:w-5 h-4 xs:h-5 shrink-0">
                    {m.user?.avatarUrl && <AvatarImage src={m.user.avatarUrl} />}
                    <AvatarFallback
                      className="text-[6px] xs:text-[8px] font-bold text-white"
                      style={{ background: 'var(--primary)' }}
                    >
                      {(m.user?.name ?? '?').slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate font-medium text-[9px] xs:text-xs">
                    {m.user?.name ?? 'Unknown'}
                  </span>
                  {m.user?.department && (
                    <span
                      className="text-[7px] xs:text-[9px] truncate ml-auto"
                      style={{ color: 'var(--text-disabled)' }}
                    >
                      {m.user.department}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={inputRef}
            value={input}
            onChange={onInputChange}
            onKeyDown={onKeyDown}
            placeholder={
              pendingFilesCount > 0 ? t('chat.addCaption') : t('chat.messagePlaceholder')
            }
            rows={1}
            className="w-full resize-none bg-transparent outline-none text-xs xs:text-sm leading-5"
            style={{ color: 'var(--text-primary)', maxHeight: '120px' }}
          />
        </div>

        <div className="relative">
          <button
            onClick={onToggleEmoji}
            className="w-6 xs:w-7 h-6 xs:h-7 flex items-center justify-center rounded-lg transition-all hover:scale-110 shrink-0"
            style={{ color: showEmoji ? 'var(--primary)' : 'var(--text-disabled)' }}
          >
            <Smile className="w-4 xs:w-4.5 h-4 xs:h-4.5" />
          </button>
          {showEmoji && (
            <EmojiPicker
              onSelect={(emoji: string) => {
                setInput(input + emoji);
                onToggleEmoji();
              }}
              onClose={onToggleEmoji}
            />
          )}
        </div>

        {showVoiceRecorder && (
          <VoiceMessageRecorder
            onRecordingStart={() => {}}
            onRecordingStop={() => {}}
            onRecordingCancel={() => onToggleVoiceRecorder()}
            disabled={false}
          />
        )}

        <button
          onClick={onSend}
          disabled={!canSend}
          className={`w-7 xs:w-8 h-7 xs:h-8 flex items-center justify-center rounded-xl transition-all hover:scale-105 disabled:opacity-30 disabled:cursor-not-allowed shrink-0 ${canSend ? 'btn-gradient' : ''}`}
          style={{
            background: canSend ? undefined : 'var(--border)',
          }}
        >
          {sending ? (
            <span className="w-3 xs:w-3.5 h-3 xs:h-3.5 flex items-center justify-center">
              <span className="animate-spin">⏳</span>
            </span>
          ) : scheduledFor ? (
            <Clock className="w-3 xs:w-3.5 h-3 xs:h-3.5 text-white" />
          ) : (
            <svg
              className="w-3 xs:w-3.5 h-3 xs:h-3.5 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile actions bottom sheet */}
      {showMobileActions && (
        <div
          className="xs:hidden mt-2 rounded-xl border overflow-hidden animate-slide-up"
          style={{ borderColor: 'var(--border)', background: 'var(--background-subtle)' }}
        >
          <div className="grid grid-cols-4 gap-1 p-2">
            <button
              onClick={() => handleMobileAction(onAttachFile)}
              className="flex flex-col items-center gap-1 py-2 rounded-lg transition-all active:scale-95"
              style={{
                color: pendingFilesCount > 0 ? 'var(--primary)' : 'var(--text-muted)',
              }}
            >
              <Paperclip className="w-5 h-5" />
              <span className="text-[10px]">{t('chat.attachFile', 'File')}</span>
            </button>
            <button
              onClick={() => handleMobileAction(onTogglePoll)}
              className="flex flex-col items-center gap-1 py-2 rounded-lg transition-all active:scale-95"
              style={{ color: showPollCreator ? 'var(--primary)' : 'var(--text-muted)' }}
            >
              <BarChart2 className="w-5 h-5" />
              <span className="text-[10px]">{t('chat.createPollShort', 'Poll')}</span>
            </button>
            <button
              onClick={() => handleMobileAction(onToggleSchedule)}
              className="flex flex-col items-center gap-1 py-2 rounded-lg transition-all active:scale-95"
              style={{ color: scheduledFor ? 'var(--primary)' : 'var(--text-muted)' }}
            >
              <Clock className="w-5 h-5" />
              <span className="text-[10px]">{t('chat.scheduleMessage', 'Schedule')}</span>
            </button>
            <button
              onClick={() => handleMobileAction(onToggleVoiceRecorder)}
              className="flex flex-col items-center gap-1 py-2 rounded-lg transition-all active:scale-95"
              style={{
                color: showVoiceRecorder ? 'var(--primary)' : 'var(--text-muted)',
              }}
            >
              <Mic className="w-5 h-5" />
              <span className="text-[10px]">{t('chat.voiceMessage', 'Voice')}</span>
            </button>
          </div>
        </div>
      )}

      {/* Hint text - hidden on mobile */}
      <p
        className="hidden sm:block text-[11.5px] sm:text-[12px] mt-1 text-center"
        style={{ color: 'var(--text-disabled)' }}
      >
        {t('chat.enterHint')}
      </p>
    </div>
  );
}
