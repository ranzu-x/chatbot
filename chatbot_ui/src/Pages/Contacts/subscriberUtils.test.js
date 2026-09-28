import { describe, expect, it } from 'vitest';
import { parseCSV, detectDelimiter, csvRowsToObjects, isWhatsAppUserId, contactIdentifier } from './subscriberUtils';

describe('CSV import helpers', () => {
  it('parses quoted fields, escaped quotes and commas inside quotes', () => {
    const rows = parseCSV('name,phone\n"Doe, Jane","+1 555"\n"Say ""hi""",123\n');
    expect(rows).toEqual([['name', 'phone'], ['Doe, Jane', '+1 555'], ['Say "hi"', '123']]);
  });

  it('detects Excel semicolon / tab files, with a comma winning ties', () => {
    expect(detectDelimiter('name;phone;email\na;b;c')).toBe(';');
    expect(detectDelimiter('name\tphone\na\tb')).toBe('\t');
    expect(detectDelimiter('a,b;c')).toBe(',');
  });

  it('keys rows by normalised header', () => {
    expect(csvRowsToObjects([['Phone Number', 'Name'], [' 123 ', 'Ann']])).toEqual([{ phonenumber: '123', name: 'Ann' }]);
  });
});

describe('WhatsApp username subscribers', () => {
  it('recognises business-scoped user ids', () => {
    expect(isWhatsAppUserId('US.13491208655302741918')).toBe(true);
    expect(isWhatsAppUserId('8801712345678')).toBe(false);
  });

  it('shows phone, else @username, else a hidden-number label', () => {
    expect(contactIdentifier({ phone: '+880171', wa_username: 'ann' })).toBe('+880171');
    expect(contactIdentifier({ wa_username: 'ann', external_id: 'US.1' })).toBe('@ann');
    expect(contactIdentifier({ external_id: 'US.1349' })).toBe('WhatsApp user (number hidden)');
  });
});
