import { defineConfig } from 'vitest/config';

export default defineConfig({
  // `scripts/**` added for `monarch-summary.test.ts` (docs/W3-REVIEW.md
  // "Monarch-sync reporting a credit card as an asset") — a pure helper
  // pulled out of `monarch-sync.mjs` specifically so it is unit-testable;
  // `monarch-sync.mjs` itself is excluded by only matching `*.test.ts`,
  // since importing it runs `main()` (launches Chrome) unconditionally.
  test: { include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'] },
});
