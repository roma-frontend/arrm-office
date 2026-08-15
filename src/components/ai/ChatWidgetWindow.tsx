'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { TFunction } from 'i18next';
import type { i18n as I18nInstance } from 'i18next';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import {
  X,
  Send,
  Sparkles,
  CheckCircle,
  AlertCircle,
  Calendar,
  Pencil,
  Trash2,
  Mic,
  MicOff,
  Car,
  Maximize2,
  Database,
  Pin,
  Brain,
  Square,
} from 'lucide-react';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { Button } from '@/components/ui/button';
import { formatMessageContent } from '@/components/ai/MarkdownTable';
import { type UserRole } from '@/lib/aiAssistant';
import { MemoryPanel } from './MemoryPanel';
import { SourcesChips, GeneratedImageCard, WebSearchCard, ArtifactCanvas } from './AssistantExtras';
import { QUICK_ACTIONS, quickActionPrompt, type QuickAction } from '@/lib/ai/commands';
import type {
  Message,
  AnyAction,
  BookLeaveAction,
  DeleteLeaveAction,
  BookDriverAction,
  BackupOrgAction,
  BackupEmployeeAction,
  RestoreBackupAction,
  ConflictMessage,
} from './chatWidgetTypes';
import type { User } from '@/store/useAuthStore';
import { LEAVE_TYPE_LABELS, getInitialSuggestions } from './chatWidgetUtils';
import {
  TypingStages,
  getMoodGreeting,
  getContextSuggestions,
  filterSlashCommands,
  MessageActions,
  SlashCommandDropdown,
  getPinnedMessages,
  togglePinMessage,
} from './chatWidgetEnhancements';

interface ChatWidgetWindowProps {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  docked: boolean;
  dockedSide?: 'right' | 'left';
  dockedY?: number;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  input: string;
  setInput: (v: string) => void;
  isLoading: boolean;
  error: string | null;
  isListening: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  user: User | null;
  sendMessage: (text: string, setIsOpen: (v: boolean) => void) => Promise<void>;
  handleAction: (messageId: string, action: AnyAction, actionIndex: number) => Promise<void>;
  startVoiceInput: () => void;
  stopGeneration: () => void;
  router: ReturnType<typeof useRouter>;
  t: TFunction;
  i18n: I18nInstance;
}

const QUICK_ACTION_ICONS: Record<QuickAction, string> = {
  shorter: '✂️',
  longer: '📝',
  simplify: '💡',
  translate: '🌐',
  continue: '⏩',
};

export function ChatWidgetWindow({
  isOpen,
  setIsOpen,
  docked,
  dockedSide = 'right',
  dockedY = 50,
  messages,
  setMessages,
  input,
  setInput,
  isLoading,
  error,
  isListening,
  inputRef,
  user,
  sendMessage,
  handleAction,
  startVoiceInput,
  stopGeneration,
  router,
  t,
  i18n,
}: ChatWidgetWindowProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(
    () => new Set(getPinnedMessages().map((p) => p.id)),
  );
  const [showPinned, setShowPinned] = useState(false);
  const slashCommands = filterSlashCommands(input, t);
  const contextSuggestions = getContextSuggestions(pathname || '', t);

  const assistantLocale = (
    i18n.language === 'ru' || i18n.language === 'hy' ? i18n.language : 'en'
  ) as 'en' | 'ru' | 'hy';
  const lastAssistantId = [...messages].reverse().find((m) => m.role === 'assistant')?.id;

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen, inputRef]);

  const handleSubmit = (e: React.FormEvent | React.KeyboardEvent) => {
    e.preventDefault();
    sendMessage(input, setIsOpen);
  };

  const handleSuggestion = (suggestion: string) => {
    const clean = suggestion.replace(/^[\p{Emoji}\s]+/u, '').trim();
    sendMessage(clean, setIsOpen);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {<div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />}
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className={`fixed z-50 w-[calc(100vw-1rem)] sm:w-[380px] max-h-[calc(100vh-12rem)] lg:max-h-[calc(100vh-8rem)] flex flex-col rounded-2xl border border-(--border) shadow-2xl overflow-hidden ${!docked ? 'bottom-36 lg:bottom-24 right-2 sm:right-6' : ''}`}
            style={{
              background: 'var(--card)',
              ...(docked
                ? {
                    top: `clamp(1rem, calc(${dockedY}% - 200px), calc(100vh - 450px))`,
                    ...(dockedSide === 'right' ? { right: '0.5rem' } : { left: '16.5rem' }),
                  }
                : {}),
            }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-(--border) shrink-0 bg-linear-to-r from-(--brand)/10 to-(--brand-hover)/10">
              <div className="w-8 h-8 rounded-xl btn-gradient flex items-center justify-center shadow">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-(--text-primary)">
                  {t('aiChat.shieldHrAi')}
                </p>
                <p className="text-[10px] text-(--text-muted)">
                  {t('chatWidget.subtitle', { defaultValue: 'Your intelligent HR assistant' })}
                </p>
              </div>
              <div className="flex items-center gap-1 ml-auto">
                <button
                  onClick={() => setMemoryOpen(true)}
                  className="p-1.5 rounded-lg hover:bg-(--background-subtle) transition-colors"
                  aria-label={t('aiChat.memory.title', { defaultValue: 'Assistant memory' })}
                  title={t('aiChat.memory.title', { defaultValue: 'Assistant memory' })}
                >
                  <Brain className="w-4 h-4 text-(--text-muted)" />
                </button>
                <button
                  onClick={() => setShowPinned(!showPinned)}
                  className={`p-1.5 rounded-lg hover:bg-(--background-subtle) transition-colors ${showPinned ? 'text-(--brand-text)' : ''}`}
                  aria-label="Pinned messages"
                  title="Pinned messages"
                >
                  <Pin className="w-4 h-4 text-(--text-muted)" />
                </button>
                <button
                  onClick={() => {
                    router.push('/ai-chat');
                    setIsOpen(false);
                  }}
                  className="p-1.5 rounded-lg hover:bg-(--background-subtle) transition-colors"
                  aria-label="Open full screen chat"
                  title="Открыть на весь экран"
                >
                  <Maximize2 className="w-4 h-4 text-(--text-muted)" />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-(--background-subtle) transition-colors"
                  aria-label={t('chatWidget.closeChat', { defaultValue: 'Close chat' })}
                >
                  <X className="w-4 h-4 text-(--text-muted)" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
              {/* Initial suggestions */}
              {messages.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-3"
                >
                  <p className="text-xs text-(--text-muted) text-center mb-1">
                    {getMoodGreeting(user?.name?.split(' ')[0] || 'there', t)}
                  </p>
                  <p className="text-[10px] text-(--text-muted)/70 text-center mb-2">
                    💡{' '}
                    {t('chatWidget.smartHint', {
                      defaultValue: 'I know everything about Shield HR — ask me anything!',
                    })}
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {getInitialSuggestions(user?.role as UserRole, t).map((s) => (
                      <button
                        key={s}
                        onClick={() => handleSuggestion(s)}
                        disabled={isLoading}
                        className="text-left px-3 py-2 rounded-xl border border-(--border) bg-(--background-subtle) hover:border-(--brand)/50 hover:bg-(--brand)/5 hover:text-(--brand-text) text-xs text-(--text-primary) transition-all duration-150 disabled:opacity-50"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  {/* Context-aware suggestions */}
                  {contextSuggestions.length > 0 && (
                    <div className="mt-2">
                      <p className="text-[10px] text-(--text-muted)/60 mb-1">
                        📍 {t('chatWidget.basedOnPage', { defaultValue: 'Based on this page:' })}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {contextSuggestions.map((s) => (
                          <button
                            key={s}
                            onClick={() => handleSuggestion(s)}
                            disabled={isLoading}
                            className="px-2 py-1 rounded-full border border-(--cyan-outline) bg-(--cyan-quiet) hover:bg-(--cyan-quiet-hover) text-[10px] text-(--cyan-text) font-medium transition-all disabled:opacity-50"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Messages */}
              {messages.map((m) => {
                const isUser = m.role === 'user';
                return (
                  <div key={m.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] space-y-2 ${isUser ? 'items-end' : 'items-start'} flex flex-col group`}
                    >
                      <div
                        className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                          isUser
                            ? 'bg-linear-to-br from-(--brand) to-(--brand-hover) text-white rounded-br-sm'
                            : 'bg-(--background-subtle) text-(--text-primary) rounded-bl-sm'
                        }`}
                      >
                        {(() => {
                          const hasTable = m.content.includes('|') && m.content.includes('---');
                          const isLargeContent = !isUser && (hasTable || m.content.length > 500);
                          if (isLargeContent) {
                            const preview = hasTable
                              ? m.content
                                  .split('\n')
                                  .filter((l) => !l.includes('|') && !l.includes('---'))
                                  .slice(0, 3)
                                  .join('\n') || m.content.slice(0, 150)
                              : m.content.slice(0, 300) + '...';
                            return (
                              <>
                                <div>{formatMessageContent(preview)}</div>
                                <button
                                  onClick={() => {
                                    router.push('/ai-chat');
                                    setIsOpen(false);
                                  }}
                                  className="mt-2 flex items-center gap-1.5 text-xs font-medium text-(--brand-text) hover:text-(--brand-hover) transition-colors"
                                >
                                  <Maximize2 className="w-3.5 h-3.5" />
                                  {t('chatWidget.viewFullScreen', {
                                    defaultValue: 'View full response',
                                  })}
                                </button>
                              </>
                            );
                          }
                          return formatMessageContent(m.content);
                        })()}
                      </div>

                      {/* RAG sources, generated image, web search, artifacts */}
                      {!isUser && m.sources && m.sources.length > 0 && (
                        <SourcesChips sources={m.sources} />
                      )}
                      {!isUser && m.imagePrompt && <GeneratedImageCard prompt={m.imagePrompt} />}
                      {!isUser && m.webSearchQuery && <WebSearchCard query={m.webSearchQuery} />}
                      {!isUser &&
                        m.artifacts?.map((artifact, ai) => (
                          <ArtifactCanvas key={`${m.id}-artifact-${ai}`} artifact={artifact} />
                        ))}

                      {/* Reactions, copy, TTS, pin for AI messages */}
                      {!isUser && (
                        <MessageActions
                          content={m.content}
                          isPinned={pinnedIds.has(m.id)}
                          onPin={() => {
                            const pinned = togglePinMessage(m.id, m.content);
                            setPinnedIds((prev) => {
                              const s = new Set(prev);
                              if (pinned) s.add(m.id);
                              else s.delete(m.id);
                              return s;
                            });
                          }}
                        />
                      )}

                      {/* Action cards */}
                      {m.actions && m.actions.length > 0 && (
                        <div className="w-full space-y-2">
                          {m.actions.map((action, idx) => {
                            const state = m.bookingStates?.[idx] ?? { status: 'pending' };
                            const isDelete = action.type === 'DELETE_LEAVE';
                            const isEdit = action.type === 'EDIT_LEAVE';
                            const isBookDriver = action.type === 'BOOK_DRIVER';
                            const isBackupOrg = action.type === 'BACKUP_ORG';
                            const isBackupEmployee = action.type === 'BACKUP_EMPLOYEE';
                            const isRestoreBackup = action.type === 'RESTORE_BACKUP';

                            return (
                              <motion.div
                                key={idx}
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`rounded-xl border p-3 text-xs space-y-2 ${
                                  isDelete
                                    ? 'border-(--danger-outline) bg-(--danger-quiet)'
                                    : isEdit
                                      ? 'border-(--warning-outline) bg-(--warning-quiet)'
                                      : isBookDriver
                                        ? 'border-(--purple-outline) bg-(--purple-quiet)'
                                        : isBackupOrg || isBackupEmployee || isRestoreBackup
                                          ? 'border-(--success-outline) bg-(--success-quiet)'
                                          : 'border-(--brand)/20 bg-(--brand)/5'
                                }`}
                              >
                                <div className="flex items-center gap-2 font-semibold text-(--text-primary)">
                                  {isDelete ? (
                                    <Trash2 className="w-3.5 h-3.5 text-(--danger-text)" />
                                  ) : isEdit ? (
                                    <Pencil className="w-3.5 h-3.5 text-(--warning-text)" />
                                  ) : isBookDriver ? (
                                    <Car className="w-3.5 h-3.5 text-(--purple-text)" />
                                  ) : isBackupOrg || isBackupEmployee || isRestoreBackup ? (
                                    <Database className="w-3.5 h-3.5 text-(--success-text)" />
                                  ) : (
                                    <Calendar className="w-3.5 h-3.5 text-(--brand-text)" />
                                  )}
                                  {isDelete
                                    ? t('chatWidget.cancelLeave')
                                    : isEdit
                                      ? t('chatWidget.updateLeave')
                                      : isBookDriver
                                        ? t('chatWidget.bookDriver', 'Book Driver')
                                        : isBackupOrg
                                          ? `Backup: ${(action as BackupOrgAction).organizationName}`
                                          : isBackupEmployee
                                            ? `Backup: ${(action as BackupEmployeeAction).userName}`
                                            : isRestoreBackup
                                              ? `Restore: ${(action as RestoreBackupAction).employeeName}`
                                              : (LEAVE_TYPE_LABELS[
                                                  (action as BookLeaveAction).leaveType
                                                ] ?? t('chatWidget.leaveRequest'))}
                                </div>
                                <div className="text-(--text-muted) space-y-0.5">
                                  {isBackupOrg ? (
                                    <>
                                      <p>🏢 {(action as BackupOrgAction).organizationName}</p>
                                      <p>💾 Backing up all employees</p>
                                    </>
                                  ) : isBackupEmployee ? (
                                    <>
                                      <p>👤 {(action as BackupEmployeeAction).userName}</p>
                                      <p>💾 Backing up employee data</p>
                                    </>
                                  ) : isRestoreBackup ? (
                                    <>
                                      <p>👤 {(action as RestoreBackupAction).employeeName}</p>
                                      <p>🔄 Restoring from backup snapshot</p>
                                    </>
                                  ) : isBookDriver ? (
                                    <>
                                      <p>🚗 {(action as BookDriverAction).driverName}</p>
                                      <p>
                                        📅{' '}
                                        {new Date(
                                          (action as BookDriverAction).startTime,
                                        ).toLocaleString(
                                          i18n.language === 'ru'
                                            ? 'ru-RU'
                                            : i18n.language === 'hy'
                                              ? 'hy-AM'
                                              : 'en-US',
                                        )}
                                      </p>
                                      <p>
                                        📍 {(action as BookDriverAction).from} →{' '}
                                        {(action as BookDriverAction).to}
                                      </p>
                                      <p>
                                        👥 {(action as BookDriverAction).passengerCount} passengers
                                      </p>
                                      {(action as BookDriverAction).purpose && (
                                        <p>💼 {(action as BookDriverAction).purpose}</p>
                                      )}
                                    </>
                                  ) : action.type !== 'DELETE_LEAVE' ? (
                                    <>
                                      <p>
                                        📅 {action.startDate} → {action.endDate}
                                      </p>
                                      <p>
                                        ⏱️ {action.days} day{action.days !== 1 ? 's' : ''}
                                      </p>
                                      {(action as BookLeaveAction).reason && (
                                        <p>📝 {(action as BookLeaveAction).reason}</p>
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      <p>👤 {(action as DeleteLeaveAction).employeeName}</p>
                                      <p>
                                        📅 {(action as DeleteLeaveAction).startDate} →{' '}
                                        {(action as DeleteLeaveAction).endDate}
                                      </p>
                                      <p className="text-(--danger-text) font-medium">
                                        ⚠️ This action cannot be undone
                                      </p>
                                    </>
                                  )}
                                </div>

                                {state.status === 'pending' && (
                                  <button
                                    onClick={() => handleAction(m.id, action, idx)}
                                    className={`w-full py-2 px-3 text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity ${
                                      isDelete
                                        ? 'bg-linear-to-r from-(--danger-solid) to-(--danger-solid)'
                                        : isEdit
                                          ? 'bg-linear-to-r from-(--warning-solid) to-(--warning-solid)'
                                          : 'bg-linear-to-r from-(--brand) to-(--brand-hover)'
                                    }`}
                                  >
                                    {isDelete
                                      ? t('chatWidget.confirmDelete')
                                      : isEdit
                                        ? t('chatWidget.confirmUpdate')
                                        : t('chatWidget.confirmSend')}
                                  </button>
                                )}
                                {state.status === 'loading' && (
                                  <div className="flex items-center justify-center gap-2 py-2">
                                    <ShieldLoader size="xs" variant="inline" />
                                    <span className="text-xs text-(--text-muted)">
                                      {t('chatWidget.submitting')}
                                    </span>
                                  </div>
                                )}
                                {state.status === 'booked' && (
                                  <div className="flex items-start gap-2 p-2 bg-(--success-quiet) rounded-lg border border-(--success-outline)">
                                    <CheckCircle className="w-4 h-4 text-(--success-text) shrink-0 mt-0.5" />
                                    <p className="text-xs text-(--success-text) dark:text-(--success-text)">
                                      {state.result}
                                    </p>
                                  </div>
                                )}
                                {state.status === 'conflict' && (
                                  <div className="flex items-start gap-2 p-2 bg-(--danger-quiet) rounded-lg border border-(--danger-outline)">
                                    <AlertCircle className="w-4 h-4 text-(--danger-text) shrink-0 mt-0.5" />
                                    <div className="flex-1">
                                      <p className="text-xs text-(--danger-text) dark:text-(--danger-text) whitespace-pre-line">
                                        {state.result}
                                      </p>

                                      {state.conflicts && state.conflicts.length > 0 && (
                                        <div className="mt-2 space-y-1">
                                          {state.conflicts.map(
                                            (conflict: ConflictMessage, idx: number) => (
                                              <div
                                                key={idx}
                                                className="text-xs text-(--danger-text) dark:text-(--danger-text) bg-(--danger-quiet) p-2 rounded border border-(--danger-outline)"
                                              >
                                                <p className="font-medium">{conflict.title}</p>
                                                <p className="mt-0.5 text-(--danger-text) dark:text-(--danger-text)">
                                                  {conflict.message}
                                                </p>
                                                <p className="mt-1 text-(--danger-text) dark:text-(--danger-text)">
                                                  💡 {conflict.suggestion}
                                                </p>
                                              </div>
                                            ),
                                          )}
                                        </div>
                                      )}

                                      {state.alternativeDates &&
                                        state.alternativeDates.length > 0 && (
                                          <div className="mt-3">
                                            <p className="text-xs font-medium text-(--danger-text) dark:text-(--danger-text) mb-1">
                                              ✅ Доступные даты без конфликтов:
                                            </p>
                                            <div className="flex flex-wrap gap-1.5">
                                              {state.alternativeDates.map((dateRange, idx) => (
                                                <button
                                                  key={idx}
                                                  onClick={() => {
                                                    setInput(`Хочу отпуск ${dateRange}`);
                                                    setMessages((prev) =>
                                                      prev.map((msg) =>
                                                        msg.id === m.id
                                                          ? {
                                                              ...msg,
                                                              bookingStates: {
                                                                ...msg.bookingStates,
                                                                [idx]: { status: 'pending' },
                                                              },
                                                            }
                                                          : msg,
                                                      ),
                                                    );
                                                  }}
                                                  className="px-3 py-1.5 rounded-full border border-(--success-outline) bg-(--success-quiet) hover:bg-(--success-quiet) text-xs text-(--success-text) dark:text-(--success-text) font-medium transition-all"
                                                >
                                                  📅 {dateRange}
                                                </button>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                    </div>
                                  </div>
                                )}
                              </motion.div>
                            );
                          })}
                        </div>
                      )}

                      {/* Follow-up suggestions */}
                      {!isUser && m.suggestions && m.suggestions.length > 0 && !isLoading && (
                        <motion.div
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.3 }}
                          className="flex flex-wrap gap-1.5 mt-1"
                        >
                          {m.suggestions.map((s) => (
                            <button
                              key={s}
                              onClick={() => handleSuggestion(s)}
                              disabled={isLoading}
                              className="px-2.5 py-1 rounded-full border border-(--brand)/30 bg-(--brand)/5 hover:bg-(--brand)/15 hover:border-(--brand)/60 text-[10px] text-(--brand-text) font-medium transition-all duration-150 disabled:opacity-50"
                            >
                              {s}
                            </button>
                          ))}
                        </motion.div>
                      )}

                      {/* Quick actions on the last assistant answer */}
                      {!isUser && m.id === lastAssistantId && !isLoading && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {QUICK_ACTIONS.map((qa) => (
                            <button
                              key={qa}
                              onClick={() =>
                                sendMessage(quickActionPrompt(qa, assistantLocale), setIsOpen)
                              }
                              title={t(`aiChat.quick.${qa}`, { defaultValue: qa })}
                              className="px-1.5 py-0.5 rounded-md border border-(--border) hover:bg-(--background-subtle) text-[10px] text-(--text-muted) transition-colors"
                            >
                              {QUICK_ACTION_ICONS[qa]}{' '}
                              {t(`aiChat.quick.${qa}`, { defaultValue: qa })}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Loading indicator with stages */}
              {isLoading && (
                <div className="flex justify-start items-end gap-2">
                  <div className="bg-(--background-subtle) px-4 py-3 rounded-2xl rounded-bl-sm flex items-center gap-2">
                    <div className="flex gap-1">
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-(--brand) animate-bounce"
                        style={{ animationDelay: '0ms' }}
                      />
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-(--brand) animate-bounce"
                        style={{ animationDelay: '150ms' }}
                      />
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-(--brand) animate-bounce"
                        style={{ animationDelay: '300ms' }}
                      />
                    </div>
                    <TypingStages />
                  </div>
                  <button
                    onClick={stopGeneration}
                    className="p-2 rounded-lg border border-(--border) bg-(--card) hover:bg-(--background-subtle) text-(--text-muted) transition-colors"
                    aria-label={t('aiChat.stop', { defaultValue: 'Stop' })}
                    title={t('aiChat.stop', { defaultValue: 'Stop' })}
                  >
                    <Square className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Error */}
            {error && (
              <div className="px-4 py-2 bg-(--danger-quiet) border-t border-(--danger-outline) shrink-0">
                <p className="text-xs text-(--danger-text)">⚠️ {error}</p>
              </div>
            )}

            {/* Pinned messages panel */}
            {showPinned && (
              <div className="px-4 py-2 border-t border-(--border) max-h-32 overflow-y-auto bg-(--background-subtle)">
                <p className="text-[10px] font-semibold text-(--text-muted) mb-1">📌 Pinned</p>
                {getPinnedMessages().length === 0 ? (
                  <p className="text-[10px] text-(--text-muted)">{t('aiChat.noPinnedMessages')}</p>
                ) : (
                  getPinnedMessages().map((p) => (
                    <div
                      key={p.id}
                      className="text-[10px] text-(--text-primary) py-1 border-b border-(--border) last:border-0 line-clamp-2"
                    >
                      {p.content.slice(0, 100)}
                      {p.content.length > 100 ? '...' : ''}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Input */}
            <form onSubmit={handleSubmit} className="p-4 border-t border-(--border) shrink-0">
              <div className="relative">
                {/* Slash command autocomplete */}
                {slashCommands.length > 0 && (
                  <SlashCommandDropdown
                    commands={slashCommands}
                    onSelect={(cmd) => {
                      setInput(cmd + ' ');
                      inputRef.current?.focus();
                    }}
                  />
                )}
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    isListening ? t('chatWidget.listening') : t('chatWidget.placeholder')
                  }
                  className={`w-full px-4 py-2.5 pr-20 bg-(--input) border rounded-xl text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none focus:ring-2 focus:ring-(--brand) text-sm transition-colors ${
                    isListening ? 'border-(--brand) ring-2 ring-(--brand)/30' : 'border-(--border)'
                  }`}
                  disabled={isLoading}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit(e);
                    }
                  }}
                />
                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={startVoiceInput}
                    disabled={isLoading}
                    title={isListening ? t('chatWidget.stopListening') : t('chatWidget.voiceInput')}
                    className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                      isListening
                        ? 'text-(--brand-text) animate-pulse'
                        : 'text-(--text-muted) hover:text-(--brand-text)'
                    }`}
                  >
                    {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                  <Button
                    type="submit"
                    disabled={isLoading || !input.trim()}
                    className="btn-gradient disabled:opacity-50 h-8 w-8 p-0 rounded-lg"
                    size="sm"
                  >
                    {isLoading ? (
                      <ShieldLoader size="xs" variant="inline" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </motion.div>
          <MemoryPanel userId={user?.id} open={memoryOpen} onClose={() => setMemoryOpen(false)} />
        </>
      )}
    </AnimatePresence>
  );
}
