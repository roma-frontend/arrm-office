/**
 * Runtime check for the hiring packet strings.
 *
 * The reported defect: with Russian selected, the buttons on the hiring packet
 * panel showed English tooltips ("Preview", "Download PDF", "Ready to send",
 * "required"). The whole `hiringPacket` group was missing from every locale
 * file, so every call fell through to its inline English `defaultValue`.
 *
 * `i18nKeys.test.ts` guards key presence statically. This suite boots a real
 * i18next instance on the shipped JSON and asserts what a Russian user actually
 * sees — including the plural categories, which a static key scan cannot check:
 * i18next resolves `hiringPacket.sendAll` to `_one`/`_few`/`_many` depending on
 * the count, and a missing category silently renders the English default.
 */
import { describe, it, expect, beforeAll } from '@jest/globals';
import { createInstance, type i18n as I18n } from 'i18next';

import enCommon from '../../public/locales/en/common.json';
import ruCommon from '../../public/locales/ru/common.json';
import hyCommon from '../../public/locales/hy/common.json';
import deCommon from '../../public/locales/de/common.json';
import enEmployees from '../../public/locales/en/employees.json';
import ruEmployees from '../../public/locales/ru/employees.json';

/** Tooltips and labels of the packet row — the buttons in the bug report. */
const TOOLTIP_KEYS = [
  'hiringPacket.preview',
  'hiringPacket.downloadPdf',
  'hiringPacket.editInWord',
  'hiringPacket.uploadEdited',
  'hiringPacket.revert',
  'hiringPacket.include',
  'hiringPacket.exclude',
  'hiringPacket.signedPdf',
  'hiringPacket.downloadSignedDocx',
] as const;

/** Badges and markers rendered next to the document title. */
const LABEL_KEYS = [
  'hiringPacket.title',
  'hiringPacket.mandatory',
  'hiringPacket.send',
  'hiringPacket.statusDraft',
  'hiringPacket.statusSent',
  'hiringPacket.statusSigned',
  'hiringPacket.statusEdited',
  'hiringPacket.statusSkipped',
] as const;

const CYRILLIC = /[\u0400-\u04FF]/;
const ARMENIAN = /[\u0530-\u058F]/;

function instance(lng: string): I18n {
  const i18n = createInstance();
  void i18n.init({
    lng,
    fallbackLng: false,
    ns: ['common', 'employees'],
    defaultNS: 'common',
    fallbackNS: ['common', 'employees'],
    initImmediate: false,
    interpolation: { escapeValue: false },
    resources: {
      en: { common: enCommon, employees: enEmployees },
      ru: { common: ruCommon, employees: ruEmployees },
      hy: { common: hyCommon },
      de: { common: deCommon },
    },
  });
  return i18n;
}

describe('hiring packet locale', () => {
  let ru: I18n;
  let en: I18n;

  beforeAll(() => {
    ru = instance('ru');
    en = instance('en');
  });

  it.each([...TOOLTIP_KEYS, ...LABEL_KEYS])('translates %s into Russian', (key) => {
    // The English default is passed as the second argument in the component; if
    // the key were missing, t() would return exactly that string.
    const value = ru.t(key, 'ENGLISH_FALLBACK');
    expect(value).not.toBe('ENGLISH_FALLBACK');
    expect(value).not.toBe(en.t(key));
    expect(value).toMatch(CYRILLIC);
  });

  it('translates the packet tooltips into Armenian and German', () => {
    const hy = instance('hy');
    const de = instance('de');
    for (const key of TOOLTIP_KEYS) {
      expect(hy.t(key, 'ENGLISH_FALLBACK')).toMatch(ARMENIAN);
      expect(de.t(key, 'ENGLISH_FALLBACK')).not.toBe('ENGLISH_FALLBACK');
      expect(de.t(key, 'ENGLISH_FALLBACK')).not.toBe(en.t(key));
    }
  });

  it('picks the right Russian plural category for the send button', () => {
    // one / few / many are three distinct forms in Russian; the count must
    // appear in each and none may fall back to English.
    for (const count of [1, 2, 5, 21]) {
      const value = ru.t('hiringPacket.sendAll', { count, defaultValue: 'ENGLISH_FALLBACK' });
      expect(value).toContain(String(count));
      expect(value).toMatch(CYRILLIC);
    }
  });

  it.each([
    'hiringPacket.sentCount',
    'hiringPacket.mandatoryOutstanding',
    'hiringPacket.localeChanged',
  ])('declines %s across the Russian plural forms', (key) => {
    const forms = [1, 2, 5].map((count) => ru.t(key, { count, defaultValue: 'ENGLISH_FALLBACK' }));
    for (const form of forms) {
      expect(form).not.toBe('ENGLISH_FALLBACK');
      expect(form).toMatch(CYRILLIC);
    }
    // Russian singular and plural differ; identical forms mean a missing category.
    expect(forms[0]).not.toBe(forms[2]);
  });

  it('interpolates the signed/total progress line', () => {
    const value = ru.t('hiringPacket.progress', {
      signed: 2,
      total: 7,
      defaultValue: 'ENGLISH_FALLBACK',
    });
    expect(value).toContain('2');
    expect(value).toContain('7');
    expect(value).toMatch(CYRILLIC);
  });

  it('translates the add-employee packet section, including the date of birth field', () => {
    for (const key of [
      'hiringPacket.subtitle',
      'hiringPacket.secondLanguage',
      'hiringPacket.generateNowHint',
      'hiringPacket.generateFailed',
      'employees.dateOfBirth',
      'employees.dateOfBirthHint',
    ]) {
      expect(ru.t(key, 'ENGLISH_FALLBACK')).toMatch(CYRILLIC);
    }
    expect(
      ru.t('hiringPacket.generateNow', { count: 8, defaultValue: 'ENGLISH_FALLBACK' }),
    ).toContain('8');
    expect(
      ru.t('hiringPacket.createdWithPacket', { count: 8, defaultValue: 'ENGLISH_FALLBACK' }),
    ).toMatch(CYRILLIC);
  });
});
