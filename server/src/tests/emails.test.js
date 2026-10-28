import { afterEach, describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';

process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY = 'fake-key';

const require = createRequire(import.meta.url);
const {
  isValidEmail,
  fmtDate,
  escapeHtml,
  notifyManagersPaymentRequested,
  notifyAdminPaymentDecision,
} = require('../utils/emails');
const transporter = require('../config/mailer');

afterEach(() => {
  process.env.NODE_ENV = 'test';
  vi.restoreAllMocks();
});

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

  describe('escapeHtml', () => {
    it('escapes HTML metacharacters', () => {
      expect(escapeHtml(`<script>alert("x")</script> & 'test'`)).toBe(
        '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#039;test&#039;'
      );
    });
  });

  describe('payment emails', () => {
    it('renders payment request details and review link', async () => {
      const sendMail = vi.spyOn(transporter, 'sendMail').mockResolvedValue({ messageId: 'payment-request' });
      process.env.NODE_ENV = 'development';

      await notifyManagersPaymentRequested(
        {
          id: 'payment-1',
          gradegroup: 'Grade A',
          period_start: '2030-01-01',
          period_end: '2030-01-31',
          request_count: 3,
          total_price: 1500,
        },
        { full_name: 'Admin Name', gmail: 'admin@example.com' },
        [{ gmail: 'manager@example.com' }]
      );

      expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
        subject: 'Payment approval needed: Grade A',
        html: expect.stringContaining('2030-01-01 - 2030-01-31'),
      }));
      expect(sendMail.mock.calls[0][0].html).toContain('Grade A');
      expect(sendMail.mock.calls[0][0].html).toContain('1500 EGP');
    });

    it('escapes a decision note and renders decision details', async () => {
      const sendMail = vi.spyOn(transporter, 'sendMail').mockResolvedValue({ messageId: 'payment-decision' });
      process.env.NODE_ENV = 'development';

      await notifyAdminPaymentDecision(
        {
          status: 'declined',
          gradegroup: 'Grade A',
          period_start: '2030-01-01',
          period_end: '2030-01-31',
          total_price: 1500,
          decision_note: '<script>alert("xss")</script>',
        },
        { full_name: 'Admin Name', gmail: 'admin@example.com' },
        { full_name: 'Manager Name' }
      );

      const html = sendMail.mock.calls[0][0].html;
      expect(html).toContain('2030-01-01 - 2030-01-31');
      expect(html).toContain('Grade A');
      expect(html).toContain('1500 EGP');
      expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      expect(html).not.toContain('<script>alert');
    });
  });

  it('formats midnight as 12:00 AM', () => {
    expect(fmtDate('2024-12-31T00:00:00')).toBe('Dec 31, 2024, 12:00 AM');
  });
});
