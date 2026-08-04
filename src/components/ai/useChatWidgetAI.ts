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

    try {
      logger.log('🤖 [ChatWidget] Sending message to AI:', {
        userId: user?.id,
        organizationId: user?.organizationId,
        message: text,
      });

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
          messages: [...messages, userMessage].map((m) => ({ role: m.role, content: m.content })),
          userId: user?.id,
          lang,
        }),
      });

      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error || `Server error ${res.status}`);
      }

      logger.log('📡 Response status:', res.status, 'type:', res.headers.get('content-type'));

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      const assistantId = (Date.now() + 1).toString();
      setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullContent += decoder.decode(value, { stream: true });
          const { cleanContent } = parseActions(fullContent);
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: cleanContent } : m)),
          );
        }
      }

      const { cleanContent, actions } = parseActions(fullContent);
      const suggestions = getFollowUpSuggestions(cleanContent, user?.role || 'employee', t);

      // Auto-expand to fullscreen if response contains tables or large data
      const hasTable = /\|.*\|.*\|/m.test(cleanContent) || cleanContent.split('\n').length > 20;
      if (hasTable) {
        // Persist messages for fullscreen page to pick up
        const allMessages = [
          ...messages,
          {
            id: (Date.now() + 1).toString(),
            role: 'assistant' as const,
            content: cleanContent,
            actions,
            suggestions,
          },
        ];
        try {
          sessionStorage.setItem('ai-chat-handoff', JSON.stringify(allMessages));
        } catch {}
        router.push('/ai-chat');
        setIsOpen(false);
      }

      logger.log('🤖 [AI Response] Full content:', fullContent);
      logger.log('🤖 [AI Response] Clean content:', cleanContent);
      logger.log('🤖 [AI Response] Actions:', actions);

      const navMatch = fullContent.match(/<NAVIGATE>(.*?)<\/NAVIGATE>/);
      if (navMatch && navMatch[1]) {
        const route = navMatch[1];
        logger.log('🎯 [AI Navigation] Route:', route);
        logger.log('🎯 [AI Navigation] Full match:', navMatch[0]);
        setTimeout(() => {
          router.push(route);
          setIsOpen(false);
        }, 800);
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: cleanContent.replace(/<NAVIGATE>.*?<\/NAVIGATE>/g, '').trim(),
                actions,
                bookingStates: Object.fromEntries(
                  actions.map((_, i) => [i, { status: 'pending' as const }]),
                ),
                suggestions,
              }
            : m,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
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
    t,
    i18n,
    router,
  };
}
