import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createRequire } from 'module';
import jwt from 'jsonwebtoken';
import { makeToken, authHeader } from './helpers';

const require = createRequire(import.meta.url);
const app = require('../app');

const MANAGER_ROUTES = [
  ['get', '/api/requests'],
  ['patch', '/api/requests/abc/status'],
  ['get', '/api/requests/abc/condition-reports'],
  ['post', '/api/requests/abc/condition-reports'],
  ['post', '/api/items'],
  ['patch', '/api/items/abc'],
  ['patch', '/api/items/abc/deactivate'],
  ['patch', '/api/items/abc/reactivate'],
  ['get', '/api/items/abc/condition-history'],
];

const callRoute = ([method, path], headers) => {
  const routeRequest = request(app)[method](path);
  if (headers) {
    routeRequest.set(headers);
  }
  return routeRequest;
};

describe('manager-only routes through HTTP', () => {
  // This proves every manager-only route requires authentication.
  it.each(MANAGER_ROUTES)('%s %s rejects requests without a token', async (method, path) => {
    const response = await callRoute([method, path]);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Authorization token required' });
  });

  // This proves authenticated requesters cannot access manager-only routes.
  it.each(MANAGER_ROUTES)('%s %s rejects requester tokens', async (method, path) => {
    const response = await callRoute([method, path], authHeader('requester'));

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Access denied: managers only' });
  });

  // This proves an authenticated token with an unknown role is not treated as a manager.
  it.each(MANAGER_ROUTES)('%s %s rejects tokens with an unknown role', async (method, path) => {
    const response = await callRoute([method, path], authHeader('member'));

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Access denied: managers only' });
  });

  // This proves a forged manager claim signed with the wrong secret is rejected by auth.
  it.each(MANAGER_ROUTES)(
    '%s %s rejects a manager claim signed with the wrong secret',
    async (method, path) => {
      const token = jwt.sign({ id: 'user-1', role: 'manager' }, 'wrong-secret');
      const response = await callRoute([method, path], {
        Authorization: `Bearer ${token}`,
      });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid token' });
    }
  );

  // This proves a valid manager token passes the role gate and reaches status validation.
  it('allows a manager token through the role gate', async () => {
    const response = await request(app)
      .get('/api/requests?status=bad')
      .set(authHeader('manager'));

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/^Invalid status\. Must be one of:/);
  });

  // This proves the manager gate runs before status validation for non-managers.
  it('rejects a requester before validating the request status', async () => {
    const response = await request(app)
      .get('/api/requests?status=bad')
      .set(authHeader('requester'));

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Access denied: managers only' });
  });
});
