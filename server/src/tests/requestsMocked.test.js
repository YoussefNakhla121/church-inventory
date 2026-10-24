import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createRequire } from 'module';
import { authHeader, quietConsole } from './helpers';
import { fakeQuery, mockTables } from './supabaseMock';

const require = createRequire(import.meta.url);
const app = require('../app');
const supabase = require('../config/supabase');
const requestId = '11111111-1111-4111-8111-111111111111';
const requestStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
const requestEnd = new Date(requestStart.getTime() + 2 * 60 * 60 * 1000);
const requestBody = {
  start_time: requestStart.toISOString(),
  end_time: requestEnd.toISOString(),
  items: [{ item_id: 'i1', quantity_requested: 3 }],
};

afterEach(() => vi.restoreAllMocks());

const requestRows = (overrides = {}) => ({
  id: requestId,
  requester_id: 'user-1',
  start_time: '2030-01-01T10:00:00Z',
  end_time: '2030-01-01T12:00:00Z',
  status: 'approved',
  ...overrides,
});

describe('mocked requests API', () => {
  // This proves a successful request calls the atomic RPC and persists its calculated price.
  it('creates a request and calculates its total price', async () => {
    const rpc = vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: { success: true, request_id: 'r1' }, error: null });
    const requests = fakeQuery({ data: null, error: null });
    mockTables(supabase, {
      items: fakeQuery({ data: [{ id: 'i1', price: 10 }], error: null }),
      requests,
      users: fakeQuery({ data: { id: 'user-1', full_name: 'T', gmail: 't@x.com', phone: '1', gradegroup: 'G' }, error: null }),
      request_items: fakeQuery({ data: [], error: null }),
    });
    const response = await request(app).post('/api/requests').set(authHeader()).send(requestBody);
    expect(response.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith('create_request', expect.objectContaining({ p_requester_id: 'user-1', p_items: [{ item_id: 'i1', quantity_requested: 3 }], p_gradegroup: null }));
    expect(requests.update).toHaveBeenCalledWith({ total_price: 30 });
  });

  // This proves conflicts are returned to clients as a 409 response.
  it('returns conflicts from request creation', async () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: { success: false, conflicts: [{ item_id: 'i1', item_name: 'Chair', requested: 3, available_in_window: 1 }] }, error: null });
    const response = await request(app).post('/api/requests').set(authHeader()).send(requestBody);
    expect(response.status).toBe(409);
    expect(response.body.conflicts).toHaveLength(1);
  });

  // This proves RPC failures become server errors.
  it('returns 500 for a request RPC error', async () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: null, error: { message: 'boom' } });
    const response = await request(app).post('/api/requests').set(authHeader()).send({ ...requestBody, items: [{ item_id: 'i1', quantity_requested: 1 }] });
    expect(response.status).toBe(500);
  });

  // This proves a requester cannot discover another user's request.
  it("returns 404 for another requester's request", async () => {
    mockTables(supabase, { requests: fakeQuery({ data: requestRows({ requester_id: 'other-user' }), error: null }) });
    const response = await request(app).get(`/api/requests/${requestId}`).set(authHeader());
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Request not found' });
  });

  // This proves requesters receive their own request without the internal requester id.
  it('returns an own request without requester_id', async () => {
    mockTables(supabase, { requests: fakeQuery({ data: requestRows(), error: null }) });
    const response = await request(app).get(`/api/requests/${requestId}`).set(authHeader());
    expect(response.status).toBe(200);
    expect(response.body).not.toHaveProperty('requester_id');
  });

  // This proves missing requests return 404.
  it('returns 404 for a missing request', async () => {
    mockTables(supabase, { requests: fakeQuery({ data: null, error: null }) });
    const response = await request(app).get(`/api/requests/${requestId}`).set(authHeader());
    expect(response.status).toBe(404);
  });

  // This proves manager request queries include requester contact details.
  it('uses the requester join for managers', async () => {
    const query = fakeQuery({ data: requestRows(), error: null });
    mockTables(supabase, { requests: query });
    await request(app).get(`/api/requests/${requestId}`).set(authHeader('manager'));
    expect(query.select.mock.calls[0][0]).toContain('requester:users!requests_requester_id_fkey');
  });

  // This proves requester queries omit the requester contact join.
  it('omits the requester join for requesters', async () => {
    const query = fakeQuery({ data: requestRows(), error: null });
    mockTables(supabase, { requests: query });
    await request(app).get(`/api/requests/${requestId}`).set(authHeader());
    expect(query.select.mock.calls[0][0]).not.toContain('requester:users!requests_requester_id_fkey');
  });

  // This proves the mine endpoint scopes results to the authenticated requester and paginates.
  it('lists my requests with pagination', async () => {
    const query = fakeQuery({ data: [], count: 0, error: null });
    mockTables(supabase, { requests: query });
    const response = await request(app).get('/api/requests/mine?page=2&pageSize=5').set(authHeader());
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ data: [], total: 0, page: 2, pageSize: 5 });
    expect(query.eq).toHaveBeenCalledWith('requester_id', 'user-1');
    expect(query.range).toHaveBeenCalledWith(5, 9);
  });

  // This proves managers can filter all requests by status.
  it('filters manager requests by status', async () => {
    const query = fakeQuery({ data: [], count: 0, error: null });
    mockTables(supabase, { requests: query });
    await request(app).get('/api/requests?status=approved').set(authHeader('manager'));
    expect(query.eq).toHaveBeenCalledWith('status', 'approved');
  });

  // This proves cancelling another user's request is forbidden.
  it("rejects cancellation of another requester's request", async () => {
    mockTables(supabase, { requests: fakeQuery({ data: requestRows({ requester_id: 'other-user' }), error: null }) });
    const response = await request(app).patch(`/api/requests/${requestId}/cancel`).set(authHeader());
    expect(response.status).toBe(403);
  });

  // This proves cancelling a missing request returns 404.
  it('returns 404 when cancelling a missing request', async () => {
    mockTables(supabase, { requests: fakeQuery({ data: null, error: null }) });
    const response = await request(app).patch(`/api/requests/${requestId}/cancel`).set(authHeader());
    expect(response.status).toBe(404);
  });

  // This proves terminal request states cannot be cancelled.
  it.each(['prepared', 'completed', 'cancelled'])('rejects cancellation when status is %s', async (status) => {
    mockTables(supabase, { requests: fakeQuery({ data: requestRows({ status }), error: null }) });
    const response = await request(app).patch(`/api/requests/${requestId}/cancel`).set(authHeader());
    expect(response.status).toBe(400);
  });

  // This proves an approved request can be cancelled and writes the new status.
  it('cancels an approved request', async () => {
    const update = fakeQuery({ data: requestRows({ status: 'cancelled' }), error: null });
    mockTables(supabase, { requests: [fakeQuery({ data: requestRows(), error: null }), update] });
    const response = await request(app).patch(`/api/requests/${requestId}/cancel`).set(authHeader());
    expect(response.status).toBe(200);
    expect(update.update).toHaveBeenCalledWith({ status: 'cancelled' });
  });

  // This documents the current behavior that rejected requests can be cancelled.
  it('currently allows cancelling a rejected request', async () => {
    // ideally blocked
    mockTables(supabase, { requests: [fakeQuery({ data: requestRows({ status: 'rejected' }), error: null }), fakeQuery({ data: requestRows({ status: 'cancelled' }), error: null })] });
    const response = await request(app).patch(`/api/requests/${requestId}/cancel`).set(authHeader());
    expect(response.status).toBe(200);
  });

  // This proves status-change RPC results map to their documented HTTP outcomes.
  it.each([
    ['not_found', 404],
    ['unchanged', 400],
    ['invalid_status', 400],
    ['no_items', 409],
    ['conflict', 409],
  ])('maps status change result %s', async (code, expectedStatus) => {
    vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: { success: false, code, conflicts: [] }, error: null });
    const response = await request(app).patch('/api/requests/abc/status').set(authHeader('manager')).send({ status: 'prepared' });
    expect(response.status).toBe(expectedStatus);
  });

  // This proves unexpected status-change results are explicit server errors.
  it('rejects unknown status-change results and RPC errors', async () => {
    quietConsole();
    vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({ data: { success: false, code: 'unknown' }, error: null }).mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const first = await request(app).patch('/api/requests/abc/status').set(authHeader('manager')).send({ status: 'prepared' });
    const second = await request(app).patch('/api/requests/abc/status').set(authHeader('manager')).send({ status: 'prepared' });
    expect(first.body).toEqual({ error: 'Unexpected status change result' });
    expect(second.status).toBe(500);
  });

  // This proves a successful manager status change calls the correct RPC.
  it('changes a request status successfully', async () => {
    const changed = { id: 'abc', requester_id: 'u2', status: 'prepared', start_time: '2030-01-01', end_time: '2030-01-02' };
    const rpc = vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: { success: true, request: changed }, error: null });
    const response = await request(app).patch('/api/requests/abc/status').set(authHeader('manager')).send({ status: 'prepared' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual(changed);
    expect(rpc).toHaveBeenCalledWith('change_request_status', { p_request_id: 'abc', p_new_status: 'prepared' });
  });
});
