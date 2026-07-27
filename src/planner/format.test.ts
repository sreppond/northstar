import { describe, expect, it } from 'vitest';
import { ZERO_DASH, signedTableMoney, tableMoney } from './format';

describe('tableMoney', () => {
  it('dashes a true zero', () => {
    expect(tableMoney(0)).toBe(ZERO_DASH);
  });

  it('dashes a rounding residue, so it reads the same as a real zero', () => {
    expect(tableMoney(12)).toBe(ZERO_DASH);
    expect(tableMoney(-49.99)).toBe(ZERO_DASH);
  });

  it('shows sub-$1K exactly, since there is nothing to compact', () => {
    expect(tableMoney(50)).toBe('$50');
    expect(tableMoney(940)).toBe('$940');
  });

  it('drops the decimal on thousands', () => {
    expect(tableMoney(237_458)).toBe('$237K');
    expect(tableMoney(345_400)).toBe('$345K');
    expect(tableMoney(12_000)).toBe('$12K');
  });

  it('rounds thousands rather than truncating', () => {
    expect(tableMoney(237_500)).toBe('$238K');
    expect(tableMoney(1_499)).toBe('$1K');
    expect(tableMoney(1_500)).toBe('$2K');
  });

  it('rolls up instead of printing a four-digit K', () => {
    // 999,500 / 1000 rounds to 1000, which must not render as "$1000K".
    expect(tableMoney(999_500)).toBe('$1.00M');
    expect(tableMoney(999_499)).toBe('$999K');
  });

  it('keeps two decimals on millions so adjacent years stay distinct', () => {
    expect(tableMoney(1_090_000)).toBe('$1.09M');
    expect(tableMoney(1_140_000)).toBe('$1.14M');
    expect(tableMoney(4_340_000)).toBe('$4.34M');
  });

  it('carries the sign for liabilities', () => {
    expect(tableMoney(-920_000)).toBe('-$920K');
    expect(tableMoney(-1_150_000)).toBe('-$1.15M');
  });
});

describe('signedTableMoney', () => {
  it('marks a surplus explicitly', () => {
    expect(signedTableMoney(42_000)).toBe('+$42K');
  });

  it('leaves the minus to carry a deficit', () => {
    expect(signedTableMoney(-42_000)).toBe('-$42K');
  });

  it('dashes a nil year rather than printing "+$0"', () => {
    expect(signedTableMoney(0)).toBe(ZERO_DASH);
    expect(signedTableMoney(20)).toBe(ZERO_DASH);
  });
});
