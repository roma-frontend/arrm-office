# Translation Files Exploration - Desktop/office Project

## Overview

The Desktop/office project uses **i18next** for internationalization (i18n) with support for three languages:
- **English (en)** - Default language
- **Russian (ru)** - Russian localization
- **Armenian (hy)** - Armenian localization

---

## File Structure

### Location
```
Desktop/office/
├── src/
│   ├── i18n/
│   │   ├── config.ts           # i18n configuration
│   │   └── locales/
│   │       ├── en.json         # English translations
│   │       ├── en.json.backup  # English backup
│   │       ├── ru.json         # Russian translations
│   │       └── hy.json         # Armenian translations
│   ├── components/
│   │   ├── I18nProvider.tsx    # i18n context provider
│   │   ├── LanguageSwitcher.tsx # Language switcher component
│   │   ├── KeyboardShortcutsModal.tsx
│   │   └── CookieBanner.tsx
│   └── __tests__/
│       └── i18n.test.ts        # i18n tests
└── .translation-backups/       # Historical translation backups
    ├── hy_*.json
    ├── ru_*.json
    └── (multiple backup versions)
```

---

## Translation Files Statistics

| Language | File | Size | Lines | Status |
|----------|------|------|-------|--------|
| English | en.json | 82.48 KB | 1,974 | Primary |
| Russian | ru.json | 214.94 KB | 4,611 | Complete |
| Armenian | hy.json | 131.08 KB | 2,641 | Complete |

**Note:** Russian file is significantly larger, likely due to encoding differences or extended content.

---

## i18n Configuration (`src/i18n/config.ts`)

```typescript
// Key features:
- Uses i18next library with React integration (react-i18next)
- Browser language detection via i18next-browser-languagedetector
- localStorage persistence for language preference (key: 'i18nextLng')
- Supported languages: ['en', 'hy', 'ru']
- Default language: 'en'
- Namespace: 'translation' (defaultNS)
- SSR support: Suspense disabled for server-side rendering
```

### Language Detection Order (Client-side)
1. localStorage ('i18nextLng')
2. Browser navigator language
3. HTML lang attribute
4. Query string parameter ('lng')
5. Cookie ('i18next')

---

## Translation File Structure

Each translation file is a JSON object with nested keys following this hierarchy:

### Top-Level Categories

1. **landing** - Landing page content
   - Hero section, leave types, feature descriptions
   - Call-to-action messaging

2. **socialProof** - Social proof elements
   - Active users, customer ratings, uptime metrics
   - Company count, growth statistics

3. **pricing** - Pricing page content
   - Plan names (Free, Starter, Professional, Enterprise)
   - Feature lists, billing information
   - Plan descriptions and comparisons

4. **testimonials** - Customer testimonials
   - Section headers and subtitles

5. **common** - Common UI elements
   - Basic actions: Save, Cancel, Delete, Edit, etc.
   - Navigation terms, common labels
   - Form inputs, confirmations

6. **nav** - Navigation items
   - Dashboard, Employees, Leaves, Attendance
   - Reports, Analytics, Settings, Profile
   - Admin/SuperAdmin sections

7. **auth** - Authentication & authorization
   - Login, Registration, Password reset
   - Email, password validation messages
   - OAuth options (Google, Facebook, Apple)

8. **dashboard** - Dashboard content
   - Stats labels, quick actions
   - Analytics and reporting terms
   - Team and activity descriptions

9. **leave** - Leave management
   - Leave types: Vacation, Sick, Personal, Family, etc.
   - Leave request statuses and actions
   - Balance information

10. **employees** - Employee management
    - CRUD operations, filters
    - Department and role labels
    - Profile and attribute names

11. **reports** - Reporting functionality
    - Report types and generation
    - Export formats (PDF, Excel, CSV)
    - Analytics and insights

12. **settings** - Settings pages
    - Profile, account, security settings
    - Notification preferences
    - Theme and language selection
    - GDPR compliance and privacy

13. **notifications** - Notification messages
    - Leave approvals/rejections
    - Task assignments and completions
    - System updates and alerts
    - Login and security notifications

14. **errors** - Error messages
    - Validation errors
    - Required field messages
    - Server error messages

15. **success** - Success messages
    - Saved, Updated, Created confirmations
    - Action completion messages

16. **placeholders** - Form placeholders
    - Input field prompts
    - Search suggestions

17. **buttons** - Button labels
    - Send, Save, Cancel, Update
    - Learn More, Get Started

18. **months** - Calendar months
    - Full month names in each language

19. **weekdays** - Calendar weekdays
    - Short and full day names

20. **departments** - Department options
    - Engineering, HR, Finance, etc.

21. **ariaLabels** - Accessibility labels
    - Screen reader descriptions
    - ARIA label content

22. **titles** - Page titles
    - Section titles, page names

23. **aiSiteEditor** - AI Site Editor feature
    - Feature descriptions
    - Usage limits and upgrade messaging
    - Tips and guides

---

## Sample Translations Comparison

### English (en.json)
```json
{
  "landing": {
    "scroll": "Scroll",
    "leaveTypes": "Leave Types",
    "hrLeave": "HRLeave"
  },
  "pricing": {
    "eyebrow": "Pricing",
    "headingStart": "Exclusive,",
    "headingHighlight": "transparent pricing",
    "free": "Free",
    "starter": "Starter",
    "professional": "Professional",
    "enterprise": "Enterprise"
  },
  "common": {
    "or": "or",
    "welcome": "Welcome",
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete"
  }
}
```

### Russian (ru.json)
```json
{
  "landing": {
    "scroll": "Прокрутить",
    "leaveTypes": "Типы отпусков",
    "hrLeave": "HRLeave",
    "heroTitle": "Упростите HR с помощью AI",
    "heroSubtitle": "Универсальная платформа для управления отпусками, учета посещаемости и командной работы"
  },
  "pricing": {
    "eyebrow": "Цены",
    "headingStart": "Эксклюзивные,",
    "headingHighlight": "прозрачные цены",
    "free": "Бесплатно",
    "starter": "Starter",
    "professional": "Professional",
    "enterprise": "Enterprise"
  },
  "common": {
    "or": "или",
    "welcome": "Добро пожаловать",
    "save": "Сохранить",
    "cancel": "Отменить",
    "delete": "Удалить"
  }
}
```

### Armenian (hy.json)
```json
{
  "landing": {
    "scroll": "Ոլորել",
    "leaveTypes": "Արձակուրդների տեսակներ",
    "hrLeave": "HRLeave",
    "heroTitle": "Պարզեցրեք HR-ը AI-ով",
    "heroSubtitle": "Համապարփակ պլատֆորմ արձակուրդների կառավարման, ներկայության հաշվառման և թիմային համագործակցության համար"
  },
  "pricing": {
    "eyebrow": "Գնագոյացում",
    "headingStart": "Բացառիկ,",
    "headingHighlight": "թափանցիկ գնագոյացում",
    "free": "Անվճար",
    "starter": "Starter",
    "professional": "Professional",
    "enterprise": "Enterprise"
  },
  "common": {
    "or": "կամ",
    "welcome": "Բարի գալուստ",
    "save": "Պահպանել",
    "cancel": "Չեղարկել",
    "delete": "Ջնջել"
  }
}
```

---

## Language Switcher Component

### File: `src/components/LanguageSwitcher.tsx`

Features:
- Dropdown menu with language options
- Displays language name and flag emoji
  - 🇬🇧 English
  - 🇦🇲 Հայերեն (Armenian)
  - 🇷🇺 Русский (Russian)
- Saves language preference to localStorage
- Integrates with i18next for runtime language switching
- Responsive design (full name on desktop, flag only on mobile)

```typescript
const languages = {
  en: { name: 'English', flag: '🇬🇧' },
  hy: { name: 'Հայերեն', flag: '🇦🇲' },
  ru: { name: 'Русский', flag: '🇷🇺' },
};
```

---

## i18n Provider Component

### File: `src/components/I18nProvider.tsx`

Features:
- Client-side wrapper component for i18n initialization
- Detects and applies saved language from localStorage
- Validates language codes against supported languages
- Smooth transition effects during language switching
- Handles hydration mismatches in SSR scenarios
- Updates HTML `lang` attribute for accessibility

Key behavior:
1. On mount, checks localStorage for saved language
2. Validates against ['en', 'hy', 'ru']
3. Applies saved language or defaults to 'en'
4. Persists language changes
5. Provides smooth visual feedback during language changes

---

## Usage in Components

### Example: Using `useTranslation` hook

```typescript
import { useTranslation } from 'react-i18next';

export function MyComponent() {
  const { t, i18n } = useTranslation();
  const currentLanguage = i18n.language;
  
  // Access translations
  const greeting = t('common.welcome');
  const saveBtn = t('buttons.save');
  
  // Change language
  const changeLanguage = async (lng: string) => {
    await i18n.changeLanguage(lng);
  };
  
  return (
    <div>
      <h1>{greeting}</h1>
      <button onClick={() => changeLanguage('ru')}>
        {t('common.language')}
      </button>
    </div>
  );
}
```

---

## Persistence & Storage

### localStorage Key
- **Key:** `i18nextLng`
- **Value:** Language code ('en', 'hy', or 'ru')
- **Scope:** Client-side only

### HTML Attribute
- **Updated:** `document.documentElement.lang`
- **Purpose:** Accessibility and SEO

---

## Known Issues & Notes

1. **Encoding Issues**: Some entries in en.json and ru.json show encoding artifacts (visible garbled text) - these may be corrupted entries from previous translation processes
2. **Backup Strategy**: Multiple backup files exist in `.translation-backups/` directory
3. **File Size Variation**: Russian file is ~2.6x larger than English, possibly due to:
   - Extended content translations
   - Character encoding variations
   - Additional language-specific keys

---

## Testing

### Test File: `src/__tests__/i18n.test.ts`

Tests i18n configuration and language switching functionality.

---

## Features by Language Coverage

### Complete Translations Include:
- Landing page content
- Pricing page (all plan types)
- Authentication & registration flows
- Dashboard layouts and widgets
- Employee management system
- Leave request workflows
- Reports and analytics
- Settings and preferences
- Error and success messages
- Accessibility labels (ARIA)
- Navigation menus
- Button labels
- Form placeholders
- Calendar information
- Department and role labels

### Supported Regions:
- **Armenian (hy)**: Armenia and Armenian diaspora
- **Russian (ru)**: Russia and Russian-speaking regions
- **English (en)**: Global audience

---

## Translation Management

### Scripts Available (in `Desktop/office/scripts/`)
- `auto-translate.js` - Automated translation generation
- `batch-translate-*.js` - Batch translation updates
- `add-translations.js` - Add new translation keys
- `fix-unicode-translations.js` - Fix encoding issues
- `test-translations.js` - Validate translation files

### Configuration Import
```typescript
// In config.ts
import enTranslations from './locales/en.json';
import hyTranslations from './locales/hy.json';
import ruTranslations from './locales/ru.json';

export const resources = {
  en: { translation: enTranslations },
  hy: { translation: hyTranslations },
  ru: { translation: ruTranslations },
};
```

---

## Next Steps for Enhancement

1. **Audit Encoding Issues**: Fix garbled text in some entries
2. **Add More Languages**: Spanish, French, German, etc.
3. **Implement Key Validation**: Ensure all keys exist across all languages
4. **Add Translation Memory**: Track translation changes over time
5. **Create Translation Guidelines**: Document best practices for translators
6. **Set Up Automated Testing**: Verify translation completeness
7. **Implement RTL Support**: If adding Hebrew, Arabic, etc.

---

## References

- **i18next Documentation**: https://www.i18next.com/
- **react-i18next**: https://react.i18next.com/
- **i18next-browser-languagedetector**: https://github.com/i18next/i18next-browser-languageDetector

