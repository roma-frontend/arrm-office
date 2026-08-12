/**
 * Smart Password Validation System
 * Provides real-time password strength analysis with helpful suggestions
 *
 * Localization:
 *   Pass an i18next-style `t` function to `validatePassword(password, t)` to
 *   receive translated `requirements[].label`, `feedback[].message`, and
 *   `suggestions[]` strings. Without a translator, Russian fallbacks are
 *   returned (preserves backwards compatibility with existing tests).
 */

/**
 * Minimal i18next-compatible translator signature.
 *
 * `defaultValue` is required, not optional: i18next's own `TFunction` overloads
 * are `(key, options?)` and `(key, defaultValue: string, options?)`, and neither
 * accepts a second argument of type `string | undefined`. Declaring it optional
 * here made `react-i18next`'s `t` unassignable to this type, which is how
 * `SmartEmailInput` broke the production build. Callers that only translate a
 * key still fit — a function taking fewer parameters is assignable to one
 * taking more.
 */
export type Translator = (key: string, defaultValue: string) => string;

export interface PasswordValidationResult {
  isValid: boolean;
  score: number; // 0-100
  strength: 'weak' | 'fair' | 'good' | 'strong' | 'excellent';
  feedback: {
    type: 'error' | 'warning' | 'success' | 'info';
    message: string;
    icon?: string;
  }[];
  suggestions: string[];
  requirements: PasswordRequirement[];
}

export interface PasswordRequirement {
  id: string;
  label: string;
  met: boolean;
  required: boolean;
}

/** Russian fallback strings used when no translator is provided. */
const RU_FALLBACK: Record<string, string> = {
  'auth.passwordValidation.requirements.length': 'Минимум 8 символов',
  'auth.passwordValidation.requirements.uppercase': 'Хотя бы одна заглавная буква (A-Z)',
  'auth.passwordValidation.requirements.lowercase': 'Хотя бы одна строчная буква (a-z)',
  'auth.passwordValidation.requirements.number': 'Хотя бы одна цифра (0-9)',
  'auth.passwordValidation.requirements.special': 'Специальный символ (!@#$%^&*)',
  'auth.passwordValidation.requirements.long': '12+ символов для дополнительной безопасности',
  'auth.passwordValidation.feedback.empty': 'Введите пароль для проверки',
  'auth.passwordValidation.feedback.excellent': 'Превосходный пароль! Очень безопасный! 🎉',
  'auth.passwordValidation.feedback.strong': 'Надежный пароль! Хорошая защита.',
  'auth.passwordValidation.feedback.good': 'Неплохо, но можно лучше.',
  'auth.passwordValidation.feedback.fair': 'Слабоватый пароль. Усильте его!',
  'auth.passwordValidation.feedback.weak': 'Очень слабый пароль! Легко взломать.',
  'auth.passwordValidation.feedback.common': 'Этот пароль слишком распространен! Хакеры его знают.',
  'auth.passwordValidation.feedback.repeated': 'Избегайте повторяющихся символов (aaa, 111)',
  'auth.passwordValidation.feedback.sequential': 'Избегайте последовательностей (abc, 123)',
  'auth.passwordValidation.suggestions.addSpecial':
    'Добавьте специальные символы для большей надежности',
  'auth.passwordValidation.suggestions.mixAll': 'Используйте комбинацию букв, цифр и символов',
  'auth.passwordValidation.suggestions.increaseLength': 'Увеличьте длину до 12+ символов',
  'auth.passwordValidation.suggestions.minLength': 'Используйте минимум 8 символов',
  'auth.passwordValidation.suggestions.bothCases': 'Добавьте заглавные и строчные буквы',
  'auth.passwordValidation.suggestions.digitsAndSpecial': 'Включите цифры и специальные символы',
  'auth.passwordValidation.suggestions.avoidCommon':
    'Избегайте популярных паролей типа "password123"',
  'auth.passwordValidation.suggestions.addUppercase': 'Добавьте заглавную букву',
  'auth.passwordValidation.suggestions.addNumber': 'Добавьте цифру',
  'auth.passwordValidation.suggestions.addSpecialShort': 'Добавьте спецсимвол (!@#$%^&*)',
  'auth.passwordValidation.strength.weak': 'Слабый',
  'auth.passwordValidation.strength.fair': 'Средний',
  'auth.passwordValidation.strength.good': 'Хороший',
  'auth.passwordValidation.strength.strong': 'Надежный',
  'auth.passwordValidation.strength.excellent': 'Превосходный',
  'auth.emailValidation.empty': 'Введите email адрес',
  'auth.emailValidation.invalidFormat': 'Неверный формат email',
  'auth.emailValidation.example': 'Пример: user@example.com',
  'auth.emailValidation.didYouMean': 'Возможно, вы имели в виду {{domain}}?',
  'auth.emailValidation.missingTld': 'Отсутствует доменная зона (.com, .ru, и т.д.)',
  'auth.emailValidation.valid': 'Email корректен ✓',
  'auth.emailValidation.useSuggestion': 'Использовать предложение?',
};

function makeTranslate(t?: Translator) {
  return (key: string): string => {
    const fallback = RU_FALLBACK[key] ?? key;
    if (!t) return fallback;
    // Pass the RU fallback as i18next defaultValue so a missing key never
    // shows the raw key to the user.
    const value = t(key, fallback);
    return typeof value === 'string' && value.length > 0 ? value : fallback;
  };
}

/**
 * Comprehensive password validation with smart feedback.
 *
 * @param password The password to validate.
 * @param t       Optional i18next `t` function. When provided, all
 *                user-facing strings (requirements, feedback, suggestions)
 *                are translated; otherwise Russian fallbacks are used.
 */
export function validatePassword(password: string, t?: Translator): PasswordValidationResult {
  const tr = makeTranslate(t);

  const requirements: PasswordRequirement[] = [
    {
      id: 'length',
      label: tr('auth.passwordValidation.requirements.length'),
      met: password.length >= 8,
      required: true,
    },
    {
      id: 'uppercase',
      label: tr('auth.passwordValidation.requirements.uppercase'),
      met: /[A-Z]/.test(password),
      required: true,
    },
    {
      id: 'lowercase',
      label: tr('auth.passwordValidation.requirements.lowercase'),
      met: /[a-z]/.test(password),
      required: true,
    },
    {
      id: 'number',
      label: tr('auth.passwordValidation.requirements.number'),
      met: /[0-9]/.test(password),
      required: true,
    },
    {
      id: 'special',
      label: tr('auth.passwordValidation.requirements.special'),
      met: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
      required: false,
    },
    {
      id: 'long',
      label: tr('auth.passwordValidation.requirements.long'),
      met: password.length >= 12,
      required: false,
    },
  ];

  const requiredMet = requirements.filter((r) => r.required).every((r) => r.met);

  const _allMet = requirements.every((r) => r.met);

  // Calculate strength score (0-100)
  let score = 0;
  requirements.forEach((req) => {
    if (req.met) {
      score += req.required ? 20 : 10;
    }
  });

  // Additional scoring factors
  if (password.length >= 16) score += 10;
  if (/[А-Яа-я]/.test(password)) score += 5; // Cyrillic bonus

  // Penalty for common patterns
  if (/^[0-9]+$/.test(password)) score -= 20; // All numbers
  if (/^[a-zA-Z]+$/.test(password)) score -= 10; // Only letters
  if (/(.)\1{2,}/.test(password)) score -= 15; // Repeated characters (aaa, 111)
  if (/^(password|qwerty|123456|admin)/i.test(password)) score -= 50; // Common passwords

  score = Math.max(0, Math.min(100, score));

  // Determine strength level
  let strength: PasswordValidationResult['strength'];
  if (score >= 90) strength = 'excellent';
  else if (score >= 70) strength = 'strong';
  else if (score >= 50) strength = 'good';
  else if (score >= 30) strength = 'fair';
  else strength = 'weak';

  // Generate feedback messages
  const feedback: PasswordValidationResult['feedback'] = [];
  const suggestions: string[] = [];

  if (!password) {
    feedback.push({
      type: 'info',
      message: tr('auth.passwordValidation.feedback.empty'),
      icon: '💡',
    });
  } else if (score >= 90) {
    feedback.push({
      type: 'success',
      message: tr('auth.passwordValidation.feedback.excellent'),
      icon: '✅',
    });
  } else if (score >= 70) {
    feedback.push({
      type: 'success',
      message: tr('auth.passwordValidation.feedback.strong'),
      icon: '✅',
    });
  } else if (score >= 50) {
    feedback.push({
      type: 'warning',
      message: tr('auth.passwordValidation.feedback.good'),
      icon: '⚠️',
    });
    suggestions.push(tr('auth.passwordValidation.suggestions.addSpecial'));
  } else if (score >= 30) {
    feedback.push({
      type: 'warning',
      message: tr('auth.passwordValidation.feedback.fair'),
      icon: '⚠️',
    });
    suggestions.push(tr('auth.passwordValidation.suggestions.mixAll'));
    suggestions.push(tr('auth.passwordValidation.suggestions.increaseLength'));
  } else {
    feedback.push({
      type: 'error',
      message: tr('auth.passwordValidation.feedback.weak'),
      icon: '❌',
    });
    suggestions.push(tr('auth.passwordValidation.suggestions.minLength'));
    suggestions.push(tr('auth.passwordValidation.suggestions.bothCases'));
    suggestions.push(tr('auth.passwordValidation.suggestions.digitsAndSpecial'));
  }

  // Common password detection
  const commonPasswords = [
    'password',
    'qwerty',
    '123456',
    '12345678',
    'admin',
    'letmein',
    'welcome',
    'monkey',
    '1234567890',
    'password123',
  ];
  if (commonPasswords.some((common) => password.toLowerCase().includes(common))) {
    feedback.push({
      type: 'error',
      message: tr('auth.passwordValidation.feedback.common'),
      icon: '🚨',
    });
    suggestions.push(tr('auth.passwordValidation.suggestions.avoidCommon'));
  }

  // Repeated characters
  if (/(.)\1{2,}/.test(password)) {
    feedback.push({
      type: 'warning',
      message: tr('auth.passwordValidation.feedback.repeated'),
      icon: '🔁',
    });
  }

  // Sequential characters
  if (/abc|bcd|cde|123|234|345|456/i.test(password)) {
    feedback.push({
      type: 'warning',
      message: tr('auth.passwordValidation.feedback.sequential'),
      icon: '🔢',
    });
  }

  // Add smart suggestions based on what's missing
  if (!requirements.find((r) => r.id === 'uppercase')?.met) {
    suggestions.push(tr('auth.passwordValidation.suggestions.addUppercase'));
  }
  if (!requirements.find((r) => r.id === 'number')?.met) {
    suggestions.push(tr('auth.passwordValidation.suggestions.addNumber'));
  }
  if (!requirements.find((r) => r.id === 'special')?.met && score < 70) {
    suggestions.push(tr('auth.passwordValidation.suggestions.addSpecialShort'));
  }

  return {
    isValid: requiredMet,
    score,
    strength,
    feedback,
    suggestions: [...new Set(suggestions)], // Remove duplicates
    requirements,
  };
}

/**
 * Validate email with smart suggestions
 */
export interface EmailValidationResult {
  isValid: boolean;
  feedback?: {
    type: 'error' | 'warning' | 'success' | 'info';
    message: string;
  };
  suggestion?: string;
}

/**
 * Validate an email address with smart typo suggestions.
 *
 * @param email The address to validate.
 * @param t     Optional i18next `t` function. When provided, all user-facing
 *              strings are translated; otherwise Russian fallbacks are used.
 */
export function validateEmail(email: string, t?: Translator): EmailValidationResult {
  const tr = makeTranslate(t);

  if (!email) {
    return {
      isValid: false,
      feedback: {
        type: 'info',
        message: tr('auth.emailValidation.empty'),
      },
    };
  }

  // Basic email regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(email)) {
    return {
      isValid: false,
      feedback: {
        type: 'error',
        message: tr('auth.emailValidation.invalidFormat'),
      },
      suggestion: tr('auth.emailValidation.example'),
    };
  }

  // Check for common typos
  const domain = email.split('@')[1]?.toLowerCase();
  const typoCorrections: Record<string, string> = {
    'gmial.com': 'gmail.com',
    'gmai.com': 'gmail.com',
    'gmil.com': 'gmail.com',
    'yahooo.com': 'yahoo.com',
    'yaho.com': 'yahoo.com',
    'hotmial.com': 'hotmail.com',
    'outloo.com': 'outlook.com',
    'outlok.com': 'outlook.com',
  };

  if (domain && typoCorrections[domain]) {
    return {
      isValid: false,
      feedback: {
        type: 'warning',
        message: tr('auth.emailValidation.didYouMean').replace(
          '{{domain}}',
          typoCorrections[domain],
        ),
      },
      suggestion: email.replace(domain, typoCorrections[domain]),
    };
  }

  // Check for missing TLD
  if (domain && !domain.includes('.')) {
    return {
      isValid: false,
      feedback: {
        type: 'error',
        message: tr('auth.emailValidation.missingTld'),
      },
      suggestion: `${email}.com`,
    };
  }

  return {
    isValid: true,
    feedback: {
      type: 'success',
      message: tr('auth.emailValidation.valid'),
    },
  };
}

/**
 * Get password strength color
 */
export function getStrengthColor(strength: PasswordValidationResult['strength']): string {
  switch (strength) {
    case 'weak':
      return '#ef4444'; // red
    case 'fair':
      return '#f59e0b'; // orange
    case 'good':
      return '#eab308'; // yellow
    case 'strong':
      return '#22c55e'; // green
    case 'excellent':
      return '#10b981'; // emerald
    default:
      return '#6b7280'; // gray
  }
}

/**
 * Generate a secure password suggestion
 */
export function generateSecurePassword(): string {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '!@#$%^&*()_+-=[]{}';

  const all = uppercase + lowercase + numbers + special;

  let password = '';
  // Ensure at least one of each required type
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];

  // Fill the rest randomly (total 16 chars)
  for (let i = password.length; i < 16; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }

  // Shuffle the password
  return password
    .split('')
    .sort(() => Math.random() - 0.5)
    .join('');
}
