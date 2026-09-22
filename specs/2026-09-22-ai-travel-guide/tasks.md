# Tasks — AI Travel Guide (Flutter)

**Project:** ai-tourist-app
**Spec date:** 2026-09-22
**Derived from:** `requirement.md` + `design.md`
**Status:** Draft

---

## Routing Legend
- `[FE]` = frontend-agent (Flutter/Dart)
- `[BE]` = backend-agent (Node.js/TypeScript)
- `[INFRA]` = devops-agent

---

## Epic 1 — Project Bootstrap & Auth

### Issue 1.1 — Flutter app scaffold `[FE]`
- [ ] Task 1.1.1: `flutter create ai_tourist_app` (org com.aitourist.guide), configure for iOS + Android
- [ ] Task 1.1.2: Set up project structure (lib/{auth,location,geofence,voiceover,map,group,walkie_talkie,settings,realtime,notification,core,widgets})
- [ ] Task 1.1.3: Add core deps (dio, flutter_secure_storage, geolocator, google_maps_flutter, web_socket_channel, flutter_webrtc, firebase_messaging, riverpod/state management)
- [ ] Task 1.1.4: Theme + base routing (go_router) + home screen shell

### Issue 1.2 — Backend scaffold `[BE]`
- [ ] Task 1.2.1: Node.js + TypeScript + Express modular monolith (src/{auth,keyvault,spots,group,location,notification,shared})
- [ ] Task 1.2.2: Postgres + PostGIS setup (docker-compose for dev), migrations runner
- [ ] Task 1.2.3: Initial migrations: users, api_keys, tourist_spots, groups, group_members, location_pings + GIST index
- [ ] Task 1.2.4: Shared middleware (JWT auth, error handler, request validation zod), config/env loader
- [ ] Task 1.2.5: Jest test harness + supertest; CI lint (eslint) + typecheck

### Issue 1.3 — Auth (email + password + JWT) `[BE]` `[FE]`
- [ ] Task 1.3.1 `[BE]`: POST /auth/signup, POST /auth/login, POST /auth/refresh; bcrypt + JWT
- [ ] Task 1.3.2 `[BE]`: Unit tests for auth endpoints
- [ ] Task 1.3.3 `[FE]`: Login + signup screens, JWT storage in flutter_secure_storage, dio interceptor for auth
- [ ] Task 1.3.4 `[FE]`: Social login (Google + Apple) via flutter_appauth ⚠️ (confirm providers)

---

## Epic 2 — BYOK API Key Vault

### Issue 2.1 — Key vault backend `[BE]`
- [ ] Task 2.1.1: POST /keys (store ciphertext+iv+auth_tag), GET /keys, DELETE /keys
- [ ] Task 2.1.2: Key validation endpoint — single test call to provider `GET /models` to verify key before marking `is_valid`
- [ ] Task 2.1.3: **NEVER decrypt on server** — endpoint returns ciphertext blob only; client decrypts
- [ ] Task 2.1.4: Unit tests (ciphertext round-trip, validation logic)

### Issue 2.2 — Key vault client `[FE]`
- [ ] Task 2.2.1: AES-256-GCM encrypt/decrypt in flutter_secure_storage (KEK local)
- [ ] Task 2.2.2: Settings screen — enter API key, validate, save; show validation status
- [ ] Task 2.2.3: In-memory key holder service (decrypt on app unlock, clear on background)

---

## Epic 3 — Location + Tourist Spot Geofencing

### Issue 3.1 — Tourist spot registry `[BE]`
- [ ] Task 3.1.1: GET /spots?lat&lng&radius (PostGIS nearest query), GET /spots/:id
- [ ] Task 3.1.2: Tourist spot source — integrate POI API (Google Places / Wikidata) filtered by tourist categories (landmark, museum, park); cache results in Postgres
- [ ] Task 3.1.3: Unit tests for geo queries

### Issue 3.2 — Location + geofence client `[FE]`
- [ ] Task 3.2.1: GPS acquisition + permission flow (foreground + background)
- [ ] Task 3.2.2: Significant-location-change background tracking (battery-optimized)
- [ ] Task 3.2.3: Geofence registration around nearby spots; on-entry event → trigger voiceover flow
- [ ] Task 3.2.4: Map screen — user marker + nearby spot markers (google_maps_flutter)

---

## Epic 4 — AI Voiceover

### Issue 4.1 — Voiceover client `[FE]`
- [ ] Task 4.1.1: Prompt builder (history, why attractive, nearby amenities: restaurant/toilet/mart)
- [ ] Task 4.1.2: Call user's AI provider directly with in-memory decrypted key (dio, streaming optional)
- [ ] Task 4.1.3: TTS — provider TTS with platform-native fallback (flutter_tts) ⚠️
- [ ] Task 4.1.4: Audio playback controls (play/pause/stop/replay) + transcript UI
- [ ] Task 4.1.5: Voiceover cache (transcript + audio file) for offline replay

---

## Epic 5 — Group Management + Live Map

### Issue 5.1 — Group service `[BE]`
- [ ] Task 5.1.1: POST /groups, POST /groups/:id/invite, POST /groups/:id/join, DELETE /groups/:id/members/:uid
- [ ] Task 5.1.2: PATCH /groups/:id/threshold (organizer only)
- [ ] Task 5.1.3: Unit tests

### Issue 5.2 — Location broadcast (WebSocket) `[BE]`
- [ ] Task 5.2.1: WS server — auth handshake, per-group room, receive LocationPing, fan-out via Redis pub/sub
- [ ] Task 5.2.2: Geofence evaluator — on each ping, compute distance from group centroid; if > threshold → emit `GeofenceBreachDetected` event
- [ ] Task 5.2.3: Redis pub/sub wiring + recent-position cache (TTL 30s)
- [ ] Task 5.2.4: Integration tests (WS fan-out, breach detection)

### Issue 5.3 — Group client `[FE]`
- [ ] Task 5.3.1: Create/join/leave group UI, invite link flow, member list
- [ ] Task 5.3.2: WS client — send pings, receive member positions, render member markers (profile pic) on map
- [ ] Task 5.3.3: Threshold config UI (organizer)

---

## Epic 6 — Geofence Breach Notifications

### Issue 6.1 — Notification service `[BE]`
- [ ] Task 6.1.1: Consume `GeofenceBreachDetected` events; send FCM (Android) + APNs (iOS) push
- [ ] Task 6.1.2: Device token registration endpoints (POST /devices, fcm/apns token on login)
- [ ] Task 6.1.3: Unit tests

### Issue 6.2 — Notification client `[FE]`
- [ ] Task 6.2.1: FCM + APNs token registration on login; handle incoming breach push (show banner + map deep-link)

---

## Epic 7 — Walkie-Talkie (Push-to-Talk)

### Issue 7.1 — Voice relay (WebRTC SFU) `[INFRA]` `[BE]`
- [ ] Task 7.1.1: Stand up mediasoup/LiveKit SFU ⚠️ (confirm choice); per-group room provisioning on `GroupCreated` event
- [ ] Task 7.1.2: Half-duplex floor control — request/grant/release floor, auto-release on timeout, at-most-1 speaker
- [ ] Task 7.1.3: Signaling endpoint (REST or WS) for SDP offer/answer + ICE

### Issue 7.2 — Walkie-talkie client `[FE]`
- [ ] Task 7.2.1: PTT button (press-to-request-floor, release-to-release); floor indicator (who is speaking)
- [ ] Task 7.2.2: flutter_webrtc peer connection to SFU; mic capture + speaker playback
- [ ] Task 7.2.3: Graceful degradation on restrictive networks (fallback notice)

---

## Epic 8 — Home Screen + Polish

### Issue 8.1 — Home screen `[FE]`
- [ ] Task 8.1.1: Home screen — current location map + nearby spots + entry points to group/settings
- [ ] Task 8.1.2: App-wide state (riverpod), loading/error states, offline banner

### Issue 8.2 — Testing & hardening
- [ ] Task 8.2.1 `[FE]`: Flutter widget tests for auth + settings + home screens
- [ ] Task 8.2.2 `[FE]`: Flutter integration test for voiceover flow (mock AI provider)
- [ ] Task 8.2.3 `[BE]`: E2E (Newman) collection for auth + group + location APIs
- [ ] Task 8.2.4 `[BE]`: Jest coverage gate ≥ 80% on services

---

## Confirmed Decisions
1. Map SDK: **Google Maps**
2. Voice relay: **LiveKit SFU**
3. Tourist spot seed: **Global** — integrate POI API (Google Places / Wikidata) filtered by tourist categories, not manual JSON
4. Social login: **Google only** (Apple deferred)
5. TTS: **Provider TTS + platform-native fallback**

---

## Suggested Sprint Order (MVP → stretch)
1. **Sprint 1:** Epic 1 (bootstrap + auth) + Epic 2 (BYOK vault) — foundation
2. **Sprint 2:** Epic 3 (location + spots + geofence) + Epic 4 (voiceover) — core tour experience
3. **Sprint 3:** Epic 5 (group + live map) + Epic 6 (notifications) — group travel
4. **Sprint 4:** Epic 7 (walkie-talkie) + Epic 8 (home + polish) — voice + ship