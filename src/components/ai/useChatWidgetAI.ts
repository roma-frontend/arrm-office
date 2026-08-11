import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { logger } from '@/lib/logger';
import type {
  Message,
  AnyAction,
  DeleteLeaveAction,
  ConflictMessage,
  SpeechRecognition,
  SpeechRecognitionEvent,
} from './chatWidgetTypes';
import { parseActions, getFollowUpSuggestions } from './chatWidgetUtils';
import { parseAssistantTags, stripControlTags, stripPartialTail } from '@/lib/ai/tags';
import { canNavigate } from '@/lib/ai/assistantRoutes';
import type { UserRole } from '@/lib/aiAssistant';

export function useChatWidgetAI() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [wakeWordActive, _setWakeWordActive] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const user = useAuthStore((s) => s.user);
  const voiceRecogRef = useRef<SpeechRecognition | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const csrfRef = useRef<{ token: string; signature: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  /** Stop the in-flight stream; the partial answer is kept. */
  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
  }, []);

  // Fetch CSRF token on mount
  useEffect(() => {
    fetch('/api/csrf-token')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) csrfRef.current = data as { token: string; signature: string };
      })
      .catch(() => {});
  }, []);

  // ── Detect language of text (EN / RU / HY) ──────────────────────
  const detectLanguage = useCallback((text: string): 'ru' | 'en' | 'hy' => {
    const armenianCount = (text.match(/[\u0530-\u058F]/g) || []).length;
    if (armenianCount > text.length * 0.15) return 'hy';
    const cyrillicCount = (text.match(/[\u0400-\u04FF]/g) || []).length;
    return cyrillicCount > text.length * 0.2 ? 'ru' : 'en';
  }, []);

  // ── Voice input: mic button ───────────────────────────────────────
  const startVoiceInput = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    if (voiceRecogRef.current) {
      voiceRecogRef.current.stop();
      voiceRecogRef.current = null;
      setIsListening(false);
      return;
    }

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    const langMap: Record<string, string> = {
      ru: 'ru-RU',
      hy: 'hy-AM',
      en: 'en-US',
    };
    rec.lang = langMap[i18n.language] || 'en-US';
    voiceRecogRef.current = rec;

    setIsListening(true);

    rec.onresult = (e: SpeechRecognitionEvent) => {
      let interim = '';
      let final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i]?.[0]?.transcript || '';
        if (e.results[i]?.isFinal) final += t;
        else interim += t;
      }
      const text = final || interim;
      setInput(text);

      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      if (text.trim()) {
        silenceTimerRef.current = setTimeout(() => {
          if (voiceRecogRef.current) {
            voiceRecogRef.current.stop();
            voiceRecogRef.current = null;
            setIsListening(false);
            setTimeout(() => {
              inputRef.current?.form?.requestSubmit();
            }, 100);
          }
        }, 1000);
      }
    };

    rec.onend = () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      setIsListening(false);
      voiceRecogRef.current = null;
    };

    rec.onerror = () => {
      setIsListening(false);
      voiceRecogRef.current = null;
    };

    rec.start();
  }, [i18n.language]);

  const handleAction = async (messageId: string, action: AnyAction, actionIndex: number) => {
    if (!user?.id) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                bookingStates: {
                  ...m.bookingStates,
                  [actionIndex]: { status: 'conflict', result: 'Not logged in.' },
                },
              }
            : m,
        ),
      );
      return;
    }

    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, bookingStates: { ...m.bookingStates, [actionIndex]: { status: 'loading' } } }
          : m,
      ),
    );

    try {
      let url = '';
      let body: Record<string, unknown> = {};

      if (action.type === 'BOOK_LEAVE') {
        if (user.organizationId) {
          const conflictCheckRes = await fetch(
            `/api/chat/conflict-check?userId=${user.id}&organizationId=${user.organizationId}&requestType=leave&startDate=${new Date(action.startDate).getTime()}&endDate=${new Date(action.endDate).getTime()}`,
          );

          if (conflictCheckRes.ok) {
            const conflictData = (await conflictCheckRes.json()) as {
              hasCriticalConflicts?: boolean;
              aiMessage?: string;
              conflicts?: ConflictMessage[];
              alternativeDates?: string[];
            };

            if (conflictData.hasCriticalConflicts) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === messageId
                    ? {
                        ...m,
                        bookingStates: {
                          ...m.bookingStates,
                          [actionIndex]: {
                            status: 'conflict',
                            result:
                              conflictData.aiMessage ||
                              'Обнаружены критические конфликты. Пожалуйста, выберите другие даты или обсудите с руководителем.',
                            conflicts: conflictData.conflicts,
                            alternativeDates: conflictData.alternativeDates || [],
                          },
                        },
                      }
                    : m,
                ),
              );
              return;
            }
          }
        }

        url = '/api/chat/book-leave';
        body = {
          userId: user.id,
          organizationId: user.organizationId,
          type: action.leaveType,
          startDate: action.startDate,
          endDate: action.endDate,
          days: action.days,
          reason: action.reason,
        };
      } else if (action.type === 'EDIT_LEAVE') {
        url = '/api/chat/edit-leave';
        body = {
          leaveId: action.leaveId,
          startDate: action.startDate,
          endDate: action.endDate,
          days: action.days,
          reason: action.reason,
          type: action.leaveType,
        };
      } else if (action.type === 'DELETE_LEAVE') {
        url = '/api/chat/delete-leave';
        body = {
          leaveId: action.leaveId,
          employeeName: (action as DeleteLeaveAction).employeeName,
          startDate: (action as DeleteLeaveAction).startDate,
          endDate: (action as DeleteLeaveAction).endDate,
          leaveType: (action as DeleteLeaveAction).leaveType,
        };
      } else if (action.type === 'BOOK_DRIVER') {
        url = '/api/chat/book-driver';
        logger.log('[ChatWidget] BOOK_DRIVER action:', action);
        logger.log('[ChatWidget] User:', { id: user.id, organizationId: user.organizationId });

        const startTime = new Date(action.startTime).getTime();
        const endTime = new Date(action.endTime).getTime();

        if (!user.organizationId) {
          throw new Error('Organization not selected. Please select an organization first.');
        }
        if (isNaN(startTime) || isNaN(endTime)) {
          throw new Error('Invalid date/time for driver booking.');
        }

        const conflictCheckRes = await fetch(
          `/api/chat/conflict-check?userId=${user.id}&organizationId=${user.organizationId}&requestType=driver&startDate=${startTime}&endDate=${endTime}`,
        );

        if (conflictCheckRes.ok) {
          const conflictData = (await conflictCheckRes.json()) as {
            hasCriticalConflicts?: boolean;
            aiMessage?: string;
            conflicts?: ConflictMessage[];
          };

          if (conflictData.hasCriticalConflicts) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === messageId
                  ? {
                      ...m,
                      bookingStates: {
                        ...m.bookingStates,
                        [actionIndex]: {
                          status: 'conflict',
                          result:
                            conflictData.aiMessage ||
                            'Водитель уже забронирован на это время. Пожалуйста, выберите другое время или другого водителя.',
                          conflicts: conflictData.conflicts,
                        },
                      },
                    }
                  : m,
              ),
            );
            return;
          }
        }

        body = {
          userId: user.id,
          organizationId: user.organizationId,
          driverId: action.driverId,
          startTime,
          endTime,
          tripInfo: {
            from: action.from,
            to: action.to,
            purpose: action.purpose,
            passengerCount: action.passengerCount,
            notes: action.notes,
          },
        };
      } else if (action.type === 'BACKUP_ORG') {
        url = '/api/chat/backup-org';
        body = {
          userId: user.id,
          organizationId: action.organizationId,
        };
      } else if (action.type === 'BACKUP_EMPLOYEE') {
        url = '/api/chat/backup-employee';
        body = {
          userId: user.id,
          organizationId: action.organizationId,
          employeeId: action.userId,
        };
      } else if (action.type === 'RESTORE_BACKUP') {
        url = '/api/chat/restore-backup';
        body = {
          userId: user.id,
          backupId: action.backupId,
        };
      }

      logger.log('[ChatWidget] Sending request to:', url, body);

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfRef.current
            ? {
                'X-CSRF-Token': csrfRef.current.token,
                'X-CSRF-Token-Signature': csrfRef.current.signature,
              }
            : {}),
        },
        body: JSON.stringify(body),
      });

      let data: Record<string, unknown>;
      try {
        data = (await res.json()) as Record<string, unknown>;
      } catch {
        data = { error: `Server error (${res.status})` };
      }

      if (res.ok) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  bookingStates: {
                    ...m.bookingStates,
                    [actionIndex]: {
                      status: 'booked',
                      result: (data.message as string) || 'Done!',
                    },
                  },
                }
              : m,
          ),
        );
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  bookingStates: {
                    ...m.bookingStates,
                    [actionIndex]: {
                      status: 'conflict',
                      result: (data.error as string) || 'Something went wrong.',
                    },
                  },
                }
              : m,
          ),
        );
      }
    } catch (err) {
      logger.error('[ChatWidget] Action error:', err);
      const errorMsg = err instanceof Error ? err.message : 'Network error. Please try again.';
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                bookingStates: {
                  ...m.bookingStates,
                  [actionIndex]: { status: 'conflict', result: errorMsg },
                },
              }
            : m,
        ),
      );
    }
  };

  // Smart navigation - detect navigation commands
  const handleNavigation = useCallback(
    (text: string) => {
      const lowerText = text.toLowerCase();

      const createKeywords = [
        'хочу',
        'book',
        'request',
        'создать',
        'забронировать',
        'организуй',
        'взять отпуск',
        'go on leave',
        'vacation',
        'с \\d',
        'from \\d',
        'до \\d',
        'by \\d',
      ];

      const isCreateRequest = createKeywords.some((keyword) => {
        if (keyword.includes('\\d')) {
          const regex = new RegExp(keyword, 'i');
          return regex.test(lowerText);
        }
        return lowerText.includes(keyword);
      });

      if (isCreateRequest) {
        logger.log('🚫 [handleNavigation] Create request detected, skipping navigation:', text);
        return false;
      }

      const navigationMap: { [key: string]: string } = {
        'покажи календарь': '/calendar',
        'открой календарь': '/calendar',
        'show calendar': '/calendar',
        'view calendar': '/calendar',
        календарь: '/calendar',
        calendar: '/calendar',

        'покажи отпуска': '/leaves',
        'покажи мои отпуска': '/leaves',
        'view my leaves': '/leaves',
        'show leaves': '/leaves',
        'my leaves': '/leaves',
        'view leaves': '/leaves',

        'покажи сотрудников': '/employees',
        'show employees': '/employees',
        'view team': '/employees',
        сотрудники: '/employees',
        employees: '/employees',
        команда: '/employees',
        team: '/employees',

        'покажи задачи': '/tasks',
        'show tasks': '/tasks',
        'my tasks': '/tasks',
        задачи: '/tasks',
        tasks: '/tasks',

        посещаемость: '/attendance',
        attendance: '/attendance',
        присутствие: '/attendance',

        аналитика: '/analytics',
        analytics: '/analytics',
        статистика: '/analytics',
        reports: '/reports',
        отчеты: '/reports',

        настройки: '/settings',
        settings: '/settings',

        дашборд: '/dashboard',
        dashboard: '/dashboard',
        главная: '/dashboard',
        home: '/dashboard',

        профиль: '/profile',
        profile: '/profile',
        'мой профиль': '/profile',
        'my profile': '/profile',

        'покажи опрос': '/surveys',
        'покажи опросы': '/surveys',
        опросы: '/surveys',
        surveys: '/surveys',
        'show surveys': '/surveys',
        'show poll': '/surveys',
        poll: '/surveys',

        цели: '/goals',
        'покажи цели': '/goals',
        'покажи мои цели': '/goals',
        goals: '/goals',
        okr: '/goals',
        'покажи OKR': '/goals',

        kudos: '/recognition',
        'покажи kudos': '/recognition',
        'покажи признание': '/recognition',
        recognition: '/recognition',
        leaderboard: '/recognition',

        политики: '/corporate',
        'покажи политики': '/corporate',
        corporate: '/corporate',

        документы: '/documents',
        'покажи документы': '/documents',
        'открой документы': '/documents',
        'show documents': '/documents',
        'view documents': '/documents',
        documents: '/documents',

        обучение: '/learning',
        'покажи обучение': '/learning',
        'открой обучение': '/learning',
        'show learning': '/learning',
        'view learning': '/learning',
        learning: '/learning',
        курсы: '/learning',
        'покажи курсы': '/learning',
        courses: '/learning',

        бэкапы: '/superadmin/backups',
        'покажи бэкапы': '/superadmin/backups',
        'открой бэкапы': '/superadmin/backups',
        'show backups': '/superadmin/backups',
        'view backups': '/superadmin/backups',
        backups: '/superadmin/backups',
        'резервные копии': '/superadmin/backups',

        'performance review': '/performance',
        'покажи performance': '/performance',
        performance: '/performance',
        оценка: '/performance',

        сообщения: '/messenger',
        messages: '/messenger',
        чат: '/messenger',
        непрочитанные: '/messenger',
        unread: '/messenger',
      };

      for (const [keyword, path] of Object.entries(navigationMap)) {
        if (
          lowerText === keyword ||
          lowerText.startsWith('покажи ') ||
          lowerText.startsWith('открой ') ||
          lowerText.startsWith('show ') ||
          lowerText.startsWith('view ') ||
          lowerText.startsWith('open ')
        ) {
          if (keyword.includes(lowerText.split(' ')[1] || '')) {
            router.push(path);
            return true;
          }
        }
      }

      return false;
    },
    [router],
  );

  const sendMessage = async (text: string, setIsOpen: (v: boolean) => void) => {
    if (!text.trim() || isLoading) return;

    if (handleNavigation(text)) {
      setIsOpen(false);
      return;
    }

    const lang = detectLanguage(text);

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    // Hoisted so the error paths below can drop the placeholder bubble.
    let assistantId: string | null = null;

    try {
      logger.log('🤖 [ChatWidget] Sending message to AI:', {
        userId: user?.id,
        organizationId: user?.organizationId,
        message: text,
      });

      const controller = new AbortController();
      abortRef.current = controller;

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfRef.current
            ? {
                'X-CSRF-Token': csrfRef.current.token,
                'X-CSRF-Token-Signature': csrfRef.current.signature,
              }
            : {}),
        },
        body: JSON.stringify({
          // Blank turns are dropped: OpenAI-compatible providers reject an
          // `assistant` message with empty content, so a single blank bubble
          // used to make every following request fail too — which is why the
          // "elaborate" action kept coming back empty.
          messages: [...messages, userMessage]
            .filter((m) => m.content.trim().length > 0)
            .map((m) => ({ role: m.role, content: m.content })),
          userId: user?.id,
          lang,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error || `Server error ${res.status}`);
      }

      logger.log('📡 Response status:', res.status, 'type:', res.headers.get('content-type'));

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      const assistantMessageId = (Date.now() + 1).toString();
      assistantId = assistantMessageId;
      setMessages((prev) => [...prev, { id: assistantMessageId, role: 'assistant', content: '' }]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullContent += decoder.decode(value, { stream: true });
          // Hide control tags mid-stream (including partial ones at the tail).
          const display = stripControlTags(
            parseActions(stripPartialTail(fullContent)).cleanContent,
          );
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMessageId ? { ...m, content: display } : m)),
          );
        }
      }

      const { cleanContent, actions } = parseActions(fullContent);
      const parsed = parseAssistantTags(cleanContent);

      // A 200 with no usable text is still a failure. Surfacing it beats leaving
      // the blank bubble that used to be the only symptom.
      if (!parsed.cleanContent.trim() && actions.length === 0 && !parsed.artifacts.length) {
        setMessages((prev) => prev.filter((m) => m.id !== assistantMessageId));
        assistantId = null;
        setError(t('chatWidget.emptyReply', { defaultValue: 'No reply received. Please retry.' }));
        return;
      }

      const suggestions = parsed.suggestions.length
        ? parsed.suggestions
        : getFollowUpSuggestions(parsed.cleanContent, user?.role || 'employee', t);

      // Auto-expand to fullscreen if response contains tables or large data
      const hasTable =
        /\|.*\|.*\|/m.test(parsed.cleanContent) || parsed.cleanContent.split('\n').length > 20;
      if (hasTable) {
        // Persist messages for fullscreen page to pick up. `userMessage` has to
        // be included explicitly: `messages` is the closure value from before it
        // was appended, so the handoff used to arrive at /ai-chat without the
        // question that produced the answer — and every follow-up reasoned over
        // a history with a hole in it.
        const allMessages = [
          ...messages,
          userMessage,
          {
            id: (Date.now() + 1).toString(),
            role: 'assistant' as const,
            content: parsed.cleanContent,
            actions,
            suggestions,
            sources: parsed.sources,
            imagePrompt: parsed.imagePrompt || undefined,
            webSearchQuery: parsed.webSearchQuery || undefined,
            artifacts: parsed.artifacts,
          },
        ];
        try {
          sessionStorage.setItem('ai-chat-handoff', JSON.stringify(allMessages));
        } catch {}
        router.push('/ai-chat');
        setIsOpen(false);
      }

      logger.log('🤖 [AI Response] Full content:', fullContent);
      logger.log('🤖 [AI Response] Clean content:', parsed.cleanContent);
      logger.log('🤖 [AI Response] Actions:', actions);

      const navMatch = fullContent.match(/<NAVIGATE>(.*?)<\/NAVIGATE>/);
      if (navMatch && navMatch[1]) {
        const route = navMatch[1];
        // Only navigate within the role's allow-list.
        if (canNavigate((user?.role as UserRole) || 'employee', route)) {
          logger.log('🎯 [AI Navigation] Route:', route);
          setTimeout(() => {
            router.push(route);
            setIsOpen(false);
          }, 800);
        }
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? {
                ...m,
                content: parsed.cleanContent,
                actions,
                bookingStates: Object.fromEntries(
                  actions.map((_, i) => [i, { status: 'pending' as const }]),
                ),
                suggestions,
                sources: parsed.sources,
                imagePrompt: parsed.imagePrompt || undefined,
                webSearchQuery: parsed.webSearchQuery || undefined,
                artifacts: parsed.artifacts,
              }
            : m,
        ),
      );
    } catch (err) {
      // Either way the placeholder bubble must go if nothing was streamed into
      // it: an empty assistant turn left in the list is both a blank bubble and
      // a poison pill for the next request's history.
      const placeholderId = assistantId;
      if (placeholderId) {
        setMessages((prev) =>
          prev.filter((m) => m.id !== placeholderId || m.content.trim().length > 0),
        );
      }
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Stopped by the user — keep whatever had already streamed in.
        return;
      }
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      abortRef.current = null;
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  return {
    messages,
    setMessages,
    input,
    setInput,
    isLoading,
    error,
    isListening,
    wakeWordActive,
    inputRef,
    user,
    sendMessage,
    handleAction,
    startVoiceInput,
    stopGeneration,
    t,
    i18n,
    router,
  };
}
