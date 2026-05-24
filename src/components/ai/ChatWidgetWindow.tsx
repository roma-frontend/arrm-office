'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePathname } from 'next/navigation';
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
} from 'lucide-react';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { Button } from '@/components/ui/button';
import { formatMessageContent } from '@/components/ai/MarkdownTable';
import { type UserRole } from '@/lib/aiAssistant';
import type {
  Message,
  AnyAction,
  BookLeaveAction,
  DeleteLeaveAction,
  BookDriverAction,
  BackupOrgAction,
  BackupEmployeeAction,
  RestoreBackupAction,
} from './chatWidgetTypes';
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
  user: any;
  sendMessage: (text: string, setIsOpen: (v: boolean) => void) => Promise<void>;
  handleAction: (messageId: string, action: AnyAction, actionIndex: number) => Promise<void>;
  startVoiceInput: () => void;
  router: any;
  t: (key: string, options?: any) => string;
  i18n: any;
}

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
  router,
  t,
  i18n,
}: ChatWidgetWindowProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(
    () => new Set(getPinnedMessages().map((p) => p.id)),
  );
  const [showPinned, setShowPinned] = useState(false);
  const slashCommands = filterSlashCommands(input, t);
  const contextSuggestions = getContextSuggestions(pathname || '', t);

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

  const handleSubmit = (e: React.FormEvent) => {
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
            <div className="flex items-center gap-3 px-4 py-3 border-b border-(--border) shrink-0 bg-linear-to-r from-[#2563eb]/10 to-[#0ea5e9]/10">
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
                  onClick={() => setShowPinned(!showPinned)}
                  className={`p-1.5 rounded-lg hover:bg-(--background-subtle) transition-colors ${showPinned ? 'text-[#2563eb]' : ''}`}
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
                        className="text-left px-3 py-2 rounded-xl border border-(--border) bg-(--background-subtle) hover:border-[#2563eb]/50 hover:bg-[#2563eb]/5 hover:text-[#3b82f6] text-xs text-(--text-primary) transition-all duration-150 disabled:opacity-50"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  {/* Context-aware suggestions */}
                  {contextSuggestions.length > 0 && (
                    <div className="mt-2">
                      <p className="text-[10px] text-(--text-muted)/60 mb-1">
                        📍 Based on this page:
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {contextSuggestions.map((s) => (
                          <button
                            key={s}
                            onClick={() => handleSuggestion(s)}
                            disabled={isLoading}
                            className="px-2 py-1 rounded-full border border-[#0ea5e9]/30 bg-[#0ea5e9]/5 hover:bg-[#0ea5e9]/15 text-[10px] text-[#0ea5e9] font-medium transition-all disabled:opacity-50"
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
                            ? 'bg-linear-to-br from-[#2563eb] to-[#0ea5e9] text-white rounded-br-sm'
                            : 'bg-(--background-subtle) text-(--text-primary) rounded-bl-sm'
                        }`}
                      >
                        {formatMessageContent(m.content)}
                      </div>

                      {/* Reactions, copy, TTS, pin for AI messages */}
                      {!isUser && (
                        <MessageActions
                          content={m.content}
                          isPinned={pinnedIds.has(m.id)}
                          onPin={() => {
                            const pinned = togglePinMessage(m.id, m.content);
                            setPinnedIds((prev) => {
                              const s = new Set(prev);
                              pinned ? s.add(m.id) : s.delete(m.id);
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
                                    ? 'border-red-500/20 bg-red-500/5'
                                    : isEdit
                                      ? 'border-yellow-500/20 bg-yellow-500/5'
                                      : isBookDriver
                                        ? 'border-purple-500/20 bg-purple-500/5'
                                        : isBackupOrg || isBackupEmployee || isRestoreBackup
                                          ? 'border-emerald-500/20 bg-emerald-500/5'
                                          : 'border-[#2563eb]/20 bg-[#2563eb]/5'
                                }`}
                              >
                                <div className="flex items-center gap-2 font-semibold text-(--text-primary)">
                                  {isDelete ? (
                                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                  ) : isEdit ? (
                                    <Pencil className="w-3.5 h-3.5 text-yellow-500" />
                                  ) : isBookDriver ? (
                                    <Car className="w-3.5 h-3.5 text-purple-500" />
                                  ) : isBackupOrg || isBackupEmployee || isRestoreBackup ? (
                                    <Database className="w-3.5 h-3.5 text-emerald-500" />
                                  ) : (
                                    <Calendar className="w-3.5 h-3.5 text-[#2563eb]" />
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
                                      <p className="text-red-500 font-medium">
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
                                        ? 'bg-linear-to-r from-red-500 to-red-600'
                                        : isEdit
                                          ? 'bg-linear-to-r from-yellow-500 to-orange-500'
                                          : 'bg-linear-to-r from-[#2563eb] to-[#0ea5e9]'
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
                                  <div className="flex items-start gap-2 p-2 bg-green-500/10 rounded-lg border border-green-500/20">
                                    <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                                    <p className="text-xs text-green-600 dark:text-green-400">
                                      {state.result}
                                    </p>
                                  </div>
                                )}
                                {state.status === 'conflict' && (
                                  <div className="flex items-start gap-2 p-2 bg-red-500/10 rounded-lg border border-red-500/20">
                                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                                    <div className="flex-1">
                                      <p className="text-xs text-red-600 dark:text-red-400 whitespace-pre-line">
                                        {state.result}
                                      </p>

                                      {state.conflicts && state.conflicts.length > 0 && (
                                        <div className="mt-2 space-y-1">
                                          {state.conflicts.map((conflict: any, idx: number) => (
                                            <div
                                              key={idx}
                                              className="text-xs text-red-700 dark:text-red-300 bg-red-500/5 p-2 rounded border border-red-500/10"
                                            >
                                              <p className="font-medium">{conflict.title}</p>
                                              <p className="mt-0.5 text-red-600 dark:text-red-400">
                                                {conflict.message}
                                              </p>
                                              <p className="mt-1 text-red-500 dark:text-red-300">
                                                💡 {conflict.suggestion}
                                              </p>
                                            </div>
                                          ))}
                                        </div>
                                      )}

                                      {state.alternativeDates &&
                                        state.alternativeDates.length > 0 && (
                                          <div className="mt-3">
                                            <p className="text-xs font-medium text-red-700 dark:text-red-300 mb-1">
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
                                                  className="px-3 py-1.5 rounded-full border border-green-500/30 bg-green-500/10 hover:bg-green-500/20 text-xs text-green-700 dark:text-green-400 font-medium transition-all"
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
                              className="px-2.5 py-1 rounded-full border border-[#2563eb]/30 bg-[#2563eb]/5 hover:bg-[#2563eb]/15 hover:border-[#2563eb]/60 text-[10px] text-[#2563eb] font-medium transition-all duration-150 disabled:opacity-50"
                            >
                              {s}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Loading indicator with stages */}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-(--background-subtle) px-4 py-3 rounded-2xl rounded-bl-sm flex items-center gap-2">
                    <div className="flex gap-1">
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-[#2563eb] animate-bounce"
                        style={{ animationDelay: '0ms' }}
                      />
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-[#2563eb] animate-bounce"
                        style={{ animationDelay: '150ms' }}
                      />
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-[#2563eb] animate-bounce"
                        style={{ animationDelay: '300ms' }}
                      />
                    </div>
                    <TypingStages />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Error */}
            {error && (
              <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/20 shrink-0">
                <p className="text-xs text-red-500">⚠️ {error}</p>
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
                  className={`w-full px-4 py-2.5 pr-20 bg-(--input) border rounded-xl text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none focus:ring-2 focus:ring-[#2563eb] text-sm transition-colors ${
                    isListening ? 'border-[#2563eb] ring-2 ring-[#2563eb]/30' : 'border-(--border)'
                  }`}
                  disabled={isLoading}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit(e as any);
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
                        ? 'text-[#2563eb] animate-pulse'
                        : 'text-(--text-muted) hover:text-[#3b82f6]'
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
        </>
      )}
    </AnimatePresence>
  );
}
