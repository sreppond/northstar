import { afterEach, describe, expect, it, vi } from 'vitest';
import { backupPlans, fetchLatestSnapshot, listSnapshots } from './monarchLocal';

/**
 * These tests run in a plain Node/vitest environment, with no
 * `window.__TAURI_INTERNALS__` global — exactly like a production browser
 * build with no Tauri bridge. So every case here exercises the "browser dev
 * route" half of `monarchLocal.ts`; the Tauri `invoke` half has no runtime to
 * test against outside the packaged app and is a thin, symmetrical mirror of
 * this path (see `src-tauri/src/lib.rs`'s `monarch_latest_snapshot` /
 * `monarch_list_snapshots`, which serve the identical JSON this module reads
 * from the dev route).
 */

const VALID_SNAPSHOT = {
  capturedAt: '2026-09-25',
  accounts: [
    { id: '1', name: 'Checking', type: 'depository', balance: 1000, is_active: true, is_hidden: false },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchLatestSnapshot', () => {
  it('parses and returns a valid snapshot from the dev route', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(VALID_SNAPSHOT), { status: 200 })),
    );

    const snapshot = await fetchLatestSnapshot();
    expect(snapshot).toEqual(VALID_SNAPSHOT);
  });

  it('returns null on a 404 (no snapshot written yet)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'none' }), { status: 404 })),
    );

    expect(await fetchLatestSnapshot()).toBeNull();
  });

  it('returns null rather than throwing when the file is not valid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })));

    expect(await fetchLatestSnapshot()).toBeNull();
  });

  it('returns null rather than throwing when the JSON does not match the snapshot contract', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ accounts: 'not an array' }), { status: 200 })),
    );

    expect(await fetchLatestSnapshot()).toBeNull();
  });

  it('returns null when there is no dev server at all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );

    expect(await fetchLatestSnapshot()).toBeNull();
  });
});

describe('listSnapshots', () => {
  it('returns the dev route’s list', async () => {
    const list = [{ file: '2026-09-25.json', capturedAt: '2026-09-25' }];
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(list), { status: 200 })));

    expect(await listSnapshots()).toEqual(list);
  });

  it('returns an empty list when the route 404s or the body is malformed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('null', { status: 200 })));
    expect(await listSnapshots()).toEqual([]);

    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
    expect(await listSnapshots()).toEqual([]);
  });
});

describe('backupPlans', () => {
  it('is a no-op outside Tauri — it never calls fetch or throws', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(backupPlans([])).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
