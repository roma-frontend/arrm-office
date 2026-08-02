/**
 * Wizard Draft Persistence
 * Черновики многошаговых форм — данные переживают случайное закрытие модалки.
 *
 * Хранилище: sessionStorage (живёт до закрытия вкладки). Формы содержат PII —
 * паспорта, зарплаты, соцкарты, — поэтому на диск надолго ничего не пишем.
 *
 * Черновик стирается при успешной отправке и при явном нажатии «Отмена».
 * Закрытие крестиком / Escape / кликом вне окна — сохраняет.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';

const PREFIX = 'wizard-draft:';
const VERSION = 1;
const SAVE_DEBOUNCE_MS = 400;

interface DraftEnvelope<T> {
  v: number;
  step: number;
  data: T;
  savedAt: number;
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    // Приватный режим / заблокированные куки — работаем без персиста.
    return null;
  }
}

function readEnvelope<T>(storageKey: string): DraftEnvelope<T> | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftEnvelope<T>;
    if (!parsed || parsed.v !== VERSION || typeof parsed.data !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeEnvelope<T>(storageKey: string, envelope: DraftEnvelope<T>): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(storageKey, JSON.stringify(envelope));
  } catch {
    // QuotaExceeded (например, большой base64-скан) — черновик просто не сохраняем.
  }
}

function removeEnvelope(storageKey: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(storageKey);
  } catch {
    /* noop */
  }
}

/**
 * Стабильный слепок для сравнения: ключи сортируются, пустые значения
 * (undefined / '' / null / []) выбрасываются, File/Blob не сериализуются.
 */
function stableSnapshot(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'function') return undefined;
  if (typeof window !== 'undefined') {
    if (value instanceof File || value instanceof Blob) return undefined;
  }
  if (Array.isArray(value)) {
    const arr = value.map(stableSnapshot).filter((v) => v !== undefined);
    return arr.length > 0 ? arr : undefined;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const snap = stableSnapshot((value as Record<string, unknown>)[key]);
      if (snap !== undefined) out[key] = snap;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }
  if (typeof value === 'string') return value.trim() === '' ? undefined : value;
  return value;
}

function serialize(value: unknown): string {
  return JSON.stringify(stableSnapshot(value) ?? null);
}

export interface UseWizardDraftOptions<T> {
  /** Уникальный идентификатор формы, например `add-employee`. `null` отключает черновики. */
  key: string | null | undefined;
  /** Черновик активен только пока форма открыта. */
  enabled?: boolean;
  /** Текущее состояние формы. */
  data: T;
  /** Текущий шаг — восстанавливается вместе с данными. */
  step?: number;
  /**
   * Состояние «пустой формы». Если снимок совпадает с ним — черновик не пишем,
   * чтобы плашка не появлялась на нетронутых формах.
   */
  defaults?: Partial<T>;
  /** Вызывается один раз при открытии, если найден непустой черновик. */
  onRestore: (data: T, step: number) => void;
}

export interface WizardDraftControls {
  /** Черновик был восстановлен в этой сессии открытия формы. */
  restored: boolean;
  /** Шаг, на котором пользователь остановился. */
  restoredStep: number;
  /** Стереть черновик и сбросить признак восстановления («Начать заново» / «Отмена» / отправка). */
  clearDraft: () => void;
  /** Скрыть плашку, не трогая данные. */
  dismissNotice: () => void;
}

/**
 * Сохраняет снимок формы в sessionStorage и восстанавливает его при следующем
 * открытии. Компонент продолжает владеть своим состоянием — хук только
 * зеркалит его и один раз отдаёт обратно через `onRestore`.
 */
export function useWizardDraft<T>({
  key,
  enabled = true,
  data,
  step = 0,
  defaults,
  onRestore,
}: UseWizardDraftOptions<T>): WizardDraftControls {
  const userId = useAuthStore((s) => s.user?.id);
  const storageKey = key ? `${PREFIX}${userId ?? 'anon'}:${key}` : null;

  const [restored, setRestored] = useState(false);
  const [restoredStep, setRestoredStep] = useState(0);

  // Колбэк меняет идентичность каждый рендер — держим в ref, чтобы не
  // перезапускать восстановление.
  const onRestoreRef = useRef(onRestore);
  useEffect(() => {
    onRestoreRef.current = onRestore;
  });

  // Пока восстановление не отработало, писать нельзя — пустая начальная форма
  // затёрла бы черновик.
  const readyRef = useRef(false);
  const restoreDoneForRef = useRef<string | null>(null);
  const resumeTimerRef = useRef<number | null>(null);

  const clearDraft = useCallback(() => {
    if (storageKey) removeEnvelope(storageKey);
    setRestored(false);
    setRestoredStep(0);

    // Глушим запись до конца тика: после отправки/отмены форма тут же
    // размонтируется, и финальный сброс записал бы черновик обратно.
    // «Начать заново» продолжает работать — запись возобновится следующим тиком.
    readyRef.current = false;
    if (resumeTimerRef.current !== null) window.clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = window.setTimeout(() => {
      readyRef.current = true;
      resumeTimerRef.current = null;
    }, 0);
  }, [storageKey]);

  useEffect(
    () => () => {
      if (resumeTimerRef.current !== null) window.clearTimeout(resumeTimerRef.current);
    },
    [],
  );

  const dismissNotice = useCallback(() => setRestored(false), []);

  // ── Восстановление: один раз на каждое открытие формы ──────────────────
  useEffect(() => {
    if (!storageKey || !enabled) {
      // Форма закрылась — снимаем защёлки, чтобы следующее открытие
      // отработало восстановление заново.
      if (!enabled) {
        readyRef.current = false;
        restoreDoneForRef.current = null;
      }
      return;
    }
    if (restoreDoneForRef.current === storageKey) return;
    restoreDoneForRef.current = storageKey;

    const envelope = readEnvelope<T>(storageKey);

    // Восстанавливаем в микрозадаче, а не в теле эффекта: форма успевает
    // смонтироваться целиком, и обновление её состояния не каскадит поверх
    // текущего рендера.
    let readyId: number | undefined;
    const restoreId = window.setTimeout(() => {
      if (envelope) {
        onRestoreRef.current(envelope.data, envelope.step);
        setRestored(true);
        setRestoredStep(envelope.step);
      } else {
        setRestored(false);
        setRestoredStep(0);
      }

      // Ещё тик: setState из onRestore применяется, и только после этого
      // разрешаем запись — иначе сохранили бы пустую форму поверх черновика.
      readyId = window.setTimeout(() => {
        readyRef.current = true;
      }, 0);
    }, 0);

    return () => {
      window.clearTimeout(restoreId);
      if (readyId !== undefined) window.clearTimeout(readyId);
    };
  }, [storageKey, enabled]);

  // ── Сохранение: дебаунс, пустые формы игнорируем ───────────────────────
  const serialized = serialize(data);
  const serializedDefaults = serialize(defaults ?? {});
  const isEmpty = serialized === 'null' || serialized === serializedDefaults;

  // Последний снимок для немедленного сброса на диск. Обновляется в эффекте
  // того же коммита, поэтому к моменту размонтирования всегда актуален.
  const pendingRef = useRef({ serialized, step, isEmpty, storageKey });
  useEffect(() => {
    pendingRef.current = { serialized, step, isEmpty, storageKey };
  }, [serialized, step, isEmpty, storageKey]);

  // Дебаунс: пишем через паузу после последнего изменения.
  useEffect(() => {
    if (!storageKey || !enabled) return;

    if (isEmpty) {
      // Пользователь очистил всё, что вводил, — черновик больше не нужен.
      if (readyRef.current) removeEnvelope(storageKey);
      return;
    }

    const id = window.setTimeout(() => {
      if (!readyRef.current) return;
      writeEnvelope(storageKey, {
        v: VERSION,
        step,
        data: JSON.parse(serialized) as T,
        savedAt: Date.now(),
      });
    }, SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(id);
  }, [storageKey, enabled, serialized, isEmpty, step]);

  // ── Страховка: дописать при закрытии формы или вкладки ─────────────────
  // Дебаунс мог не успеть — последние ~400 мс ввода иначе потерялись бы.
  useEffect(() => {
    if (!storageKey || !enabled) return;

    const flush = () => {
      if (!readyRef.current) return;
      const pending = pendingRef.current;
      if (!pending.storageKey || pending.isEmpty) return;
      writeEnvelope(pending.storageKey, {
        v: VERSION,
        step: pending.step,
        data: JSON.parse(pending.serialized) as T,
        savedAt: Date.now(),
      });
    };

    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [storageKey, enabled]);

  return { restored, restoredStep, clearDraft, dismissNotice };
}

/** Стереть черновик формы извне (например, после успешной отправки в родителе). */
export function clearWizardDraft(key: string, userId?: string | null): void {
  removeEnvelope(`${PREFIX}${userId ?? 'anon'}:${key}`);
}
