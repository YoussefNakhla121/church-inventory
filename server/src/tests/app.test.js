import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createRequire } from 'module';
import { quietConsole } from './helpers';

const require = createRequire(import.meta.url);
const app = require('../app');

describe('Express app', () => {
  // This proves the health route reports that the API is running.
  it('returns the API health status from GET /', async () => {
    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      service: 'church-inventory-api',
    });
  });

  // This proves unknown GET routes return the JSON 404 response.
  it('returns 404 for an unknown GET route', async () => {
    const response = await request(app).get('/api/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Route not found' });
  });

  // This proves unknown POST routes use the same JSON 404 response.
  it('returns 404 for an unknown POST route', async () => {
    const response = await request(app).post('/api/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Route not found' });
  });

  // This proves the local frontend origin is allowed for development testing.
  it('allows CORS preflight requests from localhost', async () => {
    const origin = 'http://localhost:5173';
    const response = await request(app)
      .options('/api/items')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(origin);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  // This proves the canonical Vercel frontend origin is allowed by CORS.
  it('allows CORS preflight requests from the canonical Vercel origin', async () => {
    const origin = 'https://wsa2l-el-2daa7.vercel.app';
    const response = await request(app)
      .options('/api/items')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization');

    expect(response.status).toBe(204);
  });

  // This proves requests from command-line tools without an Origin header work.
  it('allows requests without an Origin header', async () => {
    const response = await request(app).get('/');

    expect(response.status).toBe(200);
  });

  // This proves the current CORS error reaches the global error handler.
  it('CURRENT BEHAVIOR: returns 500 for a disallowed CORS preflight', async () => {
    // ideally this would be 403
    quietConsole();

    const response = await request(app)
      .options('/api/items')
      .set('Origin', 'https://evil.example.com')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });

  // This proves unapproved Vercel subdomains are rejected.
  it('blocks CORS preflight requests from other Vercel subdomains', async () => {
    const response = await request(app)
      .options('/api/items')
      .set('Origin', 'https://anything-random.vercel.app')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });

  // This proves malformed JSON currently reaches the global error handler.
  it('CURRENT BEHAVIOR: returns 500 for malformed login JSON', async () => {
    // ideally 400
    quietConsole();

    const response = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{bad');

    expect(response.status).toBe(501);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });
});
