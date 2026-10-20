import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY = 'fake-key';

const require = createRequire(import.meta.url);
const { parsePaging } = require('../controllers/requestsController');

describe('parsePaging', () => {
  it('uses the default first page and page size', () => {
    expect(parsePaging({})).toEqual({
      page: 1,
      pageSize: 20,
      from: 0,
      to: 19,
    });
  });

  it('clamps page 0 to the first page', () => {
    expect(parsePaging({ page: '0', pageSize: '10' })).toEqual({
      page: 1,
      pageSize: 10,
      from: 0,
      to: 9,
    });
  });

  it('clamps page sizes above the maximum to 50', () => {
    expect(parsePaging({ page: '2', pageSize: '999' })).toEqual({
      page: 2,
      pageSize: 50,
      from: 50,
      to: 99,
    });
  });

  it('falls back to defaults for non-numeric query values', () => {
    expect(parsePaging({ page: 'abc', pageSize: 'abc' })).toEqual({
      page: 1,
      pageSize: 20,
      from: 0,
      to: 19,
    });
  });
});
