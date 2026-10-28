import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createRequire } from 'module';
import { authHeader, makeToken } from './helpers';
import { fakeQuery, mockTables } from './supabaseMock';

const require = createRequire(import.meta.url);
const app = require('../app');
const supabase = require('../config/supabase');
const { updateRequestStatus } = require('../controllers/requestsController');

afterEach(() => vi.restoreAllMocks());

const paymentId = '11111111-1111-4111-8111-111111111111';

describe('manager payments API', () => {
  it.each(['/api/payments', '/api/payments/pending-count', `/api/payments/${paymentId}`])(
    'rejects admin and requester tokens on %s',
    async (path) => {
      expect((await request(app).get(path).set(authHeader('admin'))).status).toBe(403);
      expect((await request(app).get(path).set(authHeader('requester'))).status).toBe(403);
    }
  );

  it('validates the payment status filter', async () => {
    const from = vi.spyOn(supabase, 'from');
    const response = await request(app)
      .get('/api/payments?status=unknown')
      .set(authHeader('manager'));

    expect(response.status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it('uses exact-count pagination and filters valid statuses', async () => {
    const query = fakeQuery({ data: [{ id: paymentId }], count: 1, error: null });
    mockTables(supabase, { payments: query });

    const response = await request(app)
      .get('/api/payments?status=pending&page=2&pageSize=5')
      .set(authHeader('manager'));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [{ id: paymentId, requested_by_name: null, decided_by_name: null }], total: 1, page: 2, pageSize: 5 });
    expect(query.eq).toHaveBeenCalledWith('status', 'pending');
    expect(query.select.mock.calls[0][1]).toEqual({ count: 'exact' });
  });

  it('does not capture pending-count as a payment id', async () => {
    const query = fakeQuery({ data: null, count: 3, error: null });
    mockTables(supabase, { payments: query });

    const response = await request(app)
      .get('/api/payments/pending-count')
      .set(authHeader('manager'));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ count: 3 });
    expect(query.select.mock.calls[0][1]).toEqual({ count: 'exact', head: true });
    expect(query.eq).toHaveBeenCalledWith('status', 'pending');
  });

  it('validates UUIDs before looking up a payment or deciding it', async () => {
    const getResponse = await request(app).get('/api/payments/not-a-uuid').set(authHeader('manager'));
    const patchResponse = await request(app)
      .patch('/api/payments/not-a-uuid/decision')
      .set(authHeader('manager'))
      .send({ decision: 'approved' });

    expect(getResponse.status).toBe(400);
    expect(getResponse.body).toEqual({ error: 'Invalid payment ID' });
    expect(patchResponse.status).toBe(400);
    expect(patchResponse.body).toEqual({ error: 'Invalid payment ID' });
  });

  it.each([
    ['not_found', 404],
    ['already_decided', 409],
    ['invalid_decision', 400],
    ['not_manager', 403],
  ])('maps decide_payment code %s to %s', async (code, status) => {
    vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: { success: false, code }, error: null });

    const response = await request(app)
      .patch(`/api/payments/${paymentId}/decision`)
      .set(authHeader('manager'))
      .send({ decision: 'approved' });

    expect(response.status).toBe(status);
    expect(response.body.code).toBe(code);
  });

  it('passes the manager ID from the token to decide_payment', async () => {
    const rpc = vi.spyOn(supabase, 'rpc').mockResolvedValue({
      data: { success: true, payment: { id: paymentId } },
      error: null,
    });
    const token = makeToken('manager', {}, { id: 'manager-from-token' });

    const response = await request(app)
      .patch(`/api/payments/${paymentId}/decision`)
      .set({ Authorization: `Bearer ${token}` })
      .send({ decision: 'declined', note: 'Not received' });

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('decide_payment', {
      p_payment_id: paymentId,
      p_manager_id: 'manager-from-token',
      p_decision: 'declined',
      p_note: 'Not received',
    });
  });
});

describe('request status payment lock', () => {
  it('maps request_in_payment RPC errors to a conflict', async () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValue({
      data: null,
      error: { message: 'request_in_payment: request is locked' },
    });

    const req = { params: { id: 'request-1' }, body: { status: 'cancelled' }, user: { id: 'manager-1' } };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await updateRequestStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: "This request is part of a payment (pending or approved), so its status can't be changed.",
      code: 'request_in_payment',
    });
  });
});
