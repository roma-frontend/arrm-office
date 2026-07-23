// Server-side translation helper for Convex functions
// This provides translations without i18next dependency

type Locale = 'en' | 'hy' | 'ru';

interface Translations {
  [key: string]: {
    [key: string]: string;
  };
}

// Minimal translations for system messages
const translations: Translations = {
  en: {
    'ticket.chatCreated':
      'Chat created for ticket {ticketNumber}. You will see this chat after the first message from superadmin.',
    'ticket.chatCreatedShort': 'Chat created for ticket {ticketNumber}',
  },
  hy: {
    'ticket.chatCreated':
      'Չաթը ստեղծվել է տոմսի համար {ticketNumber}: Դուք կտեսնեք այս չաթը սուպերադմինի առաջին հաղորդագրությունից հետո։',
    'ticket.chatCreatedShort': 'Չաթը ստեղծվել է տոմսի համար {ticketNumber}',
  },
  ru: {
    'ticket.chatCreated':
      'Чат создан для тикета {ticketNumber}. Вы увидите этот чат после первого сообщения от суперадмина.',
    'ticket.chatCreatedShort': 'Чат создан для тикета {ticketNumber}',
  },
};

export function getTranslation(
  locale: Locale,
  key: string,
  params?: Record<string, string>,
): string {
  const langTranslations = translations[locale] || translations['en'];
  let text = langTranslations?.[key] || translations['en']?.[key] || key;

  // Replace placeholders like {ticketNumber}
  if (params) {
    Object.entries(params).forEach(([placeholder, value]) => {
      text = text.replace(`{${placeholder}}`, value);
    });
  }

  return text;
}

export function getUserLocale(language: string | undefined): Locale {
  if (language === 'hy') return 'hy';
  if (language === 'ru') return 'ru';
  return 'en';
}
