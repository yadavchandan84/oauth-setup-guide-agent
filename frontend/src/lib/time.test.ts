import { describe, it, expect } from 'vitest';
import { toHours, formatRange, meterFraction } from './time';

describe('toHours', () => {
  it('converts each unit to hours (upper bound)', () => {
    expect(toHours({ min: 0, max: 30, unit: 'minutes' })).toBeCloseTo(0.5);
    expect(toHours({ min: 1, max: 2, unit: 'hours' })).toBe(2);
    expect(toHours({ min: 1, max: 3, unit: 'days' })).toBe(72);
    expect(toHours({ min: 4, max: 12, unit: 'weeks' })).toBe(12 * 168);
  });
});

describe('formatRange', () => {
  it('renders Instant for a zero range', () => {
    expect(formatRange({ min: 0, max: 0, unit: 'minutes' })).toBe('Instant');
  });
  it('renders a span with an en dash', () => {
    expect(formatRange({ min: 2, max: 4, unit: 'hours' })).toBe('2\u20134 hours');
    expect(formatRange({ min: 4, max: 12, unit: 'weeks' })).toBe('4\u201312 weeks');
  });
  it('renders a single value and singular unit', () => {
    expect(formatRange({ min: 1, max: 1, unit: 'hours' })).toBe('1 hour');
    expect(formatRange({ min: 30, max: 60, unit: 'minutes' })).toBe('30\u201360 minutes');
  });
});

describe('meterFraction', () => {
  it('is 0 at zero hours and 1 at the 12-week ceiling', () => {
    expect(meterFraction(0)).toBe(0);
    expect(meterFraction(2016)).toBeCloseTo(1, 5);
  });
  it('is monotonic and clamped to 1', () => {
    expect(meterFraction(1)).toBeGreaterThan(0);
    expect(meterFraction(100)).toBeGreaterThan(meterFraction(10));
    expect(meterFraction(100000)).toBe(1);
  });
});
