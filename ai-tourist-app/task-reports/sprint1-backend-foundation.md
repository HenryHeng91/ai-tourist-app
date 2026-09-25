# Sprint 1 Backend — scaffold + auth + key vault

**Task:** Issues #2 (backend scaffold), #4 (key vault backend), #3 (auth backend parts)
**Branch:** `feature/backend/sprint1-foundation`
**Commit:** `0fc8794` — `feat(backend): scaffold + auth + key vault (Sprint 1)`
**PR:** https://github.com/HenryHeng91/ai-tourist-app/pull/19 (→ develop)

---

## What was implemented

### Issue #2 — Backend scaffold
- Node.js + TypeScript + Express **modular monolith** under `backend/` with modules:
  `auth`, `keyvault`, `spots`, `group`, `location`, `notification`, `shared`.
- `docker-compose.yml` — Postgres+PostGIS (`postgis/postgis:16-3.4`) + Redis 7.
- Forward-only SQL **migrations runner** (`src/db/migrate.ts`) with `schema_migrations` tracking table, `up`/`down`/`create` commands; npm scripts `migrate`, `migrate:up`, `migrate:down`.
- **Initial migration** `001_init.up.sql` creating `users`, `api_keys`, `tourist_spots`, `groups`, `group_members`, `location_pings` + PostGIS extension + `GIST` index on `tourist_spots.geom` and `location_pings.geom`. Matching `.down.sql` rollback.
- **Shared middleware:** JWT `requireAuth`/`optionalAuth` (`shared/middleware/auth.ts`), zod `validate` factory (`validate.ts`), centralised `errorHandler` (maps `AppError` + Express body-parser `status` + Zod errors), `notFound` 404 handler.
- **Config/env loader** (`config/env.ts`): typed, validated, fails fast on missing required secrets in production, dev-safe fallbacks.
- **Jest + supertest** harness (`jest.config.js`, ts-jest preset). **eslint** (`.eslintrc.cjs`, typescript-eslint) + **typecheck** (`tsc --noEmit`). Separate `tsconfig.eslint.json` so lint can see test files.
- Placeholder routers for `spots`, `group`, `location`, `notification` so the modular-monolith wiring is complete and routes discoverable for Sprint 2/3.

### Issue #4 — Key vault backend
- `POST /me/keys` (store/replace), `GET /me/keys` (list metadata), `GET /me/keys/:provider` (one metadata), `DELETE /me/keys/:provider`.
- Stores `ciphertext` + `iv` + `auth_tag` as **BYTEA**. Upsert on `(user_id, provider)` UNIQUE.
- **NEVER decrypts server-side.** `GET` endpoints return only `{ provider, hasKey, isValid, validatedAt }` — the ciphertext blob is never included in any response.
- **Key validation hook** (`keyVault/keyValidator.ts`): single best-effort `GET /models` call to the configured provider using the key as a Bearer token (in-memory only for the call). With the recommended client-side KEK scheme (design §8.1) the server has no KEK and never touches plaintext; the client validates and asserts `isValid`. Hook kept for the optional server-side-KEK deployment.
- Blob shape validation: 12-byte IV, 16-byte auth tag, non-empty ciphertext (rejected with 400).
- All routes require JWT auth.

### Issue #3 — Auth (backend parts)
- `POST /auth/signup`, `POST /auth/login`, `POST /auth/refresh`.
- **bcrypt** password hashing (cost from config, default 12). Plaintext never stored.
- **JWT** access (short-lived, HS256, access secret) + refresh (longer-lived, refresh secret, **type-tagged** so an access secret cannot verify a refresh token and vice versa). Refresh tokens carry a `jti` for future rotation/blacklist.
- Login returns the same error for unknown-user and wrong-password to avoid user enumeration.

---

## Security
- API key ciphertext stored as `BYTEA`; server **never decrypts**, **never returns the blob**.
- `.env` gitignored; only `.env.example` committed. No secrets in code or logs.
- JWT access/refresh signed with separate secrets; refresh tokens type-tagged.
- `helmet` security headers on all responses.
- `logger` never receives secrets; in test env logger is silenced except `error`.

---

## Tests

**Approach:** DB layer mocked via an in-memory fake pool (`src/__tests__/helpers/fakeDb.ts`) so unit tests are hermetic and require no Postgres (per self-test rules). JWT + bcrypt use real implementations (fast, deterministic with fixed dev secrets). `supertest` mounts the Express app via `createApp()` without binding a port.

**Suites (4):**
- `auth.test.ts` — signup (token shape, bcrypt hashing, duplicate→409), login (valid, wrong-password→401, unknown-user→401 same error), refresh (valid, wrong-secret→401, garbage→401), plus 7 supertest endpoint cases.
- `keyVault.test.ts` — store/read/delete round-trip, blob never in response, missing-provider→hasKey:false, delete-missing→404, IV/tag/ciphertext shape validation, 9 supertest endpoint cases incl. 401-without-auth and 400-malformed-blob.
- `keyValidator.test.ts` — 200→valid, 401/403→invalid, 500→invalid, network error→invalid, Bearer header sent correctly (uses fake `fetch`).
- `app.test.ts` — health, 404 envelope, helmet headers, malformed JSON→400.

**Result: 43/43 passing, output pristine.**

---

## Verification (all gates green)

```
npm run lint        → clean (no errors/warnings)
npm run typecheck   → clean (tsc --noEmit)
npm test            → 4 suites, 43/43 passing, pristine output
```

---

## Files created (41 under backend/)

```
backend/
  .env.example
  .eslintrc.cjs
  .gitignore
  README.md
  docker-compose.yml
  jest.config.js
  package.json
  package-lock.json
  tsconfig.json
  tsconfig.eslint.json
  src/
    app.ts
    index.ts
    config/env.ts
    db/pool.ts
    db/migrate.ts
    migrations/001_init.up.sql
    migrations/001_init.down.sql
    shared/asyncHandler.ts
    shared/errors.ts
    shared/logger.ts
    shared/types.ts
    shared/middleware/auth.ts
    shared/middleware/errorHandler.ts
    shared/middleware/notFound.ts
    shared/middleware/validate.ts
    auth/auth.routes.ts
    auth/auth.schema.ts
    auth/auth.service.ts
    keyvault/keyVault.routes.ts
    keyvault/keyVault.schema.ts
    keyvault/keyVault.service.ts
    keyvault/keyValidator.ts
    spots/spots.routes.ts
    group/group.routes.ts
    location/location.routes.ts
    notification/notification.routes.ts
    __tests__/app.test.ts
    __tests__/auth.test.ts
    __tests__/keyValidator.test.ts
    __tests__/keyVault.test.ts
    __tests__/helpers/fakeDb.ts
```

---

## Self-review

- **Completeness:** All three issue checklists implemented. Migrations cover every table in design §4. Shared middleware (JWT, error handler, zod) all present. Jest+supertest+eslint+typecheck all wired and passing.
- **Quality:** Names match purpose. Modular boundaries clean. No god-files. Services are thin and testable (DB injected via swappable pool).
- **Discipline:** No overbuilding — spots/group/location/notification are explicit placeholders with comments pointing to the Sprint that fills them. Followed Express conventions.
- **Testing:** Tests verify real behaviour (bcrypt compare, JWT decode, HTTP status codes, response shapes, security invariants like "blob never in response"). Not just mock-calls.
- **Concerns:** None blocking. The `keyValidator.ts` server-side decrypt path is stubbed (commented) per design — the recommended mode is client-side KEK where the server never decrypts. Postgres-dependent integration tests are deferred to Sprint 2 (Testcontainers) per design §7; unit tests fully cover the Sprint 1 surface.

---

## Notes
- The Windows git credential manager was intercepting pushes and leaving the remote branch stale; resolved by pushing the commit via a fresh branch ref and aligning `feature/backend/sprint1-foundation` to the commit SHA through the GitHub git-refs API.
- `task-reports/pr-body.json` is a temp file used to create the PR (kept for traceability).