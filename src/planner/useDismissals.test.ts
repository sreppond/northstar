import { describe, expect, it } from 'vitest';
import {
  createDismissalStore,
  dismissalKey,
  parseDismissed,
  serializeDismissed,
  withoutAlert,
} from './useDismissals';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => void (data[k] = v),
    removeItem: (k: string) => void delete data[k],
  };
}

const throwing = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

describe('pure helpers', () => {
  it('keys on id and signature', () => {
    expect(dismissalKey('runs-dry', '2071:1370000')).toBe('runs-dry:2071:1370000');
  });

  it('parses tolerantly', () => {
    expect([...parseDismissed('["a:1","b:2"]')]).toEqual(['a:1', 'b:2']);
    expect(parseDismissed(null).size).toBe(0);
    expect(parseDismissed('{not json').size).toBe(0);
    expect(parseDismissed('{"a":1}').size).toBe(0);
    expect([...parseDismissed('["ok", 3, null]')]).toEqual(['ok']);
  });

  it('serializes sorted, so the stored value is stable', () => {
    expect(serializeDismissed(new Set(['b:1', 'a:1']))).toBe('["a:1","b:1"]');
  });

  it('removes every signature of one id, or everything', () => {
    const s = new Set(['a:1', 'a:2', 'ab:1', 'b:1']);
    expect([...withoutAlert(s, 'a')].sort()).toEqual(['ab:1', 'b:1']);
    expect(withoutAlert(s).size).toBe(0);
  });
});

describe('dismissal store', () => {
  it('hides only the exact signature and brings it back when it changes', () => {
    const store = createDismissalStore(() => fakeStorage());
    store.dismiss('p1', 'runs-dry', '2071:1370000');
    const set = store.get('p1');
    expect(set.has(dismissalKey('runs-dry', '2071:1370000'))).toBe(true);
    // The plan moved the year: a different signature is a different problem.
    expect(set.has(dismissalKey('runs-dry', '2068:900000'))).toBe(false);
  });

  it('persists per plan under ns-dismissed:<planId> and reloads it', () => {
    const storage = fakeStorage();
    const a = createDismissalStore(() => storage);
    a.dismiss('p1', 'x', 's');
    expect(JSON.parse(storage.data['ns-dismissed:p1'])).toEqual(['x:s']);
    expect(storage.data['ns-dismissed:p2']).toBeUndefined();

    const b = createDismissalStore(() => storage); // a fresh session
    expect(b.get('p1').has('x:s')).toBe(true);
    expect(b.get('p2').size).toBe(0);
  });

  it('restores one id or everything, and clears storage when empty', () => {
    const storage = fakeStorage();
    const store = createDismissalStore(() => storage);
    store.dismiss('p', 'a', '1');
    store.dismiss('p', 'b', '1');
    store.restore('p', 'a');
    expect([...store.get('p')]).toEqual(['b:1']);
    store.restore('p');
    expect(store.get('p').size).toBe(0);
    expect(storage.data['ns-dismissed:p']).toBeUndefined();
  });

  it('notifies subscribers, and hands out a new set only on change', () => {
    const store = createDismissalStore(() => fakeStorage());
    let calls = 0;
    const off = store.subscribe('p', () => calls++);
    const before = store.get('p');
    store.dismiss('p', 'a', '1');
    expect(calls).toBe(1);
    expect(store.get('p')).not.toBe(before);
    const after = store.get('p');
    store.dismiss('p', 'a', '1'); // already hidden: no churn
    expect(calls).toBe(1);
    expect(store.get('p')).toBe(after);
    off();
    store.restore('p');
    expect(calls).toBe(1);
  });

  it('still works for the session when storage throws', () => {
    const store = createDismissalStore(() => throwing);
    expect(store.get('p').size).toBe(0);
    expect(() => store.dismiss('p', 'a', '1')).not.toThrow();
    expect(store.get('p').has('a:1')).toBe(true);
    expect(() => store.restore('p')).not.toThrow();
    expect(store.get('p').size).toBe(0);
  });

  it('works when there is no storage at all', () => {
    const store = createDismissalStore(() => undefined);
    store.dismiss('p', 'a', '1');
    expect(store.get('p').size).toBe(1);
  });
});
