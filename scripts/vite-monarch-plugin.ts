import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import { snapshotsDir } from './monarch-paths.mjs';

/**
 * Dev-only discovery of local Monarch snapshots (docs/ROADMAP-10.md Track B).
 *
 * `scripts/monarch-sync.mjs` writes snapshots to disk, outside the app
 * entirely. The packaged desktop app reads them back through Tauri commands
 * (`src-tauri/src/lib.rs`'s `monarch_latest_snapshot` / `monarch_list_snapshots`).
 * A plain browser tab running against `vite dev` has no Tauri bridge, so this
 * plugin exposes the same two lookups as dev-server routes instead —
 * `src/planner/monarchLocal.ts` is the one place that decides which of the two
 * to call.
 *
 * `apply: 'serve'` keeps this out of `vite build` entirely: there is no
 * server in the shipped static bundle to expose a route on, and the routes
 * read straight off this machine's disk, which a GitHub Pages build has no
 * business doing.
 */
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * `npm run dev` binds Vite to `0.0.0.0` so the app is reachable from an iOS
 * Simulator / a phone on the LAN during manual testing. That also means
 * these two routes — which read Monarch snapshots straight off this
 * machine's disk — would otherwise answer requests from anyone else on the
 * same Wi-Fi. Reject anything whose socket address isn't loopback instead of
 * narrowing the dev server's own host binding.
 */
function isLoopbackRequest(req: { socket: { remoteAddress?: string | null } }): boolean {
  return LOOPBACK_ADDRESSES.has(req.socket.remoteAddress ?? '');
}

export function monarchDevPlugin(): Plugin {
  return {
    name: 'northstar-monarch-local',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__local/monarch/latest', (req, res) => {
        if (!isLoopbackRequest(req)) {
          res.statusCode = 403;
          res.end('Forbidden');
          return;
        }

        const file = path.join(snapshotsDir(), 'latest.json');
        res.setHeader('Content-Type', 'application/json');
        try {
          res.end(readFileSync(file, 'utf8'));
        } catch {
          // No snapshot yet is a normal, expected state (e.g. before the
          // first `monarch:sync`) — answer quietly instead of logging a 404
          // in the console on every load and window focus.
          res.statusCode = 204;
          res.end();
        }
      });

      server.middlewares.use('/__local/monarch/list', (req, res) => {
        if (!isLoopbackRequest(req)) {
          res.statusCode = 403;
          res.end('Forbidden');
          return;
        }

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(listSnapshotFiles()));
      });
    },
  };
}

function listSnapshotFiles(): { file: string; capturedAt: string }[] {
  const dir = snapshotsDir();
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }

  return names
    .filter((name) => name.endsWith('.json') && name !== 'latest.json')
    .map((name) => ({ file: name, capturedAt: capturedAtOf(dir, name) }))
    .sort((a, b) => b.file.localeCompare(a.file));
}

function capturedAtOf(dir: string, name: string): string {
  try {
    const parsed = JSON.parse(readFileSync(path.join(dir, name), 'utf8')) as { capturedAt?: string };
    return parsed.capturedAt ?? '';
  } catch {
    // A file that doesn't parse just reports no date; it still shows up in
    // the list rather than silently disappearing.
    return '';
  }
}
