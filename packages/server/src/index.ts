/**
 * Entry point.
 *
 * Serves the built SPA and the API from one origin, which is what lets the
 * session be an httpOnly SameSite=Strict cookie with no CORS and no token in
 * reachable storage.
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import { buildApp, registerCookies } from './app.ts';
import { ConfigError, loadConfig } from './config.ts';

const here = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error(`\nConfiguration error:\n\n${e.message}\n`);
      process.exit(1);
    }
    throw e;
  }

  const app = buildApp({ config, logger: true });
  await registerCookies(app);

  const staticDir = config.staticDir ?? resolve(here, '../../../dist');
  if (existsSync(staticDir)) {
    await app.register(fastifyStatic, { root: staticDir });

    // SPA fallback. Anything that is not an API route and was not a real file
    // is a client-side route, so it gets index.html.
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.status(404).send({ error: 'Not found.' });
      }
      return reply.sendFile('index.html');
    });
  } else {
    app.log.warn(
      `No built frontend at ${staticDir}. Run "npm run build" to serve the app from this server.`,
    );
  }

  // Expired sessions are dead weight and a small liability. Sweeping hourly
  // keeps the table from growing without bound on a server that runs for
  // months; `unref` so it never holds the process open on its own.
  const sweep = setInterval(() => {
    const purged = app.services.sessions.purgeExpired();
    if (purged) app.log.info(`purged ${purged} expired session(s)`);
  }, 3_600_000);
  sweep.unref();

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      app.log.info('shutting down');
      void app.close().then(() => process.exit(0));
    });
  }

  await app.listen({ port: config.port, host: config.host });
  app.log.info(`Northstar on http://${config.host}:${config.port}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
