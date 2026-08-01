/**
 * 🛡️ SECURITY UTILITIES
 * Комплексная система безопасности для защиты от всех типов атак
 */

import { randomBytes, createHash, createHmac, timingSafeEqual } from 'crypto';
import { logger } from './logger';

// ═══════════════════════════════════════════════════════════════
// CSRF PROTECTION
// ═══════════════════════════════════════════════════════════════

const csrfSecret = process.env.CSRF_SECRET;

// Validate CSRF_SECRET in production
if (process.env.NODE_ENV === 'production' && !csrfSecret) {
  throw new Error('CSRF_SECRET must be set in production environment');
}

const CSRF_SECRET = csrfSecret || 'dev-secret-change-me-in-production-min-32-chars';
const CSRF_TOKEN_LENGTH = 32;

/**
 * Генерация CSRF токена
 */
export function generateCSRFToken(): string {
  const token = randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
  const signature = createHmac('sha256', CSRF_SECRET).update(token).digest('hex');
  return `${token}.${signature}`;
}

/**
 * Проверка CSRF токена
 */
export function verifyCSRFToken(token: string): boolean {
  if (!token || typeof token !== 'string') return false;

  const [tokenPart, signature] = token.split('.');
  if (!tokenPart || !signature) return false;

  const expectedSignature = createHmac('sha256', CSRF_SECRET).update(tokenPart).digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  return timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expectedSignature, 'utf8'));
}

// ═══════════════════════════════════════════════════════════════
// INPUT SANITIZATION & VALIDATION
// ═══════════════════════════════════════════════════════════════

/**
 * Санитизация строки от XSS
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') return '';

  return input
    .replace(/[<>]/g, '') // Удаляем < и >
    .replace(/javascript:/gi, '') // Удаляем javascript:
    .replace(/on\w+\s*=/gi, '') // Удаляем event handlers
    .replace(/data:text\/html/gi, '') // Удаляем data URLs
    .trim();
}

/**
 * Санитизация HTML (разрешаем только безопасные теги)
 */
export function sanitizeHTML(html: string): string {
  if (typeof html !== 'string') return '';

  // Список разрешенных тегов
  const allowedTags = ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li', 'a'];
  const tagPattern = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi;

  return html.replace(tagPattern, (match, tag) => {
    return allowedTags.includes(tag.toLowerCase()) ? match : '';
  });
}

/**
 * Валидация email
 */
export function validateEmail(email: string): boolean {
  if (typeof email !== 'string') return false;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isValid = emailRegex.test(email);

  // Дополнительные проверки
  if (!isValid) return false;
  if (email.length > 254) return false; // RFC 5321
  if (email.includes('..')) return false; // Двойные точки

  return true;
}

/**
 * Валидация телефона
 */
export function validatePhone(phone: string): boolean {
  if (typeof phone !== 'string') return false;

  // Удаляем все символы кроме цифр и +
  const cleaned = phone.replace(/[^\d+]/g, '');

  // Проверяем длину (от 10 до 15 цифр)
  return cleaned.length >= 10 && cleaned.length <= 15;
}

/**
 * Валидация URL
 */
export function validateURL(url: string): boolean {
  if (typeof url !== 'string') return false;

  try {
    const parsed = new URL(url);
    // Разрешаем только http и https
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Проверка на SQL инъекции
 */
export function containsSQLInjection(input: string): boolean {
  if (typeof input !== 'string') return false;

  const sqlPatterns = [
    /(\bSELECT\b|\bUNION\b|\bDROP\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bEXEC\b|\bEXECUTE\b)/i,
    /(\bOR\b|\bAND\b)\s+[\d\w]+\s*=\s*[\d\w]+/i,
    /--/,
    /;.*(\bDROP\b|\bDELETE\b)/i,
    /'\s*(OR|AND)\s*'?\d/i,
  ];

  return sqlPatterns.some((pattern) => pattern.test(input));
}

/**
 * Проверка на XSS
 */
export function containsXSS(input: string): boolean {
  if (typeof input !== 'string') return false;

  const xssPatterns = [
    /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
    /<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<embed[\s\S]*?>/gi,
    /<object[\s\S]*?>/gi,
    /eval\s*\(/gi,
  ];

  return xssPatterns.some((pattern) => pattern.test(input));
}

/**
 * Универсальная санитизация объекта
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const sanitized = {} as T;

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key as keyof T] = sanitizeString(value) as T[keyof T];
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key as keyof T] = sanitizeObject(value as Record<string, unknown>) as T[keyof T];
    } else if (Array.isArray(value)) {
      sanitized[key as keyof T] = value.map((item) =>
        typeof item === 'string' ? sanitizeString(item) : item,
      ) as T[keyof T];
    } else {
      sanitized[key as keyof T] = value as T[keyof T];
    }
  }

  return sanitized;
}

// ═══════════════════════════════════════════════════════════════
// PASSWORD SECURITY
// ═══════════════════════════════════════════════════════════════

/**
 * Валидация пароля (минимальные требования безопасности)
 */
export function validatePassword(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (typeof password !== 'string') {
    return { valid: false, errors: ['Password must be a string'] };
  }

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  // Проверка на общие пароли
  const commonPasswords = [
    'password',
    '12345678',
    'qwerty',
    'abc123',
    'password123',
    'admin',
    'letmein',
    'welcome',
    'monkey',
    '1234567890',
  ];

  if (commonPasswords.includes(password.toLowerCase())) {
    errors.push('This password is too common and not secure');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Генерация безопасного случайного пароля
 */
export function generateSecurePassword(length: number = 16): string {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  const allChars = lowercase + uppercase + numbers + special;

  let password = '';

  // Гарантируем наличие каждого типа символов (crypto-safe)
  const rand1 = crypto.getRandomValues(new Uint8Array(1))[0] ?? 0;
  const rand2 = crypto.getRandomValues(new Uint8Array(1))[0] ?? 0;
  const rand3 = crypto.getRandomValues(new Uint8Array(1))[0] ?? 0;
  const rand4 = crypto.getRandomValues(new Uint8Array(1))[0] ?? 0;

  password += lowercase[rand1 % lowercase.length];
  password += uppercase[rand2 % uppercase.length];
  password += numbers[rand3 % numbers.length];
  password += special[rand4 % special.length];

  // Заполняем остальное
  for (let i = password.length; i < length; i++) {
    const randomIndex = (crypto.getRandomValues(new Uint8Array(1))[0] ?? 0) % allChars.length;
    password += allChars[randomIndex];
  }

  // Перемешиваем с Fisher-Yates (crypto-safe)
  const arr = password.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (crypto.getRandomValues(new Uint8Array(1))[0] ?? 0) % (i + 1);
    [arr[i], arr[j]] = [arr[j] ?? '', arr[i] ?? ''];
  }
  return arr.join('');
}

// ═══════════════════════════════════════════════════════════════
// FILE UPLOAD SECURITY
// ═══════════════════════════════════════════════════════════════

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Валидация загружаемого файла
 */
export function validateFile(
  file: File,
  type: 'image' | 'document' = 'image',
): {
  valid: boolean;
  error?: string;
} {
  // Проверка размера
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`,
    };
  }

  // Проверка MIME типа
  const allowedTypes = type === 'image' ? ALLOWED_IMAGE_TYPES : ALLOWED_DOCUMENT_TYPES;
  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`,
    };
  }

  // Проверка расширения файла
  const extension = file.name.split('.').pop()?.toLowerCase();
  const allowedExtensions =
    type === 'image' ? ['jpg', 'jpeg', 'png', 'gif', 'webp'] : ['pdf', 'doc', 'docx'];

  if (!extension || !allowedExtensions.includes(extension)) {
    return {
      valid: false,
      error: `Invalid file extension. Allowed extensions: ${allowedExtensions.join(', ')}`,
    };
  }

  return { valid: true };
}

// ═══════════════════════════════════════════════════════════════
// SECURITY LOGGING
// ═══════════════════════════════════════════════════════════════

export enum SecurityEventType {
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILURE = 'LOGIN_FAILURE',
  LOGOUT = 'LOGOUT',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  XSS_ATTEMPT = 'XSS_ATTEMPT',
  SQL_INJECTION_ATTEMPT = 'SQL_INJECTION_ATTEMPT',
  CSRF_VIOLATION = 'CSRF_VIOLATION',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',
}

export interface SecurityEvent {
  type: SecurityEventType;
  userId?: string;
  ip: string;
  userAgent?: string;
  timestamp: number;
  details?: Record<string, unknown>;
}

/**
 * Логирование события безопасности
 */
export function logSecurityEvent(event: SecurityEvent): void {
  const logEntry = {
    ...event,
    timestamp: new Date(event.timestamp).toISOString(),
  };

  // В продакшене отправляйте в систему мониторинга (Sentry, LogRocket, etc.)
  logger.log(`🔒 [SECURITY] ${event.type}:`, logEntry);

  // Критические события
  if (
    [
      SecurityEventType.SQL_INJECTION_ATTEMPT,
      SecurityEventType.XSS_ATTEMPT,
      SecurityEventType.ACCOUNT_LOCKED,
    ].includes(event.type)
  ) {
    logger.error(`🚨 [CRITICAL SECURITY EVENT]`, logEntry);
    // TODO: Отправить алерт администратору
  }
}

// ═══════════════════════════════════════════════════════════════
// API KEY MANAGEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * Генерация безопасного API ключа
 */
export function generateAPIKey(): string {
  const prefix = 'sk_live_';
  const randomPart = randomBytes(32).toString('hex');
  return `${prefix}${randomPart}`;
}

/**
 * Хеширование API ключа для хранения
 */
export function hashAPIKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Валидация формата API ключа
 */
export function validateAPIKeyFormat(apiKey: string): boolean {
  return /^sk_live_[a-f0-9]{64}$/.test(apiKey);
}

// ═══════════════════════════════════════════════════════════════
// DATA ENCRYPTION HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Маскировка чувствительных данных для логов
 */
export function maskSensitiveData(data: string, showLast: number = 4): string {
  if (!data) return '***';
  if (data.length <= showLast) return data;
  const maskLength = data.length - showLast;
  if (maskLength <= 0) return data;
  return '*'.repeat(maskLength) + data.slice(-showLast);
}

/**
 * Проверка наличия чувствительных данных в строке
 */
export function containsSensitiveData(text: string): boolean {
  const patterns = [
    /\b\d{13,19}\b/, // Credit card numbers
    /\b\d{3}-\d{2}-\d{4}\b/, // SSN
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
    /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/, // Phone
  ];

  return patterns.some((pattern) => pattern.test(text));
}

// ═══════════════════════════════════════════════════════════════
// EXPORT ALL
// ═══════════════════════════════════════════════════════════════

export default {
  // CSRF
  generateCSRFToken,
  verifyCSRFToken,

  // Sanitization
  sanitizeString,
  sanitizeHTML,
  sanitizeObject,

  // Validation
  validateEmail,
  validatePhone,
  validateURL,
  validatePassword,
  validateFile,

  // Detection
  containsSQLInjection,
  containsXSS,
  containsSensitiveData,

  // Password
  generateSecurePassword,

  // API Keys
  generateAPIKey,
  hashAPIKey,
  validateAPIKeyFormat,

  // Logging
  logSecurityEvent,
  SecurityEventType,

  // Data Protection
  maskSensitiveData,
};
