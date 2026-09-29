import { describe, it, expect } from 'vitest';
import { highlightParts } from './highlightParts';

describe('highlightParts', () => {
  it('marks every search word, case-insensitively, keeping the original text', () => {
    const parts = highlightParts('Your Appointment is confirmed for the appointment slot', ['appointment', 'slot']);
    expect(parts.map((p) => p.text).join('')).toBe('Your Appointment is confirmed for the appointment slot');
    expect(parts.filter((p) => p.match).map((p) => p.text)).toEqual(['Appointment', 'appointment', 'slot']);
  });

  it('treats regex characters in the search as plain text', () => {
    const parts = highlightParts('50% off (today) only', ['50%', '(today)']);
    expect(parts.filter((p) => p.match).map((p) => p.text)).toEqual(['50%', '(today)']);
  });

  it('returns the text unchanged without words', () => {
    expect(highlightParts('hello', [])).toEqual([{ text: 'hello', match: false }]);
    expect(highlightParts('', ['x'])).toEqual([{ text: '', match: false }]);
  });
});
