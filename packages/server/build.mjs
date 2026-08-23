#!/usr/bin/env node
/**
 * Bundle the server to one ESM file.
 *
 * Two reasons this exists rather than running the TypeScript directly:
 *
 *  - The engine imports with `.js` specifiers that resolve to `.ts` sources.
 *    That is a bundler convention; Node's resolver takes them literally and
 *    cannot find the files.
 *  - Node's `--experimental-strip-types` also rejects constructor parameter
 *    properties and other erasable-but-not-strippable syntax.
 *
 * Bundling settles both, and leaves the runtime image with no TypeScript in it.
 * `better-sqlite3` stays external because it is a native addon.
 */
import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/server.mjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  // Native addon: cannot be bundled, must be required from node_modules.
  external: ['better-sqlite3'],
  // Fastify and its plugins reach for CJS interop that a naive ESM bundle
  // breaks; this shim restores require/__dirname inside the bundle.
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      "import { fileURLToPath as __fileURLToPath } from 'node:url';",
      "import { dirname as __pathDirname } from 'node:path';",
      'const require = __createRequire(import.meta.url);',
      'const __filename = __fileURLToPath(import.meta.url);',
      'const __dirname = __pathDirname(__filename);',
    ].join('\n'),
  },
});

console.log('built packages/server/dist/server.mjs');
