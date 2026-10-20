import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY = 'fake-key';

const require = createRequire(import.meta.url);
const { isValidEmail, fmtDate } = require('../utils/emails');

describe('isValidEmail', () => {
  it.each([
    'user@example.com',
    'first.last+tag@example.co.uk',
    'USER@EXAMPLE.COM',
  ])('accepts %s', (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  it.each([
    'plainaddress',
    'user@',
    '@example.com',
    'user@example',
    'user name@example.com',
    'user@example.com ',
    '',
    null,
    undefined,
  ])('rejects %s', (email) => {
    expect(isValidEmail(email)).toBe(false);
  });
});

describe('fmtDate', () => {
  it('formats a date with abbreviated month, padded day, year, and 12-hour time', () => {
    expect(fmtDate('2024-01-05T13:07:00')).toBe('Jan 05, 2024, 01:07 PM');
  });

  it('formats midnight as 12:00 AM', () => {
    expect(fmtDate('2024-12-31T00:00:00')).toBe('Dec 31, 2024, 12:00 AM');
  });
});
