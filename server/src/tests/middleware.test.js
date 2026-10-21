import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';
import jwt from 'jsonwebtoken';

const require = createRequire(import.meta.url);
const auth = require('../middleware/auth');
const requireManager = require('../middleware/requireManager');

const JWT_SECRET = 'middleware-test-secret';

const createResponse = () => {
  const response = {
    status: (statusCode) => {
      response.statusCode = statusCode;
      return response;
    },
    json: (body) => {
      response.body = body;
      return response;
    },
  };

  return response;
};

describe('auth middleware', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
  });

  it('rejects requests without an authorization header', () => {
    const req = { headers: {} };
    const res = createResponse();
    const next = () => {};

    auth(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Authorization token required' });
  });

  it('rejects authorization headers that do not use the Bearer scheme', () => {
    const req = { headers: { authorization: 'Basic credentials' } };
    const res = createResponse();
    const next = () => {};

    auth(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Authorization token required' });
  });

  it('rejects invalid tokens', () => {
    const req = { headers: { authorization: 'Bearer invalid-token' } };
    const res = createResponse();
    const next = () => {};

    auth(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid token' });
  });

  it('rejects expired tokens with an expiration-specific error', () => {
    const token = jwt.sign({ id: 'user-1', role: 'requester' }, JWT_SECRET, {
      expiresIn: -1,
    });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = createResponse();
    const next = () => {};

    auth(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Token has expired' });
  });

  it('attaches the decoded user and calls next for a valid token', () => {
    const user = { id: 'user-1', gmail: 'user@example.com', role: 'requester' };
    const token = jwt.sign(user, JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = createResponse();
    let nextCalls = 0;

    auth(req, res, () => {
      nextCalls += 1;
    });

    expect(req.user).toMatchObject(user);
    expect(nextCalls).toBe(1);
    expect(res.statusCode).toBeUndefined();
  });
});

describe('requireManager middleware', () => {
  it('rejects requests without an authenticated user', () => {
    const req = {};
    const res = createResponse();
    const next = () => {};

    requireManager(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Access denied: managers only' });
  });

  it('rejects authenticated users who are not managers', () => {
    const req = { user: { id: 'user-1', role: 'member' } };
    const res = createResponse();
    const next = () => {};

    requireManager(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Access denied: managers only' });
  });

  it('calls next for an authenticated manager', () => {
    const req = { user: { id: 'manager-1', role: 'manager' } };
    const res = createResponse();
    let nextCalls = 0;

    requireManager(req, res, () => {
      nextCalls += 1;
    });

    expect(nextCalls).toBe(1);
    expect(res.statusCode).toBeUndefined();
  });
});
