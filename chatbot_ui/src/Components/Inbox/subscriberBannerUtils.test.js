import { describe, it, expect } from 'vitest';
import { formatLocalTime, offsetLabel, lastSeenLabel, languageName, localWeekdayIfDifferent } from './subscriberBannerUtils';

const NOON_UTC = new Date('2026-01-15T12:00:00Z');

describe('subscriber banner helpers', () => {
  it('formats the time in the subscriber zone', () => {
    expect(formatLocalTime('Asia/Dhaka', NOON_UTC)).toBe('6:00 PM');
    expect(formatLocalTime('UTC', NOON_UTC)).toBe('12:00 PM');
  });

  it('returns null for a missing or invalid zone', () => {
    expect(formatLocalTime(null, NOON_UTC)).toBeNull();
    expect(formatLocalTime('Not/AZone', NOON_UTC)).toBeNull();
    expect(offsetLabel('Not/AZone', NOON_UTC)).toBeNull();
    expect(localWeekdayIfDifferent(undefined, NOON_UTC)).toBeNull();
  });

  it('labels the offset', () => {
    expect(offsetLabel('Asia/Dhaka', NOON_UTC)).toBe('GMT+6');
    expect(offsetLabel('Asia/Kolkata', NOON_UTC)).toBe('GMT+5:30');
  });

  it('describes last seen', () => {
    const now = NOON_UTC.getTime();
    expect(lastSeenLabel(null, now)).toBeNull();
    expect(lastSeenLabel('garbage', now)).toBeNull();
    expect(lastSeenLabel(new Date(now - 20_000).toISOString(), now)).toBe('just now');
    expect(lastSeenLabel(new Date(now - 5 * 60_000).toISOString(), now)).toBe('5 min ago');
    expect(lastSeenLabel(new Date(now - 3 * 3_600_000).toISOString(), now)).toBe('3 h ago');
    expect(lastSeenLabel(new Date(now - 26 * 3_600_000).toISOString(), now)).toBe('1 day ago');
    expect(lastSeenLabel('2025-03-12T10:00:00Z', now)).toBe('12 Mar 2025');
  });

  it('names languages from locale codes', () => {
    expect(languageName('en_US')).toBe('English');
    expect(languageName('bn')).toBe('Bangla');
    expect(languageName(null)).toBeNull();
  });
});
