import { describe, it, expect } from '@jest/globals';
import { deviceLabel, locationLabel } from '../../convex/lib/device';

describe('deviceLabel', () => {
  it('detects Chrome on Windows', () => {
    expect(
      deviceLabel(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
      ),
    ).toBe('Chrome · Windows');
  });

  it('detects Safari on iOS (iPhone)', () => {
    expect(
      deviceLabel(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('Safari · iOS');
  });

  it('detects Firefox on macOS without mistaking Mac OS for macOS twice', () => {
    expect(
      deviceLabel(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:126.0) Gecko/20100101 Firefox/126.0',
      ),
    ).toBe('Firefox · macOS');
  });

  it('treats Edge and Opera separately from Chrome', () => {
    expect(
      deviceLabel(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36 Edg/125.0',
      ),
    ).toBe('Edge · Windows');
    expect(
      deviceLabel(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36 OPR/111.0',
      ),
    ).toBe('Opera · Linux');
  });

  it('returns null for empty input', () => {
    expect(deviceLabel('')).toBeNull();
    expect(deviceLabel(null)).toBeNull();
    expect(deviceLabel(undefined)).toBeNull();
  });
});

describe('locationLabel', () => {
  it('combines city and country', () => {
    expect(locationLabel('Armenia', 'Yerevan')).toBe('Yerevan, Armenia');
  });

  it('falls back to whichever part exists', () => {
    expect(locationLabel('Armenia', null)).toBe('Armenia');
    expect(locationLabel(null, 'Yerevan')).toBe('Yerevan');
  });

  it('returns null when nothing is known', () => {
    expect(locationLabel(null, undefined)).toBeNull();
  });
});
