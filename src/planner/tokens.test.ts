import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * V5-REVIEW-2 N3. The app has two dark themes that must be one: the OS media
 * query (`system` setting) and the explicit toggle (`data-theme='dark'`). They
 * drifted once (the toggle kept the old pastel palette and no --inverse), so
 * this reads planner.css as text and asserts the two blocks declare the same
 * custom properties with the same values.
 */
const css = readFileSync(resolve(__dirname, 'planner.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The body of the first `{ ... }` block opened by `selector`, from `from`. */
function blockBody(selector: string, from = 0): string {
  const start = css.indexOf(selector, from);
  expect(start, `${selector} not found in planner.css`).toBeGreaterThanOrEqual(0);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`unterminated block for ${selector}`);
}

/** `--name: value` pairs, in a Map (so a duplicate declaration keeps the last, as CSS does). */
function tokens(body: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) map.set(m[1], m[2].replace(/\s+/g, ' ').trim());
  return map;
}

const mediaStart = css.indexOf('@media (prefers-color-scheme: dark)');
const osDark = tokens(blockBody(":root:not([data-theme='light'])", mediaStart));
const toggleDark = tokens(blockBody(":root[data-theme='dark']"));
const light = tokens(blockBody(':root {'));

describe('dark theme tokens (V5-REVIEW-2 N3)', () => {
  it('finds both dark blocks', () => {
    expect(osDark.size).toBeGreaterThan(40);
    expect(toggleDark.size).toBeGreaterThan(40);
  });

  it('the toggle block and the OS media block declare identical custom properties', () => {
    expect(Object.fromEntries(toggleDark)).toEqual(Object.fromEntries(osDark));
  });

  it('both dark blocks restate the tokens that fall back to light values otherwise', () => {
    for (const name of ['--inverse', '--on-inverse', '--danger-btn', '--glow-1', '--glow-2']) {
      expect(osDark.has(name), `OS dark lacks ${name}`).toBe(true);
      expect(toggleDark.has(name), `toggle dark lacks ${name}`).toBe(true);
    }
  });

  it('every token the dark themes override exists in the light theme (no orphan names)', () => {
    for (const name of osDark.keys()) expect(light.has(name), `${name} is dark-only`).toBe(true);
  });
});
