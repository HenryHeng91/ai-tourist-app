# Code Review Report — PR #19 (backend, Sprint 1 foundation)

**Branch:** `feature/backend/sprint1-foundation` → `develop`
**Repo:** HenryHeng91/ai-tourist-app
**Reviewer:** code-reviewer-agent
**Date:** 2026-09-22
**Verdict:** CHANGES_REQUESTED
**GitHub review:** https://github.com/HenryHeng91/ai-tourist-app/pull/19#pullrequestreview-5275548575
*(Posted as COMMENT event — GitHub forbids REQUEST_CHANGES on your own PR; verdict is in the review body.)*

## Scope
41 backend files (+9,326 lines, excl. package-lock). Note: the branch also carries the frontend commit `c5109e4` (same as PR #18's only commit) — see Minor #2.

## Security ✅
- BYOK invariant solid: `api_keys.ciphertext/iv/auth_tag` BYTEA; server never decrypts in active path; GET `/me/keys` returns metadata only. Tests assert blob never returned. (NFR-SEC-1 / REQ-AUTH-4 / design §8.1)
- All SQL parameterized (`$1…$n`); no injection vectors.
- JWT secrets + KEK fail-fast in prod; dev fallbacks only in non-prod. `.env` gitignored; `.env.example` placeholders only. No real secrets in code.
- `helmet` + central error handler sanitises unexpected errors. No `console.log` of sensitive data.
- `keyValidator.ts` sends key only to provider; not wired into store path (client-side KEK recommended).

## Code quality ✅
- Clean modular-monolith layout; types proper, no excessive `any`; Zod validation; typed errors; asyncHandler.
- Migrations match design §4 (PostGIS, UNIQUE(user_id,provider), GIST indexes).
- Tests: 4 suites / 43 tests, all passing (DB mocked via fakeDb).

## Architecture alignment ⚠️
- Matches design (modular monolith, bounded contexts, BYOK, BYTEA) except the auth REST contract below.

## Findings

| # | Severity | File:Line | Finding |
|---|----------|-----------|---------|
| 1 | CRITICAL | auth.routes.ts:13 | Signup route `/signup` deviates from design §5.1 (`/auth/register`) and frontend PR #18. End-to-end signup 404s. Rename to `/register`. |
| 2 | CRITICAL | auth.service.ts:46 | Response `{ token, refreshToken }` but frontend reads `accessToken`. Login/signup parsing crashes at runtime. Align field name (recommend `accessToken`/`refreshToken`, make `refresh()` consistent). |
| 3 | MINOR | auth.routes.ts | `/auth/logout` missing (design §5.1). Frontend 404s; clears local session in `finally` so degraded not broken. Add no-op or defer explicitly. |
| 4 | MINOR | (branch) | PR scope overlap: contains frontend commit `c5109e4` = PR #18's only commit. Merge order matters. Drop frontend commit so each PR is independently mergeable. |
| 5 | NIT | keyValidator.ts:57 | Comment claims buffer is zeroed but finally is empty (acknowledged advisory). Trim comment. |
| 6 | NIT | docker-compose.yml:12 | `POSTGRES_PASSWORD: postgres` dev only; ensure prod overrides. |

## Verification
- `npm test`: 43/43 pass.
- semgrep not installed in env; security review manual (no secrets, no injection, no key logging).

## Sign-off
BLOCKED by findings #1 and #2 (auth contract). Approveable once fixed or a coordinated contract decision is documented.