import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createRequire } from 'module';
import { authHeader, quietConsole } from './helpers';
import { fakeQuery } from './supabaseMock';

const require = createRequire(import.meta.url);
const app = require('../app');
const supabase = require('../config/supabase');

const daysFromNow = (days) => new Date(Date.now() + days * 86400000).toISOString();

const validRequestBody = () => {
  const start = new Date(Date.now() + 86400000);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  return {
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    items: [{ item_id: 'i1', quantity_requested: 1 }],
  };
};

beforeEach(() => {
  const boom = () => {
    throw new Error('DB must not be called in validation tests');
  };
  vi.spyOn(supabase, 'from').mockImplementation(boom);
  vi.spyOn(supabase, 'rpc').mockImplementation(boom);
});

afterEach(() => vi.restoreAllMocks());

describe('auth validation', () => {
  // This proves login rejects requests that omit the password before looking up a user.
  it('rejects login without a password', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ gmail: 'user@example.com' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'gmail and password are required' });
  });

  // This proves registration requires each field that the current route validates.
  it.each(['full_name', 'gmail', 'password', 'phone', 'gradegroup'])(
    'rejects registration without %s',
    async (field) => {
      const body = {
        full_name: 'Test User',
        gmail: 'user@example.com',
        password: 'secret123',
        phone: '123456789',
        role: 'requester',
        gradegroup: 'A',
      };
      delete body[field];

      const response = await request(app).post('/api/auth/register').send(body);

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/required/);
    }
  );

  // This proves the current registration route ignores an invalid role and reaches the database.
  it('CURRENT BEHAVIOR: reaches the database when registration role is invalid', async () => {
    quietConsole();

    const response = await request(app).post('/api/auth/register').send({
      full_name: 'Test User',
      gmail: 'user@example.com',
      password: 'secret123',
      phone: '123456789',
      role: 'admin',
      gradegroup: 'A',
    });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });

  // This proves the current registration route ignores a missing role and reaches the database.
  it('CURRENT BEHAVIOR: reaches the database when registration role is missing', async () => {
    quietConsole();

    const response = await request(app).post('/api/auth/register').send({
      full_name: 'Test User',
      gmail: 'user@example.com',
      password: 'secret123',
      phone: '123456789',
      gradegroup: 'A',
    });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });

  // This proves registration rejects passwords shorter than six characters.
  it('rejects a short registration password', async () => {
    const response = await request(app).post('/api/auth/register').send({
      full_name: 'Test User',
      gmail: 'user@example.com',
      password: '12345',
      phone: '123456789',
      role: 'requester',
      gradegroup: 'A',
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'password must be at least 6 characters' });
  });

  it('rejects an admin registration without a gradegroup', async () => {
    const response = await request(app)
      .post('/api/auth/register-admin')
      .set(authHeader('manager'))
      .send({ full_name: 'Admin', gmail: 'admin@example.com', password: 'secret123', phone: '123' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/required/);
  });

  it('rejects an admin registration with an unknown gradegroup', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'gradegroup') {
        return fakeQuery({ data: [{ name: 'Grade 1' }], error: null });
      }
      throw new Error('DB must not be called in validation tests');
    });

    const response = await request(app)
      .post('/api/auth/register-admin')
      .set(authHeader('manager'))
      .send({
        full_name: 'Admin',
        gmail: 'admin@example.com',
        password: 'secret123',
        phone: '123',
        gradegroup: 'Unknown',
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'gradegroup must be one of the available grade groups' });
  });

  // This proves profile updates require all profile fields before database access.
  it('rejects an empty profile update', async () => {
    const response = await request(app)
      .put('/api/auth/profile')
      .set(authHeader('requester'))
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'full_name, gmail, phone, and gradegroup are required',
    });
  });
});

describe('create request validation', () => {
  // This proves request creation requires its scheduling and item fields.
  it('rejects a request with an empty body', async () => {
    const response = await request(app)
      .post('/api/requests')
      .set(authHeader('requester'))
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'start_time, end_time, and items are required' });
  });

  // This proves request creation requires at least one requested item.
  it('rejects an empty items array', async () => {
    const response = await request(app)
      .post('/api/requests')
      .set(authHeader('requester'))
      .send({ ...validRequestBody(), items: [] });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'items must be a non-empty array' });
  });

  // This proves each requested item needs an ID and a positive quantity.
  it.each([
    ['zero quantity', { item_id: 'i1', quantity_requested: 0 }],
    ['negative quantity', { item_id: 'i1', quantity_requested: -1 }],
    ['no item ID', { quantity_requested: 1 }],
  ])('rejects an item with %s', async (_caseName, item) => {
    const response = await request(app)
      .post('/api/requests')
      .set(authHeader('requester'))
      .send({ ...validRequestBody(), items: [item] });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Each item must have item_id and quantity_requested >= 1',
    });
  });

  // This proves managers must provide a non-empty gradegroup for a request.
  it.each([undefined, '   '])('rejects a manager request with gradegroup %j', async (gradegroup) => {
    const body = validRequestBody();
    if (gradegroup !== undefined) {
      body.gradegroup = gradegroup;
    }

    const response = await request(app)
      .post('/api/requests')
      .set(authHeader('manager'))
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Gradegroup is required for managers' });
  });

  // This proves request creation rejects malformed scheduling dates.
  it('rejects an invalid start date', async () => {
    const response = await request(app)
      .post('/api/requests')
      .set(authHeader('requester'))
      .send({ ...validRequestBody(), start_time: 'not-a-date' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid date format for start_time or end_time' });
  });

  // This proves request creation requires the end time to be strictly later than the start.
  it.each(['before', 'equal'])('rejects an end time that is %s the start time', async (caseName) => {
    const start = daysFromNow(1);
    const end = caseName === 'before'
      ? new Date(new Date(start).getTime() - 1).toISOString()
      : start;

    const response = await request(app)
      .post('/api/requests')
      .set(authHeader('requester'))
      .send({ ...validRequestBody(), start_time: start, end_time: end });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'end_time must be after start_time' });
  });

  // This proves reservations cannot be made more than 90 days in advance.
  it('rejects a reservation 91 days ahead', async () => {
    const start = daysFromNow(91);
    const end = new Date(new Date(start).getTime() + 2 * 60 * 60 * 1000).toISOString();
    const response = await request(app)
      .post('/api/requests')
      .set(authHeader('requester'))
      .send({ ...validRequestBody(), start_time: start, end_time: end });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Reservations can be made at most 90 days in advance',
    });
  });

  // This proves reservations cannot start in the past.
  it('rejects a reservation that starts yesterday', async () => {
    const start = daysFromNow(-1);
    const end = new Date(new Date(start).getTime() + 2 * 60 * 60 * 1000).toISOString();
    const response = await request(app)
      .post('/api/requests')
      .set(authHeader('requester'))
      .send({ ...validRequestBody(), start_time: start, end_time: end });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'start_time cannot be in the past' });
  });
});

describe('availability validation', () => {
  // This proves the all-items availability endpoint requires both date parameters.
  it('rejects availability without query parameters', async () => {
    const response = await request(app)
      .get('/api/items/availability')
      .set(authHeader('requester'));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Query params "start" and "end" are required' });
  });

  // This proves the all-items availability endpoint rejects malformed dates.
  it('rejects invalid availability dates', async () => {
    const response = await request(app)
      .get('/api/items/availability?start=abc&end=def')
      .set(authHeader('requester'));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid date format for "start" or "end"' });
  });

  // This proves availability requires the end date to be strictly later than the start.
  it.each(['before', 'equal'])('rejects an availability end date that is %s the start', async (caseName) => {
    const start = daysFromNow(1);
    const end = caseName === 'before'
      ? new Date(new Date(start).getTime() - 1).toISOString()
      : start;
    const response = await request(app)
      .get(`/api/items/availability?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`)
      .set(authHeader('requester'));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: '"end" must be after "start"' });
  });

  // This proves item-specific availability validates missing and malformed dates before lookup.
  it.each([
    ['/api/items/abc/availability', undefined],
    ['/api/items/abc/availability?start=abc&end=def', 'invalid'],
  ])('rejects invalid item availability input (%s)', async (path, _caseName) => {
    const response = await request(app)
      .get(path)
      .set(authHeader('requester'));

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/required|Invalid date format/);
  });
});

describe('manager endpoint validation', () => {
  // This proves changing request status requires a status field.
  it('rejects a status update without a status', async () => {
    const response = await request(app)
      .patch('/api/requests/abc/status')
      .set(authHeader('manager'))
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'status field is required' });
  });

  // This proves changing request status rejects unsupported status values.
  it('rejects an invalid request status', async () => {
    const response = await request(app)
      .patch('/api/requests/abc/status')
      .set(authHeader('manager'))
      .send({ status: 'banana' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/^Invalid status\. Must be one of:/);
  });

  // This proves request listing rejects malformed date filters before querying.
  it('rejects an invalid request date filter', async () => {
    const response = await request(app)
      .get('/api/requests?date=garbage')
      .set(authHeader('manager'));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid date filter' });
  });

  // This proves request lookup rejects an invalid request ID before querying.
  it('rejects an invalid request ID', async () => {
    const response = await request(app)
      .get('/api/requests/not-a-uuid')
      .set(authHeader('requester'));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid request ID' });
  });

  // This proves condition reports require at least one report.
  it.each([{ reports: [] }, {}])('rejects condition reports without entries', async (body) => {
    const response = await request(app)
      .post('/api/requests/abc/condition-reports')
      .set(authHeader('manager'))
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'reports must be a non-empty array' });
  });

  // This proves condition reports reject unsupported condition values.
  it('rejects an invalid condition report condition', async () => {
    const response = await request(app)
      .post('/api/requests/abc/condition-reports')
      .set(authHeader('manager'))
      .send({ reports: [{ item_id: 'i1', condition: 'broken' }] });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Each report condition must be one of: good, damaged, missing',
    });
  });

  // This proves each condition report requires an item ID.
  it('rejects a condition report without an item ID', async () => {
    const response = await request(app)
      .post('/api/requests/abc/condition-reports')
      .set(authHeader('manager'))
      .send({ reports: [{ condition: 'good' }] });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Each report must have an item_id' });
  });

  // This proves comments require non-empty text.
  it.each([{}, { body: '   ' }])('rejects an empty comment body', async (body) => {
    const response = await request(app)
      .post('/api/requests/abc/comments')
      .set(authHeader('requester'))
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Comment body is required' });
  });

  // This proves item creation requires both a name and quantity.
  it('rejects an item without a name or quantity', async () => {
    const response = await request(app)
      .post('/api/items')
      .set(authHeader('manager'))
      .send({ total_quantity: 3 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'name and total_quantity are required' });
  });

  // This proves item creation requires a positive integer quantity.
  it('rejects an item with an invalid quantity', async () => {
    const response = await request(app)
      .post('/api/items')
      .set(authHeader('manager'))
      .send({ name: 'Chair', total_quantity: -2 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'total_quantity must be an integer >= 1' });
  });

  // This proves item creation rejects negative prices.
  it('rejects an item with a negative price', async () => {
    const response = await request(app)
      .post('/api/items')
      .set(authHeader('manager'))
      .send({ name: 'Chair', total_quantity: 1, price: -5 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'price must be a number equal to or greater than 0',
    });
  });
});

describe('documented current validation behavior', () => {
  // This proves the current numeric comment body error reaches the global handler.
  it('CURRENT BEHAVIOR: returns 500 for a numeric comment body', async () => {
    // ideally 400
    quietConsole();

    const response = await request(app)
      .post('/api/requests/abc/comments')
      .set(authHeader('requester'))
      .send({ body: 123 });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });

  // This proves the current unsupported upload error reaches the global handler.
  it('CURRENT BEHAVIOR: returns 500 for a non-image item upload', async () => {
    // ideally 400
    quietConsole();

    const response = await request(app)
      .post('/api/items')
      .set(authHeader('manager'))
      .attach('photo', Buffer.from('hello'), {
        filename: 'a.txt',
        contentType: 'text/plain',
      });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });

  // This proves the current oversized upload error reaches the global handler.
  it('CURRENT BEHAVIOR: returns 500 for an oversized item upload', async () => {
    // ideally 413 or 400
    quietConsole();

    const response = await request(app)
      .post('/api/items')
      .set(authHeader('manager'))
      .attach('photo', Buffer.alloc(1024 * 1024 + 1), {
        filename: 'a.png',
        contentType: 'image/png',
      });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });
});
