# Code Review Report — PR #18 (frontend, Sprint 1 foundation)

**Branch:** `feature/frontend/sprint1-foundation` → `develop`
**Repo:** HenryHeng91/ai-tourist-app
**Reviewer:** code-reviewer-agent
**Date:** 2026-09-22
**Verdict:** CHANGES_REQUESTED
**GitHub review:** https://github.com/HenryHeng91/ai-tourist-app/pull/18#pullrequestreview-5275548840
*(Posted as COMMENT event — GitHub forbids REQUEST_CHANGES on your own PR; verdict is in the review body.)*

## Scope
37 frontend files (+2,959 lines): auth, core, settings/key-vault, module stubs, tests.

## Security ✅
- BYOK vault per design §8.1: AES-256-GCM, client-side KEK in `flutter_secure_storage` (Keychain/Keystore); ciphertext/iv/authTag persisted locally + uploaded; plaintext never sent to our backend. (NFR-SEC-1 / REQ-AUTH-4)
- AI key goes only to user's provider (`ApiKeyValidatorLive` → `$_providerBaseUrl/models`); `aiProviderDioProvider` is a separate Dio, bearer injected per-request from `ApiKeyHolder`.
- In-memory key cleared on app background (`main.dart` didChangeAppLifecycleState). `VaultBlob.toString()` logs lengths only; `keyFingerprint` (SHA-256, 12 hex) for safe debug. No `print`/`debugPrint` of keys/tokens.
- JWT + refresh in secure storage; `AuthInterceptor` single refresh attempt on 401 then `onAuthFailed`.

## Code quality ✅
- Clean Riverpod + go_router; module stubs match design §3.1. Hand-written immutable models (documented: avoid build_runner for Sprint 1 tests).
- Effective Dart: naming, `const` ctors, `super.key`; `flutter_lints` configured.
- Tests: auth_models, auth_screens, app_config, app_theme, api_key_holder, settings_screen.

## Architecture alignment ⚠️
- Frontend follows design §5.1 for `/auth/register` (correct vs spec); mismatch is backend-side. Response field-name gap below breaks integration.

## Findings

| # | Severity | File:Line | Finding |
|---|----------|-----------|---------|
| 1 | CRITICAL | auth_models.dart:36 | `fromJson` reads `accessToken` but backend returns `token` (PR #19 signTokens). Null → `as String` throws at runtime on login/signup. Align field name with backend; make `refresh()` (reads `token`) consistent. |
| 2 | MINOR | app_config.dart:11 | Default `http://localhost:3000` but backend default port is 4000 → dev won't connect. Also `http://` vs NFR-SEC-2 (TLS). Use `https://localhost:4000` for non-localhost + release-build assertion against `http://`. |
| 3 | MINOR | app_http_client.dart:82 | `AuthInterceptor.onError` retry spins up bare `new Dio()`, bypassing base config/interceptors. Reuse original Dio for consistency. |
| 4 | NIT | auth_service.dart:153 | `GoogleAuthClient.signIn()` throws `UnimplementedError` — documented TODO, social login deferred. Fine for Sprint 1. |
| 5 | NIT | key_vault_service.dart:168 | `ApiKeyValidator` stub has odd string-based `httpClient` interface; real impl is `ApiKeyValidatorLive`. If test-only, mark `@visibleForTesting` or move under `test/`. |

## Verification
- Manual review (no Flutter SDK run in env). Security sweep: no hardcoded keys, no secret logging. Backend tests (PR #19) pass 43/43; contract gap above breaks the integrated flow.

## Sign-off
BLOCKED by finding #1 (auth response contract). Approveable once field name is agreed with backend and port/TLS defaults tidied.