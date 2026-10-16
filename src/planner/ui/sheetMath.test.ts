import { describe, expect, it } from 'vitest';
import { project, releaseVelocity, resistedOffset, rubberband, shouldDismiss } from './sheetMath';

describe('project', () => {
  it('matches the exponential-decay form, not v^2/2a', () => {
    // 1000 px/s at 0.998 coasts v/1000 * d/(1-d) = 499px.
    expect(project(1000)).toBeCloseTo(499, 5);
    expect(project(-1000)).toBeCloseTo(-499, 5);
    expect(project(0)).toBe(0);
  });
});

describe('rubberband', () => {
  it('is sign-preserving, monotonic and always less than the pull', () => {
    expect(rubberband(0, 600)).toBe(0);
    expect(rubberband(100, 600)).toBeGreaterThan(0);
    expect(rubberband(100, 600)).toBeLessThan(100);
    expect(rubberband(-100, 600)).toBeCloseTo(-rubberband(100, 600), 10);
    expect(rubberband(400, 600)).toBeGreaterThan(rubberband(100, 600));
  });

  it('approaches but never reaches the surface size, however far you pull', () => {
    expect(rubberband(1e6, 600)).toBeLessThan(600);
    expect(rubberband(1e6, 600)).toBeGreaterThan(590);
  });
});

describe('resistedOffset', () => {
  it('tracks 1:1 toward closed and resists past the open edge', () => {
    expect(resistedOffset(120, 600)).toBe(120);
    expect(resistedOffset(0, 600)).toBe(0);
    const pulled = resistedOffset(-100, 600);
    expect(pulled).toBeLessThan(0);
    expect(pulled).toBeGreaterThan(-100);
  });
});

describe('shouldDismiss', () => {
  it('snaps back from a slow drag that stopped short of halfway', () => {
    expect(shouldDismiss(200, 0, 600)).toBe(false);
  });
  it('closes a slow drag released past halfway', () => {
    expect(shouldDismiss(400, 0, 600)).toBe(true);
  });
  it('closes a short fast flick toward closed', () => {
    expect(shouldDismiss(60, 1500, 600)).toBe(true);
  });
  it('snaps back when thrown back toward open, even past halfway', () => {
    expect(shouldDismiss(400, -1500, 600)).toBe(false);
  });
});

describe('releaseVelocity', () => {
  it('measures px/s over the last 100ms', () => {
    const v = releaseVelocity(
      [
        { t: 0, p: 0 },
        { t: 50, p: 25 },
        { t: 100, p: 50 },
      ],
      104,
    );
    expect(v).toBeCloseTo(500, 5);
  });
  it('is zero after a pause or with too little history', () => {
    expect(
      releaseVelocity(
        [
          { t: 0, p: 0 },
          { t: 40, p: 40 },
        ],
        300,
      ),
    ).toBe(0);
    expect(releaseVelocity([{ t: 0, p: 0 }], 10)).toBe(0);
    expect(releaseVelocity([], 10)).toBe(0);
  });
});
