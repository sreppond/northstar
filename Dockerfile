# Northstar, as one container: the built SPA served by the API that holds its
# data. One origin is what lets the session be an httpOnly SameSite=Strict
# cookie with no CORS and no token sitting in reachable storage.

# --- build ------------------------------------------------------------------
FROM node:22-slim AS build

WORKDIR /app

# better-sqlite3 compiles from source when no prebuild matches the platform.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/server/package.json packages/server/
RUN npm ci

COPY . .
# Produces dist/ (the SPA) and packages/server/dist/server.mjs (the API).
RUN npm run build

# --- runtime ----------------------------------------------------------------
FROM node:22-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# The server bundle inlines the engine and every pure-JS dependency, so the
# only thing that must exist on disk at runtime is the native addon. Installing
# it alone — rather than replaying the workspace install — keeps the runtime
# image free of the whole build tree.
RUN npm install --omit=dev better-sqlite3@^11.8.1 && npm cache clean --force

COPY --from=build /app/packages/server/dist/server.mjs ./server.mjs
COPY --from=build /app/dist ./dist

# The database is a mounted volume; everything else in here is disposable.
RUN mkdir -p /data && chown -R node:node /data /app
USER node

ENV NORTHSTAR_DB=/data/northstar.db
ENV NORTHSTAR_STATIC_DIR=/app/dist
ENV PORT=4000
# Bind all interfaces INSIDE the container. Compose publishes to 127.0.0.1
# only, so the exposure boundary is the port mapping, not this.
ENV HOST=0.0.0.0

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
