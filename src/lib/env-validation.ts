/**
 * Environment Variable Validation
 * Validates all required environment variables at app startup
 */

import { logger } from './logger';

interface EnvConfig {
  required: string[];
  optional: string[];
}

const ENV_CONFIG: EnvConfig = {
  required: [
    'CONVEX_DEPLOYMENT',
    'NEXT_PUBLIC_CONVEX_URL',
    // Auth.js v5 uses AUTH_* prefix
    'AUTH_SECRET',
    'AUTH_GOOGLE_ID',
    'AUTH_GOOGLE_SECRET',
  ],
  optional: [
    'AUTH_URL', // Optional - auto-detected in production
    'GROQ_API_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    'NEXT_PUBLIC_SENTRY_DSN',
    'CSRF_SECRET',
    // SRC (ԿԳԴ) taxpayer-verification API — optional; the /api/taxid/verify
    // route falls back to local checksum validation when absent.
    'SRC_API_URL',
    'SRC_API_USERNAME',
    'SRC_API_PASSWORD',
    // Legacy vars (for backwards compatibility)
    'NEXTAUTH_SECRET',
    'NEXTAUTH_URL',
  ],
};

/**
 * Validate all required environment variables
 * Throws error if any are missing
 *
 * Build-safe: `next build` collects page data by importing this module via
 * the root layout, and that build context may legitimately run without
 * runtime secrets (Vercel scopes env vars per environment; a missing or
 * re-scoped var must not block the entire deployment pipeline). During the
 * build phase we warn and continue — every server request still validates
 * and throws at runtime, where a missing var is a real, user-visible fault.
 */
export function validateEnvironment(): void {
  const missing = ENV_CONFIG.required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    const message = `Missing required environment variables: ${missing.join(', ')}`;
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      logger.warn(
        `⚠️ Environment validation skipped during build (missing: ${missing.join(', ')}). ` +
          'Requests will validate at runtime.',
      );
      return;
    }
    logger.error('❌ Environment Validation Failed:', message);
    throw new Error(message);
  }

  const warnings: string[] = [];
  ENV_CONFIG.optional.forEach((key) => {
    if (!process.env[key]) {
      warnings.push(`⚠️ Optional env var missing: ${key}`);
    }
  });

  if (warnings.length > 0) {
    warnings.forEach((w) => logger.warn(w));
  }

  logger.log('✅ Environment validation passed');
}

/**
 * Get environment variable with fallback
 */
export function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (!value && !defaultValue) {
    throw new Error(`Environment variable ${key} is not defined`);
  }
  return value || defaultValue || '';
}
