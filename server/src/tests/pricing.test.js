import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { calculateTotalPrice } = require('../utils/pricing');

const hours = (value) => value * 60 * 60 * 1000;

describe('calculateTotalPrice', () => {
  it('calculates a single-day total for one item', () => {
    // Single-day pricing is unit price multiplied by quantity.
    const total = calculateTotalPrice(
      [{ item_id: 'chair', quantity_requested: 3 }],
      { chair: 10 },
      new Date('2024-01-01T10:00:00Z'),
      new Date('2024-01-01T18:00:00Z'),
    );

    expect(total).toBe(30);
  });

  it('sums multiple items for a single-day reservation', () => {
    // Each item contributes its own price multiplied by its quantity.
    const total = calculateTotalPrice(
      [
        { item_id: 'chair', quantity_requested: 2 },
        { item_id: 'table', quantity_requested: 1 },
      ],
      { chair: 10, table: 25 },
      new Date('2024-01-01T10:00:00Z'),
      new Date('2024-01-01T18:00:00Z'),
    );

    expect(total).toBe(45);
  });

  it('uses single-day pricing for exactly 24 hours', () => {
    // The existing ceiling and > 1-day rule treats exactly 24 hours as one day.
    const total = calculateTotalPrice(
      [{ item_id: 'chair', quantity_requested: 3 }],
      { chair: 10 },
      new Date('2024-01-01T00:00:00Z'),
      new Date('2024-01-02T00:00:00Z'),
    );

    expect(total).toBe(30);
  });

  it('uses multi-day pricing for 24 hours plus one minute', () => {
    // A duration just over 24 hours rounds up to two days.
    const total = calculateTotalPrice(
      [{ item_id: 'chair', quantity_requested: 3 }],
      { chair: 10 },
      new Date('2024-01-01T00:00:00Z'),
      new Date('2024-01-02T00:01:00Z'),
    );

    expect(total).toBe(120);
  });

  it('calculates multi-day pricing for multiple items over three days', () => {
    // Every item uses price × 2 × number of days × quantity.
    const total = calculateTotalPrice(
      [
        { item_id: 'chair', quantity_requested: 2 },
        { item_id: 'table', quantity_requested: 1 },
      ],
      { chair: 10, table: 25 },
      new Date('2024-01-01T00:00:00Z'),
      new Date('2024-01-04T00:00:00Z'),
    );

    expect(total).toBe(270);
  });

  it('treats an item missing from the price map as price 0', () => {
    // Missing prices should not add anything to the total.
    const total = calculateTotalPrice(
      [{ item_id: 'unknown', quantity_requested: 4 }],
      {},
      new Date('2024-01-01T10:00:00Z'),
      new Date('2024-01-01T18:00:00Z'),
    );

    expect(total).toBe(0);
  });

  it('returns 0 for an empty items array', () => {
    // No requested items means there is nothing to charge.
    const total = calculateTotalPrice(
      [],
      {},
      new Date('2024-01-01T10:00:00Z'),
      new Date('2024-01-01T18:00:00Z'),
    );

    expect(total).toBe(0);
  });

  it('rounds the result to two decimal places', () => {
    // Rounding removes floating-point artifacts such as 0.1 + 0.2.
    const total = calculateTotalPrice(
      [
        { item_id: 'one', quantity_requested: 1 },
        { item_id: 'two', quantity_requested: 1 },
      ],
      { one: 0.1, two: 0.2 },
      new Date('2024-01-01T10:00:00Z'),
      new Date('2024-01-01T18:00:00Z'),
    );

    expect(total).toBe(0.3);
  });
});
