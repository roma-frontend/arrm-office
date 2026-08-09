import { calculateRiskScore, compareKeystrokeTimings } from '@/lib/riskScore';

describe('calculateRiskScore', () => {
  const baseContext = {
    email: 'user@example.com',
    method: 'password' as const,
    recentFailedAttempts: 0,
    currentHour: 12,
    keystrokeSimilarity: 0.9,
    lastLoginDaysAgo: 1,
  };

  it('returns low risk for normal conditions', () => {
    const result = calculateRiskScore(baseContext);
    expect(result.level).toBe('low');
    expect(result.action).toBe('allow');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('returns high risk for multiple failed attempts', () => {
    const result = calculateRiskScore({
      ...baseContext,
      recentFailedAttempts: 5,
      currentHour: 3,
      keystrokeSimilarity: 0.3,
      lastLoginDaysAgo: 100,
    });
    expect(result.level).toBe('high');
    expect(result.action).toBe('block');
    expect(result.score).toBeGreaterThanOrEqual(60);
  });

  it('returns medium risk for moderate anomalies', () => {
    const result = calculateRiskScore({
      ...baseContext,
      recentFailedAttempts: 3,
      currentHour: 2,
    });
    expect(result.level).toBe('medium');
    expect(result.action).toBe('challenge');
    expect(result.score).toBeGreaterThanOrEqual(30);
    expect(result.score).toBeLessThan(60);
  });

  it('clamps score to 0-100 range', () => {
    const result = calculateRiskScore({
      ...baseContext,
      keystrokeSimilarity: 0.95,
      method: 'webauthn' as const,
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('reduces risk for face_id auth method', () => {
    const faceResult = calculateRiskScore({ ...baseContext, method: 'face_id' as const });
    const passwordResult = calculateRiskScore({ ...baseContext, method: 'password' as const });
    expect(faceResult.score).toBeLessThanOrEqual(passwordResult.score);
  });

  it('reduces risk for webauthn auth method', () => {
    const webauthnResult = calculateRiskScore({ ...baseContext, method: 'webauthn' as const });
    const passwordResult = calculateRiskScore({ ...baseContext, method: 'password' as const });
    expect(webauthnResult.score).toBeLessThanOrEqual(passwordResult.score);
  });

  it('adds risk factors for failed attempts', () => {
    const result = calculateRiskScore({
      ...baseContext,
      recentFailedAttempts: 5,
    });
    expect(result.factors).toContain('multiple_failed_attempts');
  });

  it('adds risk factors for unusual login hour', () => {
    const result = calculateRiskScore({
      ...baseContext,
      currentHour: 3,
    });
    expect(result.factors).toContain('unusual_login_hour');
  });

  it('adds risk factors for keystroke mismatch', () => {
    const result = calculateRiskScore({
      ...baseContext,
      keystrokeSimilarity: 0.3,
    });
    expect(result.factors).toContain('keystroke_mismatch');
  });

  it('adds risk factors for long absence', () => {
    const result = calculateRiskScore({
      ...baseContext,
      lastLoginDaysAgo: 100,
    });
    expect(result.factors).toContain('long_absence');
  });

  it('adds risk for a new device and escalates to a challenge', () => {
    const result = calculateRiskScore({
      ...baseContext,
      keystrokeSimilarity: 0.7,
      isNewDevice: true,
    });
    expect(result.score).toBe(30);
    expect(result.factors).toContain('new_device');
    expect(result.level).toBe('medium');
    expect(result.action).toBe('challenge');
  });

  it('escalates to block when a new device combines with other risk factors', () => {
    const result = calculateRiskScore({
      ...baseContext,
      recentFailedAttempts: 3,
      currentHour: 2,
      keystrokeSimilarity: 0.7,
      isNewDevice: true,
    });
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.factors).toContain('new_device');
    expect(result.level).toBe('high');
    expect(result.action).toBe('block');
  });

  it('does not flag a known device', () => {
    const result = calculateRiskScore({
      ...baseContext,
      keystrokeSimilarity: 0.7,
      isNewDevice: false,
    });
    expect(result.score).toBe(0);
    expect(result.factors).not.toContain('new_device');
  });
});

describe('compareKeystrokeTimings', () => {
  it('returns 1.0 for identical timings', () => {
    const profile = { avgDwell: 100, avgFlight: 150 };
    const sample = { avgDwell: 100, avgFlight: 150 };
    expect(compareKeystrokeTimings(profile, sample)).toBeCloseTo(1.0, 2);
  });

  it('returns lower similarity for very different timings', () => {
    const profile = { avgDwell: 100, avgFlight: 150 };
    const sample = { avgDwell: 500, avgFlight: 600 };
    const similarity = compareKeystrokeTimings(profile, sample);
    expect(similarity).toBeLessThan(0.5);
  });

  it('uses stdDev tolerances when provided', () => {
    const profile = { avgDwell: 100, avgFlight: 150, stdDevDwell: 10, stdDevFlight: 20 };
    const sample = { avgDwell: 105, avgFlight: 155 };
    const similarity = compareKeystrokeTimings(profile, sample);
    expect(similarity).toBeGreaterThan(0.8);
  });

  it('returns value between 0 and 1', () => {
    const profile = { avgDwell: 100, avgFlight: 150 };
    const sample = { avgDwell: 200, avgFlight: 300 };
    const similarity = compareKeystrokeTimings(profile, sample);
    expect(similarity).toBeGreaterThanOrEqual(0);
    expect(similarity).toBeLessThanOrEqual(1);
  });
});
