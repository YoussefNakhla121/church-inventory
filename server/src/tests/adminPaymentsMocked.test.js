import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createRequire } from 'module';
import { authHeader } from './helpers';
import { fakeQuery, mockTables } from './supabaseMock';

const require = createRequire(import.meta.url);
const app = require('../app');
const supabase = require('../config/supabase');

afterEach(() => vi.restoreAllMocks());

const period = '?start=2030-01-01&end=2030-01-31';
const periodBody = { start: '2030-01-01', end: '2030-01-31' };
const adminRoutes = [
  ['get', `/api/admin/summary${period}`],
  ['get', `/api/admin/requests${period}`],
  ['post', '/api/admin/payments'],
  ['get', '/api/admin/payments'],
];

const call = (method, path, headers) => {
  const result = request(app)[method](path);
  if (headers) result.set(headers);
  if (method === 'post') result.send(periodBody);
  return result;
};

describe('admin payments API', () => {
  it.each(adminRoutes)('%s %s requires authentication', async (method, path) => {
    const response = await call(method, path);
    expect(response.status).toBe(401);
  });

  it.each(adminRoutes)('%s %s rejects requesters and managers', async (method, path) => {
    expect((await call(method, path, authHeader('requester'))).status).toBe(403);
    expect((await call(method, path, authHeader('manager'))).status).toBe(403);
  });

  it.each([
    ['2030-02-30', '2030-03-01'],
    ['2030-03-02', '2030-03-01'],
    ['2030-01-01', '2031-01-03'],
  ])('rejects invalid period %s to %s before calling an RPC', async (start, end) => {
    const rpc = vi.spyOn(supabase, 'rpc');
    const response = await request(app)
      .get(`/api/admin/summary?start=${start}&end=${end}`)
      .set(authHeader('admin'));

    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns the flat summary without the RPC success field', async () => {
    const rpc = vi.spyOn(supabase, 'rpc').mockResolvedValue({
      data: { success: true, payable_count: 2 },
      error: null,
    });
    const response = await request(app).get(`/api/admin/summary${period}`).set(authHeader('admin'));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ payable_count: 2 });
    expect(rpc).toHaveBeenCalledWith('admin_period_summary', {
      p_admin_id: 'user-1',
      p_start: '2030-01-01',
      p_end: '2030-01-31',
    });
  });

  it('lists requests with RPC rows and pagination', async () => {
    const rpc = vi.spyOn(supabase, 'rpc').mockResolvedValue({
      data: { rows: [{ id: 'r1' }], total: 1 },
      error: null,
    });
    const response = await request(app)
      .get(`/api/admin/requests${period}&page=2&pageSize=5`)
      .set(authHeader('admin'));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [{ id: 'r1' }], total: 1, page: 2, pageSize: 5 });
    expect(rpc).toHaveBeenCalledWith('admin_list_requests', expect.objectContaining({
      p_admin_id: 'user-1',
      p_limit: 5,
      p_offset: 5,
    }));
  });

  it.each([
    ['not_admin', 403],
    ['invalid_period', 400],
    ['nothing_payable', 409],
    ['missing_prices', 409],
    ['zero_total', 409],
  ])('maps request_payment code %s to %s', async (code, status) => {
    vi.spyOn(supabase, 'rpc').mockResolvedValue({
      data: { success: false, code, missing_count: 2 },
      error: null,
    });
    const response = await request(app).post('/api/admin/payments').set(authHeader('admin')).send(periodBody);

    expect(response.status).toBe(status);
    expect(response.body.code).toBe(code);
    if (code === 'missing_prices') expect(response.body.missing_count).toBe(2);
  });

  it('creates a payment and scopes the RPC to the token user', async () => {
    const payment = { id: 'p1', total_price: 50 };
    const rpc = vi.spyOn(supabase, 'rpc').mockResolvedValue({
      data: { success: true, payment },
      error: null,
    });
    const response = await request(app).post('/api/admin/payments').set(authHeader('admin')).send(periodBody);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ payment });
    expect(rpc).toHaveBeenCalledWith('request_payment', {
      p_admin_id: 'user-1',
      p_start: '2030-01-01',
      p_end: '2030-01-31',
    });
  });

  it('lists only the admin payments with exact-count pagination', async () => {
    const query = fakeQuery({ data: [{ id: 'p1' }], count: 1, error: null });
    mockTables(supabase, { payments: query });
    const response = await request(app)
      .get('/api/admin/payments?page=2&pageSize=5')
      .set(authHeader('admin'));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [{ id: 'p1' }], total: 1, page: 2, pageSize: 5 });
    expect(query.eq).toHaveBeenCalledWith('requested_by', 'user-1');
    expect(query.select.mock.calls[0][1]).toEqual({ count: 'exact' });
    expect(query.range).toHaveBeenCalledWith(5, 9);
  });
});
