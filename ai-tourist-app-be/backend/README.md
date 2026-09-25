# AI Travel Guide — Backend

Node.js + TypeScript + Express modular monolith for the AI Travel Guide app.
See `../specs/2026-09-22-ai-travel-guide/design.md` for the architecture.

## Layout

```
src/
  config/         env loader (validated, typed)
  db/             pg pool + migrations runner
  migrations/     forward-only SQL (001_init + 002_poi_columns + 003_push_subscription)
  shared/         middleware (JWT auth, zod validate, error handler, CORS),
                  errors, logger, types, asyncHandler
  auth/           POST /auth/register | /login | /refresh  (bcrypt + JWT)
  keyvault/       POST/GET/DELETE /me/keys  (ciphertext blob; NEVER decrypt)
  spots/          GET /spots (PostGIS ST_DWithin), POST /spots (seed),
                  POI client (Google Places v1 + Wikidata fallback)
  group/          placeholder (Sprint 3)
  location/       placeholder (Sprint 3 — WS hub)
  notification/   placeholder (Sprint 3 — Web Push)
  __tests__/      Jest + supertest unit tests (DB mocked)
```

## Quick start

```bash
cp .env.example .env
docker compose up -d          # Postgres+PostGIS + Redis
npm install
npm run migrate              # apply migrations
npm run dev                  # http://localhost:4000
```

## Scripts

| script | what |
|--------|------|
| `npm run dev` | ts-node dev server |
| `npm run build` | tsc → dist/ |
| `npm test` | Jest + supertest (DB mocked, no Postgres needed) |
| `npm run lint` | eslint |
| `npm run typecheck` | tsc --noEmit |
| `npm run migrate` | apply pending SQL migrations |

## Security

- API keys are stored as `BYTEA` ciphertext (`ciphertext` + `iv` + `auth_tag`).
  The server **never** decrypts and **never** returns the blob — `GET /me/keys`
  returns only `{ provider, hasKey, isValid, validatedAt }`.
- Passwords hashed with bcrypt (cost 12). JWT access (15m) + refresh (30d),
  type-tagged so an access secret cannot verify a refresh token.
- `.env` is gitignored; only `.env.example` is committed.

## Testing

Unit tests mock the DB layer (`src/__tests__/helpers/fakeDb.ts`) so no Postgres
is required. Run `npm test`. All 102 tests pass; `npm run lint` and
`npm run typecheck` are clean.

## CORS

`CORS_ALLOWED_ORIGINS` is a comma-separated allow-list. Examples:

- `https://app.vercel.app,https://staging.app.com`
- `*.example.com` (wildcard subdomains)

When the variable is unset in development, the API is permissive (any origin,
no credentials) so curl + Vercel preview URLs work out of the box. When unset
in production, the API denies by default (no `Access-Control-Allow-Origin`
header is emitted for disallowed origins).