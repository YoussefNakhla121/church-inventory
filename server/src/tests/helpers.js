import jwt from 'jsonwebtoken';
import { vi } from 'vitest';

// This file must run BEFORE the app is loaded. ESM imports are hoisted, so importing
// this file at the top of a test file guarantees that.
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY = 'fake-key';
process.env.JWT_SECRET = 'test-secret';
// Make sure tests never talk to real Redis or Gmail
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.GMAIL_USER;
delete process.env.GMAIL_APP_PASSWORD;

export const makeToken = (role = 'requester', options = {}, payload = {}) =>
  jwt.sign(
    { id: 'user-1', gmail: 'user@example.com', role, ...payload },
    process.env.JWT_SECRET,
    options
  );

export const authHeader = (role = 'requester') => ({
  Authorization: `Bearer ${makeToken(role)}`,
});

// Silences console noise from expected errors (call inside a test or beforeEach)
export const quietConsole = () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
};
