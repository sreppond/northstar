import { describe, expect, it } from 'vitest';
import { formatWithCommas, sanitizeDigits } from './fields';

describe('formatWithCommas', () => {
  it('leaves small numbers alone', () => {
    expect(formatWithCommas('80')).toBe('80');
  });

  it('groups thousands', () => {
    expect(formatWithCommas('80000')).toBe('80,000');
  });

  it('groups millions', () => {
    expect(formatWithCommas('1234567')).toBe('1,234,567');
  });

  it('keeps a trailing decimal point while the user is still typing after it', () => {
    expect(formatWithCommas('80000.')).toBe('80,000.');
  });

  it('formats the decimal portion without touching it', () => {
    expect(formatWithCommas('80000.5')).toBe('80,000.5');
  });

  it('preserves a leading minus sign', () => {
    expect(formatWithCommas('-1500')).toBe('-1,500');
  });
});

describe('sanitizeDigits', () => {
  it('strips commas and a leading dollar sign', () => {
    expect(sanitizeDigits('$80,000')).toBe('80000');
  });

  it('keeps a single decimal point', () => {
    expect(sanitizeDigits('80,000.5')).toBe('80000.5');
  });

  it('drops a second decimal point rather than keeping garbage', () => {
    expect(sanitizeDigits('80.00.5')).toBe('80.005');
  });

  it('preserves a lone leading minus', () => {
    expect(sanitizeDigits('-80,000')).toBe('-80000');
  });
});
