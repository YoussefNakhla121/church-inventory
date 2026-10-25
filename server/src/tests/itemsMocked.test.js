import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createRequire } from 'module';
import { authHeader } from './helpers';
import { fakeQuery, mockTables } from './supabaseMock';

const require = createRequire(import.meta.url);
const app = require('../app');
const supabase = require('../config/supabase');

afterEach(() => vi.restoreAllMocks());

const rows = [
  { id: 'a', name: 'Chair', price: 10, is_active: true },
  { id: 'b', name: 'Table', price: 20, is_active: true },
];

describe('mocked items API', () => {
  // This proves requesters cannot see item prices.
  it('hides prices from requesters', async () => {
    mockTables(supabase, { items: fakeQuery({ data: rows, error: null }) });
    const response = await request(app).get('/api/items').set(authHeader('requester'));
    expect(response.status).toBe(200);
    expect(response.body[0]).not.toHaveProperty('price');
  });

  it('hides prices from admins', async () => {
    mockTables(supabase, { items: fakeQuery({ data: rows, error: null }) });
    const response = await request(app).get('/api/items').set(authHeader('admin'));
    expect(response.status).toBe(200);
    expect(response.body[0]).not.toHaveProperty('price');
  });

  // This proves managers can see item prices.
  it('includes prices for managers', async () => {
    mockTables(supabase, { items: fakeQuery({ data: rows, error: null }) });
    const response = await request(app).get('/api/items').set(authHeader('manager'));
    expect(response.status).toBe(200);
    expect(response.body[0]).toHaveProperty('price', 10);
  });

  // This proves requesters cannot bypass the active-item filter with a query parameter.
  it('ignores include_inactive for requesters', async () => {
    const query = fakeQuery({ data: rows, error: null });
    mockTables(supabase, { items: query });
    await request(app).get('/api/items?include_inactive=true').set(authHeader('requester'));
    expect(query.eq).toHaveBeenCalledWith('is_active', true);
  });

  // This proves managers can request inactive items without applying the active filter.
  it('does not apply the active filter for managers including inactive items', async () => {
    const query = fakeQuery({ data: rows, error: null });
    mockTables(supabase, { items: query });
    await request(app).get('/api/items?include_inactive=true').set(authHeader('manager'));
    expect(query.eq).not.toHaveBeenCalledWith('is_active', true);
  });

  // This proves availability subtracts overlapping reservations and never becomes negative.
  it('calculates availability for all items', async () => {
    mockTables(supabase, {
      items: fakeQuery({ data: [{ id: 'a', total_quantity: 5 }, { id: 'b', total_quantity: 2 }, { id: 'c', total_quantity: 3 }], error: null }),
      request_items: fakeQuery({ data: [{ item_id: 'a', quantity_requested: 2 }, { item_id: 'a', quantity_requested: 1 }, { item_id: 'b', quantity_requested: 5 }], error: null }),
    });
    const response = await request(app).get('/api/items/availability?start=2030-01-01T10:00:00Z&end=2030-01-01T12:00:00Z').set(authHeader());
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ availability: { a: 2, b: 0, c: 3 } });
  });

  // This proves deactivation rejects an item that is already inactive.
  it('rejects deactivation of an inactive item', async () => {
    mockTables(supabase, { items: fakeQuery({ data: { id: 'i', is_active: false }, error: null }) });
    const response = await request(app).patch('/api/items/i/deactivate').set(authHeader('manager'));
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Item is already inactive' });
  });

  // This proves deactivation returns not found for an unknown item.
  it('returns 404 when deactivating an unknown item', async () => {
    mockTables(supabase, { items: fakeQuery({ data: null, error: null }) });
    const response = await request(app).patch('/api/items/i/deactivate').set(authHeader('manager'));
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Item not found' });
  });

  // This proves deactivation writes the inactive state.
  it('deactivates an active item', async () => {
    const update = fakeQuery({ data: { id: 'i', is_active: false }, error: null });
    mockTables(supabase, { items: [fakeQuery({ data: { id: 'i', is_active: true }, error: null }), update] });
    const response = await request(app).patch('/api/items/i/deactivate').set(authHeader('manager'));
    expect(response.status).toBe(200);
    expect(update.update).toHaveBeenCalledWith({ is_active: false });
  });

  // This proves reactivation rejects an item that is already active.
  it('rejects reactivation of an active item', async () => {
    mockTables(supabase, { items: fakeQuery({ data: { id: 'i', is_active: true }, error: null }) });
    const response = await request(app).patch('/api/items/i/reactivate').set(authHeader('manager'));
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Item is already active' });
  });

  // This proves reactivation returns not found for an unknown item.
  it('returns 404 when reactivating an unknown item', async () => {
    mockTables(supabase, { items: fakeQuery({ data: null, error: null }) });
    const response = await request(app).patch('/api/items/i/reactivate').set(authHeader('manager'));
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Item not found' });
  });

  // This proves reactivation writes the active state.
  it('reactivates an inactive item', async () => {
    const update = fakeQuery({ data: { id: 'i', is_active: true }, error: null });
    mockTables(supabase, { items: [fakeQuery({ data: { id: 'i', is_active: false }, error: null }), update] });
    const response = await request(app).patch('/api/items/i/reactivate').set(authHeader('manager'));
    expect(response.status).toBe(200);
    expect(update.update).toHaveBeenCalledWith({ is_active: true });
  });
});
