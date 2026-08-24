/**
 * Tests for useDocumentLabels hook — returns localized labels for documents.
 *
 * Covers: all 6 labels returned, correct i18n key usage, fallback defaults.
 */
import { renderHook } from '@testing-library/react';
import { useDocumentLabels } from '@/hooks/useDocumentLabels';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      const labels: Record<string, string> = {
        'docLibrary.signature': 'Подпись',
        'docLibrary.nameLabel': 'Имя',
        'docLibrary.positionLabel': 'Должность',
        'docLibrary.dateLabel': 'Дата',
        'docLibrary.generatedOn': 'Сгенерировано',
        'docLibrary.integrity': 'Целостность',
      };
      return labels[key] ?? fallback ?? key;
    },
  }),
}));

describe('useDocumentLabels', () => {
  it('returns all 6 labels', () => {
    const { result } = renderHook(() => useDocumentLabels());
    expect(Object.keys(result.current)).toHaveLength(6);
  });

  it('returns localized signature', () => {
    const { result } = renderHook(() => useDocumentLabels());
    expect(result.current.signature).toBe('Подпись');
  });

  it('returns localized nameLabel', () => {
    const { result } = renderHook(() => useDocumentLabels());
    expect(result.current.name).toBe('Имя');
  });

  it('returns localized positionLabel', () => {
    const { result } = renderHook(() => useDocumentLabels());
    expect(result.current.position).toBe('Должность');
  });

  it('returns localized dateLabel', () => {
    const { result } = renderHook(() => useDocumentLabels());
    expect(result.current.date).toBe('Дата');
  });

  it('returns localized generatedOn', () => {
    const { result } = renderHook(() => useDocumentLabels());
    expect(result.current.generatedOn).toBe('Сгенерировано');
  });

  it('returns localized integrity', () => {
    const { result } = renderHook(() => useDocumentLabels());
    expect(result.current.integrity).toBe('Целостность');
  });

  it('uses fallback defaults when translation is missing', () => {
    jest.spyOn(require('react-i18next'), 'useTranslation').mockReturnValue({
      t: (key: string, fallback?: string) => fallback ?? key,
    });

    const { result } = renderHook(() => useDocumentLabels());
    expect(result.current.signature).toBe('Signature');
    expect(result.current.name).toBe('Name');
    expect(result.current.position).toBe('Position');
    expect(result.current.date).toBe('Date');
    expect(result.current.generatedOn).toBe('Generated on');
    expect(result.current.integrity).toBe('Integrity');

    jest.restoreAllMocks();
  });
});
