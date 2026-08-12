/**
 * Tests for useWizardDraft — черновики многошаговых форм.
 *
 * Проверяем главный сценарий из задачи: внезапно закрылась модалка →
 * заполненные данные не потерялись.
 */
import { renderHook, act } from '@testing-library/react';
import { useWizardDraft, clearWizardDraft } from '@/hooks/useWizardDraft';

// Управляемый id пользователя — проверяем изоляцию черновиков между людьми.
let mockUserId: string | null = 'user-1';

jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({
      user: mockUserId ? { id: mockUserId } : null,
    } as unknown),
}));

interface FormData {
  name?: string;
  email?: string;
}

/** Прогоняет таймеры восстановления (2 тика) и дебаунса записи. */
function settle() {
  act(() => {
    jest.advanceTimersByTime(0);
  });
  act(() => {
    jest.advanceTimersByTime(0);
  });
  act(() => {
    jest.advanceTimersByTime(500);
  });
}

describe('useWizardDraft', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockUserId = 'user-1';
    window.sessionStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not persist an untouched form', () => {
    const { unmount } = renderHook(() =>
      useWizardDraft<FormData>({ key: 'test', data: {}, onRestore: jest.fn() }),
    );
    settle();
    unmount();

    expect(window.sessionStorage.getItem('wizard-draft:user-1:test')).toBeNull();
  });

  it('persists entered data and restores it on the next open', () => {
    // Первое открытие: пользователь что-то ввёл.
    const first = renderHook(
      ({ data }: { data: FormData }) =>
        useWizardDraft<FormData>({ key: 'test', data, step: 2, onRestore: jest.fn() }),
      { initialProps: { data: {} as FormData } },
    );
    settle();
    first.rerender({ data: { name: 'Иван Смирнов' } });
    settle();

    // Модалка внезапно закрылась.
    first.unmount();

    // Второе открытие: данные вернулись вместе с шагом.
    const onRestore = jest.fn();
    renderHook(() => useWizardDraft<FormData>({ key: 'test', data: {}, onRestore }));
    settle();

    expect(onRestore).toHaveBeenCalledWith({ name: 'Иван Смирнов' }, 2);
  });

  it('flags restored state so the notice can render', () => {
    const first = renderHook(
      ({ data }: { data: FormData }) =>
        useWizardDraft<FormData>({ key: 'test', data, step: 1, onRestore: jest.fn() }),
      { initialProps: { data: {} as FormData } },
    );
    settle();
    first.rerender({ data: { name: 'Иван' } });
    settle();
    first.unmount();

    const { result } = renderHook(() =>
      useWizardDraft<FormData>({ key: 'test', data: {}, onRestore: jest.fn() }),
    );
    settle();

    expect(result.current.restored).toBe(true);
    expect(result.current.restoredStep).toBe(1);
  });

  it('clearDraft wipes storage and survives the closing flush', () => {
    const { result, rerender, unmount } = renderHook(
      ({ data }: { data: FormData }) =>
        useWizardDraft<FormData>({ key: 'test', data, onRestore: jest.fn() }),
      { initialProps: { data: {} as FormData } },
    );
    settle();
    rerender({ data: { name: 'Иван' } });
    settle();
    expect(window.sessionStorage.getItem('wizard-draft:user-1:test')).not.toBeNull();

    // Отправка формы / «Отмена» → черновик стирается, и последующий
    // размонтаж не записывает его обратно.
    act(() => {
      result.current.clearDraft();
    });
    unmount();

    expect(window.sessionStorage.getItem('wizard-draft:user-1:test')).toBeNull();
  });

  it('drops the draft when the user clears every field', () => {
    const { rerender } = renderHook(
      ({ data }: { data: FormData }) =>
        useWizardDraft<FormData>({ key: 'test', data, onRestore: jest.fn() }),
      { initialProps: { data: {} as FormData } },
    );
    settle();
    rerender({ data: { name: 'Иван' } });
    settle();
    expect(window.sessionStorage.getItem('wizard-draft:user-1:test')).not.toBeNull();

    rerender({ data: { name: '' } });
    settle();

    expect(window.sessionStorage.getItem('wizard-draft:user-1:test')).toBeNull();
  });

  it('treats a form matching its defaults as untouched', () => {
    const { rerender, unmount } = renderHook(
      ({ data }: { data: Record<string, string> }) =>
        useWizardDraft({
          key: 'test',
          data,
          defaults: { currency: 'AMD' },
          onRestore: jest.fn(),
        }),
      { initialProps: { data: { currency: 'AMD' } } },
    );
    settle();
    rerender({ data: { currency: 'AMD' } });
    settle();
    unmount();

    expect(window.sessionStorage.getItem('wizard-draft:user-1:test')).toBeNull();
  });

  it('does nothing when no key is given', () => {
    const onRestore = jest.fn();
    const { rerender } = renderHook(
      ({ data }: { data: FormData }) =>
        useWizardDraft<FormData>({ key: undefined, data, onRestore }),
      { initialProps: { data: {} as FormData } },
    );
    settle();
    rerender({ data: { name: 'Иван' } });
    settle();

    expect(window.sessionStorage.length).toBe(0);
    expect(onRestore).not.toHaveBeenCalled();
  });

  it('keeps drafts of different users apart', () => {
    // Пользователь A заполняет форму и закрывает её.
    mockUserId = 'user-a';
    const a = renderHook(
      ({ data }: { data: FormData }) =>
        useWizardDraft<FormData>({ key: 'test', data, onRestore: jest.fn() }),
      { initialProps: { data: {} as FormData } },
    );
    settle();
    a.rerender({ data: { name: 'Черновик А' } });
    settle();
    a.unmount();
    expect(window.sessionStorage.getItem('wizard-draft:user-a:test')).not.toBeNull();

    // Пользователь B открывает ту же форму — черновик А не восстанавливается.
    mockUserId = 'user-b';
    const onRestoreB = jest.fn();
    renderHook(() => useWizardDraft<FormData>({ key: 'test', data: {}, onRestore: onRestoreB }));
    settle();
    expect(onRestoreB).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem('wizard-draft:user-b:test')).toBeNull();

    // Черновик А по-прежнему лежит под его ключом.
    expect(window.sessionStorage.getItem('wizard-draft:user-a:test')).not.toBeNull();
  });

  it('falls back to an anon namespace when the user is unknown', () => {
    mockUserId = null;
    const { rerender, unmount } = renderHook(
      ({ data }: { data: FormData }) =>
        useWizardDraft<FormData>({ key: 'test', data, onRestore: jest.fn() }),
      { initialProps: { data: {} as FormData } },
    );
    settle();
    rerender({ data: { name: 'Иван' } });
    settle();
    unmount();

    expect(window.sessionStorage.getItem('wizard-draft:anon:test')).not.toBeNull();
    expect(window.sessionStorage.getItem('wizard-draft:user-1:test')).toBeNull();
  });

  it('keeps drafts of different forms apart', () => {
    const a = renderHook(
      ({ data }: { data: FormData }) =>
        useWizardDraft<FormData>({ key: 'form-a', data, onRestore: jest.fn() }),
      { initialProps: { data: {} as FormData } },
    );
    settle();
    a.rerender({ data: { name: 'A' } });
    settle();
    a.unmount();

    const onRestoreB = jest.fn();
    renderHook(() => useWizardDraft<FormData>({ key: 'form-b', data: {}, onRestore: onRestoreB }));
    settle();

    expect(onRestoreB).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem('wizard-draft:user-1:form-a')).not.toBeNull();
  });

  it('skips File values, which cannot be serialized', () => {
    const file = new File(['x'], 'passport.png', { type: 'image/png' });
    const { rerender, unmount } = renderHook(
      ({ data }: { data: Record<string, unknown> }) =>
        useWizardDraft({ key: 'test', data, onRestore: jest.fn() }),
      { initialProps: { data: {} as Record<string, unknown> } },
    );
    settle();
    rerender({ data: { scan: file, title: 'Паспорт' } });
    settle();
    unmount();

    const raw = window.sessionStorage.getItem('wizard-draft:user-1:test');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string).data).toEqual({ title: 'Паспорт' });
  });

  it('clearWizardDraft removes a draft from outside the hook', () => {
    const { rerender, unmount } = renderHook(
      ({ data }: { data: FormData }) =>
        useWizardDraft<FormData>({ key: 'test', data, onRestore: jest.fn() }),
      { initialProps: { data: {} as FormData } },
    );
    settle();
    rerender({ data: { name: 'Иван' } });
    settle();
    unmount();

    clearWizardDraft('test', 'user-1');

    expect(window.sessionStorage.getItem('wizard-draft:user-1:test')).toBeNull();
  });
});
