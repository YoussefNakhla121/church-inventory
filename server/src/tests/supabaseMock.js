import { vi } from 'vitest';

// A fake Supabase query builder whose chain methods return the same object.
export function fakeQuery(result) {
  const q = {};
  for (const method of [
    'select',
    'insert',
    'update',
    'delete',
    'eq',
    'in',
    'not',
    'lt',
    'gt',
    'gte',
    'lte',
    'order',
    'range',
    'limit',
  ]) {
    q[method] = vi.fn(() => q);
  }
  q.maybeSingle = vi.fn(() => Promise.resolve(result));
  q.single = vi.fn(() => Promise.resolve(result));
  q.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return q;
}

// Makes supabase.from(table) return prepared fakes in call order.
export function mockTables(supabase, tables) {
  const calls = {};
  return vi.spyOn(supabase, 'from').mockImplementation((name) => {
    const entry = tables[name];
    if (!entry) throw new Error(`Unexpected table in test: ${name}`);
    const list = Array.isArray(entry) ? entry : [entry];
    const index = calls[name] || 0;
    calls[name] = index + 1;
    return list[Math.min(index, list.length - 1)];
  });
}
