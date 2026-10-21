import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createRequire } from 'module';
import jwt from 'jsonwebtoken';
import { makeToken, authHeader } from './helpers';

const require = createRequire(import.meta.url);
const app = require('../app');

describe('auth middleware through HTTP routes', () => {
  // This proves requests without an Authorization header are rejected.
  it('rejects a request with no Authorization header', async () => {
    const response = await request(app).get('/api/requests/mine');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Authorization token required' });
  });

  // This proves an Authorization header with the wrong scheme is rejected.
  it('rejects a Token authorization scheme', async () => {
    const response = await request(app)
      .get('/api/requests/mine')
      .set('Authorization', 'Token abc');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Authorization token required' });
  });

  // This proves the Bearer scheme is case-sensitive.
  it('rejects a lowercase bearer authorization scheme', async () => {
    const response = await request(app)
      .get('/api/requests/mine')
      .set('Authorization', 'bearer abc');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Authorization token required' });
  });

  // This proves an empty Bearer header is rejected when HTTP trims its trailing space.
  it('rejects an empty Bearer token', async () => {
    const response = await request(app)
      .get('/api/requests/mine')
      .set('Authorization', 'Bearer ');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Authorization token required' });
  });

  // This proves malformed JWT text is rejected.
  it('rejects a garbage Bearer token', async () => {
    const response = await request(app)
      .get('/api/requests/mine')
      .set('Authorization', 'Bearer garbage');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid token' });
  });

  // This proves expired JWTs receive the expiration-specific error.
  it('rejects an expired token', async () => {
    const response = await request(app)
      .get('/api/requests/mine')
      .set('Authorization', `Bearer ${makeToken('requester', { expiresIn: -10 })}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Token has expired' });
  });

  // This proves tokens signed with a different secret are rejected.
  it('rejects a token signed with a different secret', async () => {
    const token = jwt.sign({ id: 'user-1', role: 'requester' }, 'wrong-secret');
    const response = await request(app)
      .get('/api/requests/mine')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid token' });
  });

  // This proves every listed protected route rejects requests without a token.
  it.each([
    ['GET /api/items', () => request(app).get('/api/items')],
    ['GET /api/items/availability', () => request(app).get('/api/items/availability')],
    [
      'GET /api/items/abc/availability',
      () => request(app).get('/api/items/abc/availability'),
    ],
    ['GET /api/requests/mine', () => request(app).get('/api/requests/mine')],
    ['POST /api/requests', () => request(app).post('/api/requests')],
    [
      'PATCH /api/requests/abc/cancel',
      () => request(app).patch('/api/requests/abc/cancel'),
    ],
    ['GET /api/requests/abc', () => request(app).get('/api/requests/abc')],
    [
      'GET /api/requests/abc/comments',
      () => request(app).get('/api/requests/abc/comments'),
    ],
    [
      'POST /api/requests/abc/comments',
      () => request(app).post('/api/requests/abc/comments'),
    ],
    ['PUT /api/auth/profile', () => request(app).put('/api/auth/profile')],
  ])('%s rejects a request without a token', async (_route, makeRequest) => {
    const response = await makeRequest();

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Authorization token required' });
  });

  // This proves a valid token passes auth and reaches request ID validation.
  it('allows a valid token through the middleware', async () => {
    const response = await request(app)
      .get('/api/requests/not-a-uuid')
      .set(authHeader('requester'));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid request ID' });
  });
});
