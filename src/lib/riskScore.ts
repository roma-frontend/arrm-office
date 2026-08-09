/**
 * Risk Score Calculator
 * Evaluates login context and returns a score 0-100
 * 0-29  = Low risk → allow
 * 30-59 = Medium risk → step-up challenge
 * 60+   = High risk → block + notify admin
 */

export interface RiskContext {
  ip?: string;
  userAgent?: string;
  deviceFingerprint?: string;
  email: string;
  method: 'password' | 'face_id' | 'webauthn' | 'google';
  // From DB lookups (passed in from API)
  recentFailedAttempts?: number; // in last 15 min
  lastLoginHour?: number; // 0-23, hour of last successful login
  currentHour?: number; // 0-23
  keystrokeSimilarity?: number; // 0-1, 1 = perfect match
  lastLoginDaysAgo?: number; // how long since last login
}

export interface RiskResult {
  score: number;
  level: 'low' | 'medium' | 'high';
  factors: string[];
  action: 'allow' | 'challenge' | 'block';
}

export function calculateRiskScore(ctx: RiskContext): RiskResult {
  let score = 0;
  const factors: string[] = [];

  // ── Failed attempts ───────────────────────────────────────────────────────
  if (ctx.recentFailedAttempts !== undefined) {
    if (ctx.recentFailedAttempts >= 5) {
      score += 40;
      factors.push('multiple_failed_attempts');
    } else if (ctx.recentFailedAttempts >= 3) {
      score += 20;
      factors.push('several_failed_attempts');
    } else if (ctx.recentFailedAttempts >= 1) {
      score += 10;
      factors.push('recent_failed_attempt');
    }
  }

  // ── Unusual hour ──────────────────────────────────────────────────────────
  const hour = ctx.currentHour ?? new Date().getHours();
  if (hour >= 0 && hour < 5) {
    score += 20;
    factors.push('unusual_login_hour');
  }

  // ── Keystroke dynamics ───────────────────────────────────────────────────
  if (ctx.keystrokeSimilarity !== undefined) {
    if (ctx.keystrokeSimilarity < 0.4) {
      score += 30;
      factors.push('keystroke_mismatch');
    } else if (ctx.keystrokeSimilarity < 0.65) {
      score += 15;
      factors.push('keystroke_low_similarity');
    }
    // bonus for high similarity
    if (ctx.keystrokeSimilarity > 0.85) {
      score -= 10;
    }
  }

  // ── Long absence ─────────────────────────────────────────────────────────
  if (ctx.lastLoginDaysAgo !== undefined) {
    if (ctx.lastLoginDaysAgo > 90) {
      score += 20;
      factors.push('long_absence');
    } else if (ctx.lastLoginDaysAgo > 30) {
      score += 10;
      factors.push('extended_absence');
    }
  }

  // ── Auth method bonus (stronger methods lower risk) ───────────────────────
  if (ctx.method === 'face_id') {
    score -= 10;
  } else if (ctx.method === 'webauthn') {
    score -= 15;
  } else if (ctx.method === 'google') {
    score -= 5;
  }

  // ── Clamp to 0-100 ───────────────────────────────────────────────────────
  score = Math.max(0, Math.min(100, score));

  let level: RiskResult['level'] = 'low';
  let action: RiskResult['action'] = 'allow';

  if (score >= 60) {
    level = 'high';
    action = 'block';
  } else if (score >= 30) {
    level = 'medium';
    action = 'challenge';
  }

  return { score, level, factors, action };
}

/**
 * Compare two keystroke timing arrays and return similarity 0-1
 * Uses normalized Euclidean distance
 */
export function compareKeystrokeTimings(
  profile: { avgDwell: number; avgFlight: number; stdDevDwell?: number; stdDevFlight?: number },
  sample: { avgDwell: number; avgFlight: number },
): number {
  const dwellDiff = Math.abs(profile.avgDwell - sample.avgDwell);
  const flightDiff = Math.abs(profile.avgFlight - sample.avgFlight);

  // Tolerance based on std deviation (or 50ms default)
  const dwellTolerance = profile.stdDevDwell ?? 50;
  const flightTolerance = profile.stdDevFlight ?? 80;

  const dwellScore = Math.max(0, 1 - dwellDiff / (dwellTolerance * 3));
  const flightScore = Math.max(0, 1 - flightDiff / (flightTolerance * 3));

  return (dwellScore + flightScore) / 2;
}
