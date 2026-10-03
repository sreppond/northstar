/**
 * A Node ESM resolve hook that lets `monarch-sync.mjs` import
 * `@northstar/engine`'s TypeScript source directly, with no build step and
 * no new dependency (Node 25 strips TypeScript types natively).
 *
 * The engine package writes its own relative imports with a `.js` specifier
 * even though the file on disk is `.ts` — the NodeNext convention, since
 * `tsc` would eventually emit `foo.js` from `foo.ts`, so the source already
 * points at the name its own future output will have. Vite and vitest both
 * know to follow that convention when they resolve it for the app and its
 * tests; a plain `node` process does not, and reports the `.js` file as
 * missing. This hook is the one-line fix, and it is the ONLY reason this
 * file exists: if resolving a specifier fails and it ends in `.js`, retry
 * the identical specifier with `.ts` before giving up.
 *
 * It changes nothing about how the app, its build, or its tests resolve
 * modules — it only ever runs inside the separate `node` process this
 * script starts, registered on itself (see the top of monarch-sync.mjs).
 */
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (specifier.endsWith('.js')) {
      try {
        return await nextResolve(`${specifier.slice(0, -3)}.ts`, context);
      } catch {
        // Fall through — the ORIGINAL error names the file that's actually
        // missing, which is the more useful one to surface.
      }
    }
    throw err;
  }
}
