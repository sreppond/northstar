# The Northstar server

A single-user backend that holds your plans and your Monarch balances, and can
pull fresh balances on demand. It is designed to run on hardware you own.

## Why it exists

The paste-based import ([`MONARCH-IMPORT.md`](./MONARCH-IMPORT.md)) works, but it
cannot answer the question that actually matters day to day: *are these numbers
still true?* Nothing in a static bundle knows when the balances were captured,
and nothing can go and get new ones. That needs somewhere to keep state and
something able to make an outbound call. Hence a server.

## Running it

```bash
cp .env.example .env
npm run generate-key          # paste the output into .env
docker compose up -d          # → http://127.0.0.1:4000
```

Or without Docker:

```bash
npm install
npm run build                 # builds the SPA and bundles the server
NORTHSTAR_ENCRYPTION_KEY=$(npm run generate-key --silent) npm run server
```

The first page load asks you to set a password. There is no registration and no
second account — `app_user` is a one-row table with a `CHECK (id = 1)`.

### Configuration

| Variable | Default | Notes |
|---|---|---|
| `NORTHSTAR_ENCRYPTION_KEY` | *required* | 32 bytes, base64. Seals the Monarch session. |
| `NORTHSTAR_DB` | `./data/northstar.db` | SQLite file. |
| `PORT` / `HOST` | `4000` / `127.0.0.1` | Loopback by default, deliberately. |
| `NORTHSTAR_SECURE_COOKIES` | `false` | Set `true` **only** behind real HTTPS. |
| `NORTHSTAR_STALENESS_DAYS` | `7` | How old balances get before the app nags. |
| `NORTHSTAR_SESSION_TTL_HOURS` | `336` | Sliding — every request pushes it out. |

**`NORTHSTAR_ENCRYPTION_KEY` is not regenerable.** Change it and the stored
Monarch session can no longer be decrypted; the app will ask you to reconnect and
nothing else is lost, but there is no reason to ever change it. It is required
rather than auto-generated precisely so this cannot happen silently on a restart.

## The security model, stated plainly

The threat this design takes seriously: **a stored Monarch session is read
access to every account you own.** Everything below follows from that.

- **Loopback by default.** `HOST` is `127.0.0.1` and compose publishes to
  `127.0.0.1:4000`. The first-run setup route is claimable by whoever reaches it
  first, so a server bound to `0.0.0.0` on an untrusted network is a real
  problem. Reach it from elsewhere over Tailscale or an SSH tunnel, not by
  widening the bind.
- **The Monarch session is sealed at rest** with AES-256-GCM. The key lives in
  the environment, never in the database, so the database file alone is not
  enough. GCM rather than CBC because it authenticates — a tampered ciphertext
  fails to open instead of decrypting into something that then gets sent to
  Monarch as a cookie.
- **It never comes back to the browser.** The page posts it once, and from then
  on only ever sees status: connected, when, and whether Monarch has rejected it.
- **Passwords are scrypt-hashed** (N=2¹⁶) with a per-password salt. Argon2id
  would be marginally better and needs a native build step; a personal tool that
  fails `npm install` on a fresh machine is a tool that does not get run.
- **Session tokens are stored as SHA-256 hashes**, so a stolen database does not
  hand over live sessions.
- **Session cookies are `httpOnly` + `SameSite=Strict`**, and `Secure` when
  `NORTHSTAR_SECURE_COOKIES=true`. It is off by default because a `Secure` cookie
  over plain-HTTP localhost is silently dropped, and the symptom is a login that
  never sticks.
- **Mutations carry a double-submit CSRF token.** `SameSite=Strict` should
  already stop the cross-site post; this is the second lock, because the first
  one is a browser default away from being gone.
- **Login is throttled** to 10 attempts per 15 minutes, in memory. Combined with
  the scrypt cost, online guessing is not the way in.
- **Errors are filtered.** A 500 says "Something went wrong on the server" and
  nothing else — stack traces and SQLite messages name paths and column layouts.
- **Changing the password destroys every other session**, which is most of the
  point of changing it.

What this does **not** protect against: anyone with root on the box, or with
both the database file and the environment. For a machine you own and control,
that is the right place to stop.

## How refresh works

1. The app asks `GET /api/monarch/status` on load. That is the "has it been a
   while" check — the threshold lives on the server so it cannot drift out of
   step with a copy in the client.
2. Past the threshold, the banner offers a refresh.
3. `POST /api/monarch/refresh` decrypts the session, queries Monarch, stores a
   new snapshot, and returns it **with a preview of what importing would
   change**.
4. The app opens the same diff the paste flow shows. **Nothing is written to
   your plan until you confirm.**
5. If Monarch rejects the session, it is flagged invalid and the app routes you
   to reconnect rather than showing an error you cannot act on.

### Going direct beats the MCP tool

The server talks to `api.monarch.com/graphql` itself rather than through
`monarch-mcp-server`, and gets strictly more back. The real `GetAccounts` query
returns `subtype`, `interestRate`, `apr`, `minimumPayment` and `plannedPayment`;
the MCP tool drops all of them when it reshapes the response.

`subtype` is the one that matters. It is the only field separating a 401(k) from
a Roth from a taxable brokerage — the distinction the engine's whole tax model
turns on — so the live path classifies accounts automatically where the paste
path has to stop and ask. The rate fields fill in the `linked*` provenance on
`Account`, which `PLAN.md` §9 Phase 3 expected to need Plaid for.

There is no login flow because there does not need to be one. Monarch gates
programmatic logins behind Cloudflare and layers email OTP, TOTP and a
device-uuid handshake on top; a browser session sidesteps all of it. The cost is
that the session expires with your browser login, which is why
`MonarchSessionExpired` is a distinct error the UI routes on.

**Monarch's API is private and unversioned.** `packages/server/src/monarch/queries.ts`
is the file most likely to rot. If refreshes start failing with a schema error,
recapture the query from DevTools and update it there — nothing else moves. The
paste path is the fallback that works regardless, which is reason enough to keep
it.

## Data

| Table | Holds |
|---|---|
| `app_user` | One row. The password hash. |
| `session` | Hashed session tokens, sliding expiry. |
| `monarch_credential` | One row. The sealed Monarch session. |
| `plan` | Scenarios, as JSON documents. |
| `snapshot` | Every capture, forever. |

Snapshots are never pruned. They are a few kB each and they are the only record
of what was actually true on a given day — the raw material for charting real
net worth against the projection. `GET /api/monarch/history` already returns it.

### Plans, and where they live

localStorage stays the primary write: it is synchronous, it cannot fail, and it
is what keeps the app working with no backend at all. The server is a durable
copy written just behind it, debounced by 500ms.

The sync is a whole-set replace, not a diff — so a dropped request costs nothing,
because the next edit resends everything. There is no queue to drain and no
conflict to resolve. On sign-in, whichever side has plans wins, with the server
preferred; that is the one-time migration off localStorage and it needs no
prompt, since an empty server cannot be the more correct of the two.

`PUT /api/plans` refuses an empty array. The client sends its full list on every
change, so an empty one almost always means the client lost state rather than
that you deleted everything — and honouring it would wipe every scenario.

## API

All routes require a session except `status`, `setup` and `login`. Mutations
require the CSRF header.

```
GET    /api/auth/status         configured? authenticated?
POST   /api/auth/setup          first run only; 409 afterwards
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/password       revokes all other sessions

GET    /api/monarch/status      connected, ageDays, stale, needsReconnect
POST   /api/monarch/connect     verifies against Monarch before storing
POST   /api/monarch/disconnect  deletes the session; snapshots stay
POST   /api/monarch/refresh     live fetch → snapshot + import preview
POST   /api/monarch/paste       the fallback path
GET    /api/monarch/latest
GET    /api/monarch/history     captured date + net worth, oldest first

GET    /api/plans
PUT    /api/plans               whole-set replace
DELETE /api/plans/:id           refuses the last one
```

## Deviations from PLAN.md §9 Phase 2

That section specified Postgres, tRPC and Auth.js. For one user on one machine
those are the wrong shape, and the deviations are deliberate:

- **SQLite, not Postgres.** One file, no daemon, no connection pool. The plan is
  still a JSON document with a version integer, exactly as §9 says.
- **Typed REST, not tRPC.** Eleven routes. tRPC's codegen and router are worth it
  across a team and a large surface; here they would be ceremony.
- **Hand-rolled auth, not Auth.js.** Auth.js exists to federate providers and
  manage many users. There is one user and one password.
- **Monarch, not Plaid.** §9 Phase 3 wanted Plaid for real balances. Monarch is
  already aggregating those accounts, and going direct gets the rate data Phase 3
  wanted, without a second data provider.

## Testing

```bash
npm test                # frontend + engine + server, 226 tests
npm run lint            # typecheck all three packages
```

The server tests run the real Fastify stack over `inject`, with a cookie jar, so
sessions, CSRF and the guards are exercised as a browser would hit them. Monarch
itself is stubbed via an injected `fetch` — no test reaches the network.
