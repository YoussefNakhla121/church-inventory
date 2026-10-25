import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createRequire } from 'module';
import { authHeader } from './helpers';
import { fakeQuery, mockTables } from './supabaseMock';

const require = createRequire(import.meta.url);
const app = require('../app');
const supabase = require('../config/supabase');

afterEach(() => vi.restoreAllMocks());

describe('mocked comments and condition reports API', () => {
  // This proves requesters cannot comment on another user's request.
  it('rejects a comment on someone else’s request', async () => {
    mockTables(supabase, { requests: fakeQuery({ data: { id: 'abc', requester_id: 'other-user' }, error: null }) });
    const response = await request(app).post('/api/requests/abc/comments').set(authHeader()).send({ body: 'hello' });
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'You can only comment on your own requests' });
  });

  // This proves comments for a missing request return 404.
  it('returns 404 when commenting on a missing request', async () => {
    mockTables(supabase, { requests: fakeQuery({ data: null, error: null }) });
    const response = await request(app).post('/api/requests/abc/comments').set(authHeader()).send({ body: 'hello' });
    expect(response.status).toBe(404);
  });

  // This proves managers can add trimmed comments to any request.
  it('allows managers to post trimmed comments', async () => {
    const insert = fakeQuery({ data: { id: 'c1', body: 'hello' }, error: null });
    mockTables(supabase, { requests: fakeQuery({ data: { id: 'abc', requester_id: 'other-user' }, error: null }), request_comments: insert });
    const response = await request(app).post('/api/requests/abc/comments').set(authHeader('manager')).send({ body: '  hello  ' });
    expect(response.status).toBe(201);
    expect(insert.insert).toHaveBeenCalledWith({ request_id: 'abc', author_id: 'user-1', body: 'hello' });
  });

  // This proves requesters cannot read comments on another user's request.
  it('does not let a requester read another user’s comments', async () => {
    mockTables(supabase, {
      requests: fakeQuery({ data: { id: 'abc', requester_id: 'other-user' }, error: null }),
      request_comments: fakeQuery({ data: [], error: null }),
    });
    const response = await request(app).get('/api/requests/abc/comments').set(authHeader());
    expect([403, 404]).toContain(response.status);
  });

  it('does not let an admin read another user’s comments', async () => {
    mockTables(supabase, { requests: fakeQuery({ data: { id: 'abc', requester_id: 'other-user' }, error: null }) });
    const response = await request(app).get('/api/requests/abc/comments').set(authHeader('admin'));
    expect(response.status).toBe(403);
  });

  it('does not let an admin post comments on another user’s request', async () => {
    mockTables(supabase, { requests: fakeQuery({ data: { id: 'abc', requester_id: 'other-user' }, error: null }) });
    const response = await request(app).post('/api/requests/abc/comments').set(authHeader('admin')).send({ body: 'hello' });
    expect(response.status).toBe(403);
  });

  // This proves condition reports require an existing request.
  it('returns 404 for a missing condition-report request', async () => {
    mockTables(supabase, { requests: fakeQuery({ data: null, error: null }) });
    const response = await request(app).post('/api/requests/abc/condition-reports').set(authHeader('manager')).send({ reports: [{ item_id: 'i1', condition: 'good' }] });
    expect(response.status).toBe(404);
  });

  // This proves condition reports are only accepted for completed requests.
  it('rejects reports for an approved request', async () => {
    mockTables(supabase, { requests: fakeQuery({ data: { id: 'abc', status: 'approved' }, error: null }) });
    const response = await request(app).post('/api/requests/abc/condition-reports').set(authHeader('manager')).send({ reports: [{ item_id: 'i1', condition: 'good' }] });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain('completed');
  });

  // This proves every reported item must belong to the request.
  it('rejects a report for an unrelated item', async () => {
    mockTables(supabase, {
      requests: fakeQuery({ data: { id: 'abc', status: 'completed' }, error: null }),
      request_items: fakeQuery({ data: [{ item_id: 'i1' }], error: null }),
    });
    const response = await request(app).post('/api/requests/abc/condition-reports').set(authHeader('manager')).send({ reports: [{ item_id: 'i2', condition: 'good' }] });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Item i2 does not belong to this request' });
  });

  // This proves valid condition reports are inserted with the authenticated reporter and null notes.
  it('submits valid condition reports', async () => {
    const insert = fakeQuery({ data: [{ id: 'r1', condition: 'good' }], error: null });
    mockTables(supabase, {
      requests: fakeQuery({ data: { id: 'abc', status: 'completed' }, error: null }),
      request_items: fakeQuery({ data: [{ item_id: 'i1' }], error: null }),
      item_condition_reports: insert,
    });
    const response = await request(app).post('/api/requests/abc/condition-reports').set(authHeader('manager')).send({ reports: [{ item_id: 'i1', condition: 'good' }] });
    expect(response.status).toBe(201);
    expect(insert.insert).toHaveBeenCalledWith([{ request_id: 'abc', item_id: 'i1', reported_by: 'user-1', condition: 'good', notes: null }]);
  });
});
