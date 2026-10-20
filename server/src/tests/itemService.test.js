import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

// Fake values so supabase.js doesn't throw when it loads.
// Nothing connects to a real database in this test.
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY = 'fake-key';

const require = createRequire(import.meta.url);
const { validateItemInput } = require('../services/itemService');

describe('validateItemInput', () => {
  it('accepts a valid item', () => {
    const result = validateItemInput({ name: 'Chair', total_quantity: '5', price: '10' });
    expect(result).toEqual({ qty: 5, priceValue: 10 });
  });

  it('defaults price to 0 when empty', () => {
    const result = validateItemInput({ name: 'Chair', total_quantity: 3, price: '' });
    expect(result.priceValue).toBe(0);
  });

  it('throws when name is missing', () => {
    expect(() => validateItemInput({ total_quantity: 3 })).toThrow('name and total_quantity are required');
  });

  it('throws when quantity is less than 1', () => {
    expect(() => validateItemInput({ name: 'Chair', total_quantity: 0 })).toThrow();
  });

  it('throws when price is negative', () => {
    expect(() => validateItemInput({ name: 'Chair', total_quantity: 1, price: -5 })).toThrow('price must be');
  });
});