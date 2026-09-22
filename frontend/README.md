# AI Travel Guide — Flutter Frontend

Mobile app for location-aware AI travel commentary, group travel, and walkie-talkie.

## Status

Sprint 1 — foundation (auth + BYOK key vault + scaffold).

## Structure

```
frontend/
  lib/
    main.dart
    core/        # config, theme, router, http, storage, home shell
    auth/        # login, signup, JWT, dio interceptor
    settings/    # API key vault (AES-256-GCM) + settings screen
    widgets/     # shared widgets
    location/    # (Sprint 2) GPS + background tracking
    geofence/    # (Sprint 2) geofence registration
    voiceover/   # (Sprint 2) AI prompt + TTS
    map/         # (Sprint 2) Google Maps
    group/       # (Sprint 3) group CRUD
    realtime/    # (Sprint 3) WebSocket client
    notification/# (Sprint 3) FCM/APNs
    walkie_talkie/ # (Sprint 4) PTT + WebRTC
  test/
    auth/        # login/signup widget + model tests
    core/        # config + theme tests
    settings/    # vault + settings screen tests
    helpers/     # shared test overrides
```

## Getting started

```bash
cd frontend
flutter pub get
flutter run --dart-define=API_BASE_URL=http://localhost:4000
```

## Configuration

| Define | Default | Purpose |
|--------|---------|---------|
| `API_BASE_URL` | `http://localhost:4000` | Backend REST base (dev; prod MUST use `https://` — NFR-SEC-2) |
| `WS_BASE_URL` | `ws://localhost:4000` | WebSocket base (dev; prod MUST use `wss://`) |
| `AI_PROVIDER_BASE_URL` | `https://api.openai.com/v1` | User's AI provider (BYOK) |
| `GOOGLE_OAUTH_CLIENT_ID` | (empty) | Google social login client ID |
| `GOOGLE_OAUTH_REDIRECT_URI` | `com.aitourist.guide:/oauth2redirect` | OAuth redirect |

## Architecture

- **State:** `flutter_riverpod` (StateNotifier-based).
- **Routing:** `go_router` with auth redirect.
- **HTTP:** `dio` with a JWT `AuthInterceptor` (auto-refresh on 401).
- **Secure storage:** `flutter_secure_storage` for JWT + KEK + encrypted API key blob.
- **Crypto:** `encrypt` (AES-256-GCM) for the BYOK vault. KEK lives in secure storage; plaintext key never persists — only in-memory via `ApiKeyHolder`, cleared on app background.

## BYOK security model (design.md §8.1)

1. On first API-key entry, client generates a 256-bit KEK in `flutter_secure_storage`.
2. Client encrypts the AI key with AES-256-GCM → `(ciphertext, iv, authTag)`.
3. Blob is stored locally and uploaded to backend for cross-device restore.
4. For inference, client decrypts in-memory, calls the AI provider **directly**, then zeroes the buffer.
5. Backend never has the KEK → DB breach yields only ciphertext.

## Tests

```bash
flutter test
```

Widget tests for login, signup, settings, and the key vault; unit tests for config, theme, models, and `ApiKeyHolder`.