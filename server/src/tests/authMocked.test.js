import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { createRequire } from 'module';
import { authHeader, quietConsole } from './helpers';
import { fakeQuery, mockTables } from './supabaseMock';

const require = createRequire(import.meta.url);
const app = require('../app');
const supabase = require('../config/supabase');

afterEach(() => vi.restoreAllMocks());

const registerBody = {
  full_name: ' Test User ',
  gmail: 'test@example.com',
  password: 'secret123',
  phone: '1',
  gradegroup: 'G',
};

describe('mocked authentication API', () => {
  // This proves successful login issues a usable token without exposing the password hash.
  it('logs in successfully', async () => {
    const passwordHash = await bcrypt.hash('secret123', 4);
    mockTables(supabase, {
      users: fakeQuery({
        data: { id: 'user-1', full_name: 'Test', gmail: 'user@example.com', password_hash: passwordHash, role: 'requester', phone: '1', gradegroup: 'G' },
        error: null,
      }),
    });

    const response = await request(app).post('/api/auth/login').send({ gmail: 'user@example.com', password: 'secret123' });
    const payload = jwt.verify(response.body.token, 'test-secret');

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ id: 'user-1', gmail: 'user@example.com', role: 'requester' });
    expect(response.body.user).not.toHaveProperty('password_hash');
  });

  // This proves wrong credentials do not reveal whether an account exists.
  it.each([
    ['wrong password', { data: { id: 'u', password_hash: bcrypt.hashSync('right', 4) }, error: null }, 'wrong'],
    ['unknown gmail', { data: null, error: null }, 'secret123'],
  ])('rejects %s with the same message', async (_name, result, password) => {
    mockTables(supabase, { users: fakeQuery(result) });
    const response = await request(app).post('/api/auth/login').send({ gmail: 'user@example.com', password });
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid gmail or password' });
  });

  // This proves registration rejects a duplicate gmail.
  it('rejects an already taken gmail', async () => {
    mockTables(supabase, { users: fakeQuery({ data: { id: 'x' }, error: null }) });
    const response = await request(app).post('/api/auth/register').send(registerBody);
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Gmail already taken' });
  });

  // This proves registration hashes passwords before inserting users.
  it('registers a user with a hashed password', async () => {
    const lookup = fakeQuery({ data: null, error: null });
    const insert = fakeQuery({ data: { id: 'u1', full_name: 'Test User', gmail: registerBody.gmail, role: 'requester', gradegroup: 'G' }, error: null });
    mockTables(supabase, { users: [lookup, insert] });
    const response = await request(app).post('/api/auth/register').send(registerBody);
    const inserted = insert.insert.mock.calls[0][0];

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('token');
    expect(response.body).toHaveProperty('user');
    expect(inserted.password_hash).not.toBe(registerBody.password);
    expect(inserted.password_hash).toMatch(/^\$2/);
  });

  it.each(['Grade 1', 'ابتدائي'])('registers an admin with allowed gradegroup %s', async (gradegroup) => {
    const lookup = fakeQuery({ data: null, error: null });
    const insert = fakeQuery({ data: { id: 'a1', full_name: 'Admin', gmail: 'admin@example.com', role: 'admin', gradegroup }, error: null });
    mockTables(supabase, {
      gradegroup: fakeQuery({ data: [{ name: 'Grade 1' }], error: null }),
      users: [lookup, insert],
    });

    const response = await request(app)
      .post('/api/auth/register-admin')
      .set(authHeader('manager'))
      .send({ ...registerBody, gmail: `admin-${gradegroup}@example.com`, gradegroup });
    const inserted = insert.insert.mock.calls[0][0];

    expect(response.status).toBe(201);
    expect(inserted.role).toBe('admin');
    expect(inserted.password_hash).toMatch(/^\$2/);
  });

  it('public registration always creates a requester despite a role in the body', async () => {
    const lookup = fakeQuery({ data: null, error: null });
    const insert = fakeQuery({ data: { id: 'u2', role: 'requester' }, error: null });
    mockTables(supabase, { users: [lookup, insert] });

    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...registerBody, role: 'admin' });

    expect(response.status).toBe(201);
    expect(insert.insert.mock.calls[0][0].role).toBe('requester');
  });

  // This documents that the manager-registration route currently requires authentication.
  it('currently rejects manager registration without a token', async () => {
    // SECURITY: ideally rejected unless the caller is a manager
    mockTables(supabase, {
      users: [
        fakeQuery({ data: null, error: null }),
        fakeQuery({ data: { id: 'm1', gmail: registerBody.gmail, role: 'manager' }, error: null }),
      ],
    });
    const response = await request(app).post('/api/auth/register-manager').send(registerBody);
    expect(response.status).toBe(401);
  });

  // This proves profile updates reject a gmail owned by another user.
  it('rejects a profile gmail already owned by another user', async () => {
    mockTables(supabase, {
      users: [
        fakeQuery({ data: { gmail: 'old@example.com' }, error: null }),
        fakeQuery({ data: { id: 'other' }, error: null }),
      ],
    });
    const response = await request(app).put('/api/auth/profile').set(authHeader()).send({ full_name: ' Ann ', gmail: 'new@x.com', phone: '1', gradegroup: 'G' });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Gmail already taken' });
  });

  // This proves profile names are trimmed before persistence.
  it('updates a profile and trims the full name', async () => {
    const update = fakeQuery({ data: { id: 'user-1', full_name: 'Ann', gmail: 'new@x.com' }, error: null });
    mockTables(supabase, {
      users: [fakeQuery({ data: { gmail: 'old@example.com' }, error: null }), fakeQuery({ data: null, error: null }), update],
    });
    const response = await request(app).put('/api/auth/profile').set(authHeader()).send({ full_name: ' Ann ', gmail: 'new@x.com', phone: '1', gradegroup: 'G' });
    expect(response.status).toBe(200);
    expect(update.update).toHaveBeenCalledWith({ full_name: 'Ann', gmail: 'new@x.com', phone: '1', gradegroup: 'G' });
  });

  // This proves an unchanged gmail does not perform a uniqueness lookup.
  it('skips the uniqueness lookup when the gmail is unchanged', async () => {
    const current = fakeQuery({ data: { gmail: 'user@example.com' }, error: null });
    const update = fakeQuery({ data: { id: 'user-1' }, error: null });
    mockTables(supabase, { users: [current, update] });
    await request(app).put('/api/auth/profile').set(authHeader()).send({ full_name: ' Ann ', gmail: 'user@example.com', phone: '1', gradegroup: 'G' });
    expect(supabase.from).toHaveBeenCalledTimes(2);
  });

  // This proves grade groups are trimmed and blank names are omitted.
  it('returns cleaned grade groups without authentication', async () => {
    mockTables(supabase, { gradegroup: fakeQuery({ data: [{ name: 'Grade 1 ' }, { name: '  ' }, { name: 'Grade 2' }], error: null }) });
    const response = await request(app).get('/api/gradegroups');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(['Grade 1', 'Grade 2']);
  });

  // This proves grade group database failures are surfaced as HTTP 500.
  it('returns 500 when grade groups cannot be loaded', async () => {
    quietConsole();
    mockTables(supabase, { gradegroup: fakeQuery({ data: null, error: { message: 'boom' } }) });
    const response = await request(app).get('/api/gradegroups');
    expect(response.status).toBe(500);
  });
});
