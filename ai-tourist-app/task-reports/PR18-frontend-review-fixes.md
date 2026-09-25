# PR #18 Frontend Review Fixes — Report

**Branch:** `feature/frontend/sprint1-foundation`
**Commit:** `b13d11e` — `fix(frontend): align auth model fields + port 4000 + TLS note`
**PR:** #18

## What I implemented

Fixed all 4 review findings on PR #18:

### 1. CRITICAL — auth model field consistency (`accessToken`/`refreshToken`)
- **Root cause:** `AuthSession.fromJson` read `json['accessToken']` but `AuthService.refresh()` read `response.data['token']` — inconsistent field names. After the backend aligned on `accessToken`/`refreshToken`, refresh would silently return `null`.
- **Fix:** `frontend/lib/auth/auth_service.dart` — `refresh()` now reads `response.data['accessToken']` (matching `fromJson`) and also persists a rotated `response.data['refreshToken']` if the backend returns one.
- **Result:** `accessToken`/`refreshToken` used everywhere in `auth_models.dart` + `auth_service.dart`. No bare `'token'` reads remain (verified via grep).

### 2. Minor — dev port default 3000 → 4000
- **Fix:** `frontend/lib/core/app_config.dart` — `apiBaseUrl` default `http://localhost:3000` → `http://localhost:4000`; `wsBaseUrl` `ws://localhost:3000` → `ws://localhost:4000`.
- Also updated `frontend/README.md` (run command + config table) and `frontend/test/core/app_config_test.dart` (assertions pinned to 4000).

### 3. Minor — `AuthInterceptor` retry used bare `new Dio()`
- **Root cause:** On 401 retry, `onError` did `final dio = Dio(); dio.fetch(clone)` — a bare Dio with no baseUrl/timeouts/content-type, losing all config.
- **Fix:** `frontend/lib/core/app_http_client.dart` — `AuthInterceptor` now takes `required this.dio` in its constructor and retries via `dio.fetch(clone)` using the same configured Dio instance. Added a per-request guard (`RequestOptions.extra['authRetried']`) to prevent infinite refresh loops when the retried request is itself a 401. `attach()` is now no-arg (uses the stored dio).
- Updated caller `frontend/lib/auth/auth_providers.dart` (`authenticatedDioProvider`) to pass `dio: dio` and call `.attach()`.

### 4. Minor — NFR-SEC-2 TLS in prod
- **Fix:** `frontend/lib/core/app_config.dart` — added `isRelease` getter and `assertProductionHttps()` which throws `StateError` in release mode if `apiBaseUrl` isn't `https://` or `wsBaseUrl` isn't `wss://`. Documented in class doc comment that `http://` is dev-only. Added tests in `app_config_test.dart` covering the dev-default (http, non-throwing) behavior.

## Tests

Flutter CLI and `dart` CLI are **not installed** in this environment, so `flutter analyze` / `flutter test` could not be executed. All changed files were verified by careful manual syntactic review (balanced braces, valid Dart syntax, correct types).

Test files updated:
- `frontend/test/core/app_config_test.dart` — port assertions pinned to `http://localhost:4000` / `ws://localhost:4000`; added `NFR-SEC-2 transport security` group (2 tests: dev default is http + non-throwing in debug).
- `frontend/test/auth/auth_models_test.dart` — added regression guard `refresh response field names match AuthSession (accessToken/refreshToken)` that pins the field-name contract and asserts no `'token'` key is involved.

No existing tests referenced the old `'token'` field or port 3000 in a way that would break (the old config test only checked `contains('://')` / `isNotEmpty`); they're now tightened to exact values.

## Files changed (7, all under `frontend/`)

| File | Change |
|------|--------|
| `frontend/lib/auth/auth_service.dart` | `refresh()` reads `accessToken`/`refreshToken` instead of `token` |
| `frontend/lib/core/app_config.dart` | port 4000 + `assertProductionHttps()` + `isRelease` + TLS docs |
| `frontend/lib/core/app_http_client.dart` | `AuthInterceptor` takes `dio`, retry uses it, loop guard |
| `frontend/lib/auth/auth_providers.dart` | pass `dio: dio`, call `.attach()` |
| `frontend/test/core/app_config_test.dart` | port 4000 assertions + NFR-SEC-2 tests |
| `frontend/test/auth/auth_models_test.dart` | field-name regression guard |
| `frontend/README.md` | port 4000 + TLS note in config table |

## Consistency confirmations

- ✅ `accessToken`/`refreshToken` used consistently in `auth_models.dart` (fromJson/toJson/fields) and `auth_service.dart` (refresh reads `accessToken` + optional `refreshToken` rotation). Zero bare `'token'` reads.
- ✅ Default API base URL is `http://localhost:4000` (WS `ws://localhost:4000`). Zero `localhost:3000` references remain.
- ✅ `AuthInterceptor` retry uses the configured Dio instance (no bare `Dio()`).
- ✅ NFR-SEC-2: `assertProductionHttps()` enforces `https://`/`wss://` in release mode; `http://` documented as dev-only.

## Concerns

1. **No flutter/dart CLI** — could not run `flutter analyze` / `flutter test`. Verification was manual syntactic review only. CI on the PR should run the test suite.
2. **Concurrent branch contamination (resolved):** A parallel backend-agent switched the shared working directory to `feature/backend/sprint1-foundation` while I was committing, causing my commit to initially land on the backend branch. I recovered by cherry-picking my fix onto the frontend branch's true origin tip (`c5109e4`), producing clean commit `b13d11e` (frontend-only, 7 files) and pushed it as a fast-forward (`c5109e4..b13d11e`). The frontend PR #18 now contains only frontend changes.
3. **Backend branch history note:** The backend branch (`feature/backend/sprint1-foundation`, already pushed by the backend-agent) contains an extra `feat(backend)` scaffold commit (`0fc8794`) and my frontend fix commit (`4647e5b`) in its history due to the shared-working-dir race. These are disjoint file sets so cause no content conflicts, but the backend PR diff may show extra commits. Cleaning that would require a force-push to the backend branch, which I did NOT do (force-push is forbidden without explicit user approval). Recommend the user/pm decide whether to authorize a backend-branch force-push to clean its history.