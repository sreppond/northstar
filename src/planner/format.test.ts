import { describe, expect, it } from 'vitest';
import { ZERO_DASH, money, percent, signedMoney, signedPercent, signedTableMoney, tableMoney, tablePercent } from './format';

describe('money', () => {
  it('shows sub-$1K exactly', () => {
    expect(money(0)).toBe('$0');
    expect(money(940)).toBe('$940');
  });

  it('drops a trailing ".0" (docs/ROADMAP-10.md C2)', () => {
    expect(money(12_000)).toBe('$12K');
    expect(money(230_000)).toBe('$230K');
  });

  it('keeps genuine precision up to 4 significant figures', () => {
    expect(money(204_500)).toBe('$204.5K');
    expect(money(1_850_000)).toBe('$1.85M');
    expect(money(4_050_000)).toBe('$4.05M');
  });

  it('carries a plain hyphen for a negative balance, not a delta', () => {
    expect(money(-230_000)).toBe('-$230K');
  });
});

describe('signedMoney', () => {
  it('marks a gain with "+" and a loss with a real minus sign', () => {
    expect(signedMoney(3_850_000)).toBe('+$3.85M');
    expect(signedMoney(-3_850_000)).toBe('−$3.85M');
  });

  it('reads as a plain "$0" near zero, with no sign', () => {
    expect(signedMoney(0)).toBe('$0');
    expect(signedMoney(20)).toBe('$0');
  });
});

describe('percent', () => {
  it('drops a trailing ".0" (docs/ROADMAP-10.md C2: never "40.0%")', () => {
    expect(percent(40)).toBe('40%');
    expect(percent(32.8)).toBe('32.8%');
  });

  it('never shows more than one decimal by default', () => {
    expect(percent(32.849)).toBe('32.8%');
  });
});

describe('tablePercent', () => {
  it('always shows the fixed decimal count, trailing zero included — unlike percent() (docs/W3-REVIEW.md "One precision per table column")', () => {
    expect(tablePercent(40)).toBe('40.0%');
    expect(tablePercent(32.8)).toBe('32.8%');
    expect(tablePercent(14)).toBe('14.0%');
  });

  it('rounds to the given digit count the same way percent() does', () => {
    expect(tablePercent(32.849)).toBe('32.8%');
    expect(tablePercent(32.849, 2)).toBe('32.85%');
  });
});

describe('signedPercent', () => {
  it('marks a gain with "+" and a loss with a real minus sign', () => {
    expect(signedPercent(5)).toBe('+5%');
    expect(signedPercent(-5)).toBe('−5%');
  });

  it('reads as a plain "0%" once rounding lands on zero', () => {
    expect(signedPercent(0.02)).toBe('0%');
  });
});

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

  it('carries a real minus sign for a deficit (docs/ROADMAP-10.md C2)', () => {
    expect(signedTableMoney(-42_000)).toBe('−$42K');
  });

  it('dashes a nil year rather than printing "+$0"', () => {
    expect(signedTableMoney(0)).toBe(ZERO_DASH);
    expect(signedTableMoney(20)).toBe(ZERO_DASH);
  });
});
