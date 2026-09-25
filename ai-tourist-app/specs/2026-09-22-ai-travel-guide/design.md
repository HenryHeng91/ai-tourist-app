# Design — AI Travel Guide (Flutter)

**Project:** ai-tourist-app
**Spec date:** 2026-09-22
**Status:** Proposed (defaults marked ⚠️ — user may override)
**Input:** `requirement.md` (same dir)

---

## 1. Architecture Overview

### 1.1 High-Level Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                        FLUTTER CLIENT (iOS + Android)                │
│  ┌──────┐ ┌────────┐ ┌─────────┐ ┌──────────┐ ┌──────┐ ┌──────────┐  │
│  │ Auth │ │Location│ │Geofence │ │Voiceover │ │ Map  │ │WalkieTk  │  │
│  │      │ │ +GPS   │ │ Monitor │ │ /TTS     │ │      │ │ PTT/RTC  │  │
│  └──┬───┘ └───┬────┘ └────┬────┘ └────┬─────┘ └──┬───┘ └────┬─────┘  │
│  ┌──┴──────────┴───────────┴───────────┴─────────┴──────────┴─────┐  │
│  │            Settings / API-Key Vault (AES-256 local)             │  │
│  └────────────────────────────────────────────────────────────────┘  │
└───────────────┬───────────────────────────┬──────────────────────────┘
                │ HTTPS (REST + WS)         │ WebRTC (SFU media)
                ▼                           ▼
┌───────────────────────────────┐  ┌────────────────────────────────┐
│      BACKEND (Node.js/TS)      │  │   VOICE RELAY (WebRTC SFU)     │
│  ┌─────────┐ ┌──────────┐      │  │   - mediasoup / LiveKit ⚠️    │
│  │  Auth   │ │ KeyVault │      │  │   - half-duplex floor control  │
│  │ (JWT)   │ │ (enc at  │      │  │   - per-group room             │
│  │         │ │  rest)   │      │  └───────────────┬────────────────┘
│  └─────────┘ └──────────┘      │                  │
│  ┌─────────────┐ ┌───────────┐ │                  │
│  │ TouristSpot │ │ Group     │ │                  │
│  │ Registry    │ │ Service   │ │                  │
│  └─────────────┘ └───────────┘ │                  │
│  ┌─────────────────────────┐   │                  │
│  │ LocationBroadcast (WS)  │   │                  │
│  │ + Geofence eval (10km)  │   │                  │
│  └────────────┬────────────┘   │                  │
│  ┌────────────┴────────────┐   │                  │
│  │ Notification (FCM+APNs) │   │                  │
│  └─────────────────────────┘   │                  │
└───────────────┬─────────────────┘                  │
                │                                    │
        ┌───────┴────────┬──────────────┬────────────┴───┐
        ▼                ▼              ▼                ▼
   ┌─────────┐     ┌──────────┐   ┌──────────┐    ┌──────────────┐
   │PostgreSQL│     │  Redis   │   │ Object   │    │  AI Provider │
   │ (users,  │     │ (WS pub/ │   │ Storage  │    │ (OpenAI-comp)│
   │  groups, │     │  sub,    │   │ (avatars)│    │ USER'S KEY   │
   │  spots)  │     │  cache)  │   │          │    │ passthrough  │
   └─────────┘     └──────────┘   └──────────┘    └──────────────┘
                                                       ▲
                                                       │
                              Client calls AI directly with its own key
                              (backend NEVER proxies LLM inference — BYOK)
```

**Key principle:** The backend is a **coordination layer**, not an AI gateway. The Flutter client holds the decrypted API key in memory (decrypted from local AES-256 vault) and calls the user's AI provider **directly**. Backend only stores the encrypted key blob for cross-device restore and validates key shape on save. This satisfies REQ-AUTH-4 / NFR-SEC-1.

### 1.2 Data Flow Summary

| Flow | Path | Transport |
|------|------|-----------|
| Auth / login | Client → Auth svc → Postgres | REST/HTTPS |
| API key save | Client encrypts locally → sends ciphertext → KeyVault | REST/HTTPS |
| AI voiceover | Client → AI provider (user's key) → TTS → speaker | HTTPS (client-side) |
| Location broadcast | Client → WS → LocationBroadcast → Redis pub/sub → other clients | WebSocket/TLS |
| Geofence breach | LocationBroadcast evaluates 10km → Notification svc → FCM/APNs | Server push |
| Walkie-talkie | Client ↔ SFU ↔ other clients (half-duplex) | WebRTC/SRTP |
| Tourist spot query | Client → Registry svc → Postgres | REST/HTTPS |

---

## 2. Bounded Contexts (DDD / Context Mapper)

Four bounded contexts, mapped with Context Mapper notation. Shared kernel is minimal (User identity only).

```
                    ┌─────────────────────────────┐
                    │   Shared Kernel: UserIdentity │
                    │   (userId, displayName)       │
                    └──────────┬──────────────────┘
                               │
   ┌───────────────┐   ┌───────┴────────┐   ┌──────────────────┐
   │   [Auth]       │   │  [TourGuide]   │   │ [GroupTracking]  │
   │----------------│   │----------------│   │------------------│
   │ User           │   │ TouristSpot    │   │ Group            │
   │ ApiKey(vault)  │   │ GeofenceEvent  │   │ GroupMember      │
   │ Session/JWT    │   │ VoiceoverJob   │   │ LocationPing     │
   │                │   │ Transcript     │   │ GeofenceBreach   │
   │ Aggregates:    │   │ Aggregates:    │   │ Aggregates:      │
   │  User(root)    │   │  TouristSpot   │   │  Group(root)     │
   │  ApiKey(ent)   │   │  (root)        │   │  Member(ent)     │
   │                │   │                │   │  LocationPing    │
   │                │   │                │   │  (ent)           │
   └───────┬───────┘   └───────┬────────┘   └────────┬─────────┘
           │                   │                     │
           │   [U] upstream    │   [U] upstream      │
           ▼                   ▼                     ▼
                   ┌──────────────────────────┐
                   │      [VoiceComms]        │
                   │--------------------------│
                   │ Room (per group)         │
                   │ FloorState (speaker)     │
                   │ MediaStream (WebRTC)     │
                   │ Aggregates:              │
                   │  Room(root)              │
                   │  FloorToken(ent)         │
                   └──────────────────────────┘
```

### Context Map (relationships)

| Upstream → Downstream | Relationship | Description |
|-----------------------|--------------|-------------|
| Auth → TourGuide | U (upstream, conformist) | TourGuide needs authenticated user to trigger voiceover |
| Auth → GroupTracking | U | Group ops require auth |
| Auth → VoiceComms | U | Joining a voice room requires auth |
| GroupTracking → VoiceComms | U (OHS, ACL) | Voice room is created per group; GroupTracking publishes group lifecycle events; VoiceComms is open-host service with ACL translation |
| TourGuide → GroupTracking | P (partnership) | Geofence breach can notify group (loose coupling via event) |
| GroupTracking → TourGuide | P | Group location may influence "nearby" context (future) |

**Integration patterns:**
- **Auth ↔ all**: synchronous REST (JWT validation).
- **GroupTracking → VoiceComms**: async event (`GroupCreated`, `GroupDissolved`) via Redis pub/sub → SFU provision/deprovision room.
- **TourGuide ↔ GroupTracking**: async domain event (`GeofenceBreachDetected`) consumed by Notification service.

### Aggregates & Invariants (per context)

**Auth**
- `User` (root): invariant — email unique; at most 1 active `ApiKey` per provider per user.
- `ApiKey` (entity): invariant — stored value is always ciphertext; plaintext never persisted server-side.

**TourGuide**
- `TouristSpot` (root): invariant — `(lat,lng)` unique within `radius_m` tolerance; `metadata` non-null.
- `VoiceoverJob` (entity, transient): invariant — references a valid `TouristSpot` and a valid user `ApiKey` (held client-side).

**GroupTracking**
- `Group` (root): invariant — `members.count >= 1`; `geofenceThresholdKm > 0`; only organizer can mutate threshold.
- `LocationPing` (entity): invariant — `timestamp` monotonic per user; `lat/lng` within valid range.

**VoiceComms**
- `Room` (root): invariant — 1:1 with `Group`; `floorHolder` is null or a member; at most 1 `floorHolder` at a time (half-duplex).
- `FloorToken` (entity): invariant — `expiresAt` enforced; auto-release on timeout.

---

## 3. Component Breakdown

### 3.1 Flutter Client Modules

| Module | Responsibility | Key Packages |
|--------|---------------|--------------|
| `auth` | Login/signup, JWT storage, social login, session refresh | `dio`, `flutter_appauth` |
| `key_vault` | Local AES-256 encrypt/decrypt of AI key, validation call to provider | `flutter_secure_storage`, `encrypt` (AES-GCM) |
| `location` | GPS acquisition, significant-location-change background tracking | `geolocator`, `flutter_background_geolocation` |
| `geofence` | Register geofences around tourist spots, detect entry, emit events | `geofence_service` or native `GeofencingClient` |
| `voiceover` | Build prompt, call AI provider (user key), parse response, TTS, playback, transcript UI | `dio`, `flutter_tts` (native fallback) or provider TTS |
| `map` | Render map, user marker, member markers, tourist-spot markers | `google_maps_flutter` ⚠️ |
| `group` | Create/join/leave group, invite flow, member list, threshold config | `dio`, WS client |
| `walkie_talkie` | PTT button, WebRTC peer connection to SFU, floor indicator | `flutter_webrtc` |
| `settings` | API key entry, threshold, logout, preferences | — |
| `realtime` | WS client for location pings + member position updates | `web_socket_channel` |
| `notification` | FCM/APNs token reg, handle incoming geofence-breach push | `firebase_messaging`, `apns` |

### 3.2 Backend Services (Node.js/TypeScript, modular monolith)

| Service | Responsibility | Tech |
|---------|---------------|------|
| `auth-service` | Email+password (bcrypt), social OAuth, JWT issue/refresh | Express, `jsonwebtoken`, `passport` |
| `key-vault-service` | Store/retrieve encrypted API key blobs; **never decrypt**; validate key shape via a single test call to provider | Express, Postgres `bytea` column |
| `tourist-spot-registry` | CRUD/seed tourist spots, nearest-spot query, geofence radius config | Express, PostGIS (geo queries) |
| `location-broadcast-service` | WebSocket hub; receive pings, fan-out to group via Redis pub/sub; evaluate 10km geofence per group | `ws`, Redis pub/sub |
| `group-service` | Group CRUD, invite tokens, member add/remove, threshold config | Express, Postgres |
| `notification-service` | Consume `GeofenceBreachDetected` events; send FCM (Android) + APNs (iOS) | `firebase-admin`, `apn` |
| `voice-relay` (separate process) | WebRTC SFU: per-group rooms, half-duplex floor control, media routing | `mediasoup` or `livekit-server` ⚠️ |
| `ai-passthrough` (client-only) | — | None on backend; client calls provider directly |

> **Deployment:** `voice-relay` runs as a separate process/container (CPU-bound media). The rest can be one Node process initially (modular monolith) and split later if scale demands.

---

## 4. Data Model

PostgreSQL with PostGIS extension for geo queries.

```sql
-- Auth context
users (
  id              UUID PK,
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT,              -- null if social-only
  display_name    TEXT,
  avatar_url      TEXT,
  fcm_token       TEXT,              -- Android push
  apns_token      TEXT,              -- iOS push
  created_at      TIMESTAMPTZ
)

api_keys (
  id              UUID PK,
  user_id         UUID FK -> users,
  provider        TEXT NOT NULL,     -- 'openai' | 'openai-compatible'
  ciphertext      BYTEA NOT NULL,    -- AES-256-GCM encrypted key blob
  iv              BYTEA NOT NULL,
  auth_tag        BYTEA NOT NULL,    -- GCM tag
  is_valid        BOOLEAN DEFAULT TRUE,
  validated_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ,
  UNIQUE (user_id, provider)
)
-- NOTE: encryption key (KEK) is held in server KMS / env var, NOT in DB.
-- Plaintext key is NEVER stored server-side. Client decrypts via a
-- server-issued ephemeral DEK after re-auth, OR client holds KEK locally
-- (see §8 Security — recommended: client-side KEK in flutter_secure_storage).

-- TourGuide context
tourist_spots (
  id              UUID PK,
  name            TEXT NOT NULL,
  description     TEXT,
  geom            GEOGRAPHY(POINT, 4326) NOT NULL,  -- PostGIS
  geofence_radius_m INT NOT NULL DEFAULT 200,
  category        TEXT,              -- 'landmark' | 'park' | 'museum' ...
  metadata        JSONB,             -- opening hours, etc.
  source          TEXT DEFAULT 'seed',
  created_at      TIMESTAMPTZ
)
CREATE INDEX idx_spots_geom ON tourist_spots USING GIST (geom);

voiceover_transcripts (        -- optional, for replay/cache
  id              UUID PK,
  user_id         UUID FK,
  spot_id         UUID FK,
  transcript_text TEXT,
  created_at      TIMESTAMPTZ
)

-- GroupTracking context
groups (
  id                    UUID PK,
  organizer_id          UUID FK -> users,
  name                  TEXT,
  geofence_threshold_km NUMERIC(5,2) NOT NULL DEFAULT 10.0,
  created_at            TIMESTAMPTZ
)

group_members (
  group_id        UUID FK -> groups,
  user_id         UUID FK -> users,
  role            TEXT DEFAULT 'member',   -- 'organizer' | 'member'
  joined_at       TIMESTAMPTZ,
  PRIMARY KEY (group_id, user_id)
)

location_pings (            -- hot table; consider TTL/partitioning
  id              BIGSERIAL PK,
  user_id         UUID,
  group_id        UUID,
  geom            GEOGRAPHY(POINT, 4326),
  accuracy_m      REAL,
  timestamp       TIMESTAMPTZ NOT NULL
)
-- Recent positions also cached in Redis: key=group:{id}:pos:{user_id} TTL=30s

-- VoiceComms context (in-memory / Redis; not persisted long-term)
-- rooms: 1:1 with groups, managed in SFU process
-- floor_state: Redis hash room:{id}:floor -> {holder_user_id, expires_at}
```

### Domain Events (async, via Redis pub/sub)

| Event | Producer | Consumer |
|-------|----------|----------|
| `GroupCreated { groupId }` | group-service | voice-relay (provision room) |
| `GroupDissolved { groupId }` | group-service | voice-relay (close room) |
| `GeofenceBreachDetected { groupId, memberId, distanceKm }` | location-broadcast-service | notification-service |
| `LocationUpdated { groupId, userId, lat, lng }` | location-broadcast-service | (fan-out to group WS clients) |

---

## 5. API Design

### 5.1 REST Endpoints (HTTPS, JWT bearer)

**Auth**
```
POST   /auth/register            { email, password, displayName } -> { userId, token }
POST   /auth/login               { email, password }             -> { token, refreshToken }
POST   /auth/social/{provider}   { idToken }                     -> { token, refreshToken }
POST   /auth/refresh             { refreshToken }                -> { token }
POST   /auth/logout              -
```

**API Key Vault**
```
PUT    /me/api-key               { provider, ciphertext, iv, authTag }
                                 -> { isValid, validatedAt }
                                 # Server stores blob as-is; runs ONE validation
                                 # call to provider (e.g., GET /models) using a
                                 # server-side decrypt ONLY in-memory for the
                                 # validation call, then discards plaintext.
GET    /me/api-key               -> { provider, hasKey, isValid }   # never returns plaintext
DELETE /me/api-key               -
```
> ⚠️ Design decision: For maximum BYOK purity, the **client** performs validation (calls provider `/models` with its own key) and only sends the ciphertext to the backend for backup/restore. The backend then never touches plaintext at all. Recommended. The PUT endpoint above accepts a pre-validated blob.

**Tourist Spot Registry**
```
GET    /spots?lat=&lng=&radiusKm=&limit=   -> [ { id, name, geom, geofenceRadiusM, category } ]
GET    /spots/:id                          -> { ...full, metadata }
POST   /spots                (admin/seed)   -> { id }
```

**Group**
```
POST   /groups                       { name, thresholdKm? }     -> { groupId, inviteCode }
GET    /groups/:id                                             -> { group, members[] }
POST   /groups/:id/invite                                      -> { inviteCode }
POST   /groups/join                { inviteCode }              -> { groupId }
DELETE /groups/:id/members/:userId                            -
PATCH  /groups/:id                { thresholdKm }             -> { group }   # organizer only
```

**Location** (REST is fallback; primary path is WebSocket)
```
POST   /groups/:id/ping            { lat, lng, accuracyM }     -> 204   # last-resort
```

### 5.2 WebSocket Events (wss://.../realtime?token=JWT)

Client → Server:
```
{ type: "location_ping",  lat, lng, accuracyM, ts }
{ type: "subscribe_group", groupId }
{ type: "unsubscribe_group", groupId }
```

Server → Client:
```
{ type: "member_position", groupId, userId, lat, lng, ts }
{ type: "member_joined",    groupId, userId, displayName }
{ type: "member_left",      groupId, userId }
{ type: "geofence_breach",  groupId, memberId, distanceKm, thresholdKm }
```

### 5.3 WebRTC Signaling (for walkie-talkie, via the same WS or a dedicated `/rtc` WS)

```
Client -> Server: { type: "rtc_join",      groupId }
Client -> Server: { type: "rtc_offer",     sdp, toUserId }       # if P2P fallback
Client -> Server: { type: "rtc_ice",       candidate, toUserId }
Client -> Server: { type: "ptt_request" }                        # request the floor
Server -> Client: { type: "rtc_answer",    sdp, fromUserId }
Server -> Client: { type: "rtc_ice",       candidate, fromUserId }
Server -> Client: { type: "ptt_granted",   floorHolderUserId, expiresAt }
Server -> Client: { type: "ptt_denied" }                         # someone else holds floor
Server -> Client: { type: "ptt_release",   floorHolderUserId }
Server -> Client: { type: "speaker_changed", userId }            # floor indicator UI
```

SFU media path: each client publishes one audio track to the SFU room; SFU mixes/forwards based on floor holder (only floor holder's audio is forwarded to others — enforces half-duplex at the server).

---

## 6. Key Technical Decisions & Trade-offs

| # | Decision | Options | Choice | Rationale |
|---|----------|---------|--------|-----------|
| D1 | Map SDK | Google Maps / Mapbox / OSM | **Google Maps Flutter** ⚠️ | Best Flutter support, familiar, generous free tier for MVP. Mapbox if usage exceeds free quota. OSM (`flutter_map`) if license-cost-sensitive. **Trade-off:** Google = cost at scale + Google Play dependency on Android. |
| D2 | Walkie-talkie transport | WebRTC P2P / WebRTC SFU / server-relayed audio | **WebRTC SFU (mediasoup/LiveKit)** ⚠️ | P2P doesn't scale beyond ~4 peers (mesh) and breaks on NATs. SFU gives low latency + scales to group size + server enforces half-duplex floor. Server-relayed (WebSocket audio chunks) is simpler but higher latency + more backend CPU. **Trade-off:** SFU adds an ops burden (separate media server). |
| D3 | TTS source | Provider TTS (OpenAI audio) / platform-native (`flutter_tts`) | **Provider TTS with native fallback** ⚠️ | Provider TTS = high quality, billed to user's key (consistent BYOK). Native = free, offline-capable, lower quality. Let user toggle in settings; default to provider. |
| D4 | Tourist spot data | Curated JSON seed / Google Places / Wikidata | **Curated JSON seed for MVP** ⚠️ | Full control, no external API cost/latency, matches CON-3. Add Wikidata/Places enrichment later behind the registry service interface. **Trade-off:** Manual curation effort. |
| D5 | Social login | Google / Apple / both | **Both** ⚠️ | Apple Sign-In is required by App Store if any other social login is offered. So both. |
| D6 | AI call location | Backend proxy / Client direct | **Client direct** | Backend never sees plaintext key, never pays tokens, never becomes an AI gateway. Matches REQ-AUTH-4 + NFR-SEC-1. **Trade-off:** Can't server-side cache/rate-limit AI calls (acceptable for BYOK). |
| D7 | Backend structure | Modular monolith / microservices | **Modular monolith** (split voice-relay out) | MVP simplicity; split only when scale demands. voice-relay is separate from day 1 (different runtime needs). |
| D8 | Location strategy | Continuous high-freq / significant-change | **Significant-location-change + adaptive** | Matches NFR-BAT-1. High-freq only when group is active + app foreground. |
| D9 | Geofence eval location | Client / Server | **Both** | Client geofence triggers voiceover (low latency, REQ-AI). Server geofence (10km group breach) computed on location ping (REQ-GRP-5, needs group-wide view). |

---

## 7. Test Strategy (TDD Scope)

| Layer | Tool | Scope |
|-------|------|-------|
| **Flutter unit** | `flutter test` (Dart) | Domain logic: geofence math, prompt builder, key encryption/decryption, threshold comparison, floor-state machine |
| **Flutter widget** | `flutter test` (widget tests) | Home screen, group list, settings, PTT button states, transcript view |
| **Flutter integration** | `integration_test` package | End-to-end on device/emulator: login → see map → mock geofence trigger → voiceover plays; group join → member marker appears |
| **Backend unit** | Vitest (or Jest) | Service logic: JWT, key-vault blob handling, geofence breach calc, group invariants, event handlers |
| **Backend integration** | Vitest + Testcontainers (Postgres/PostGIS/Redis) | REST endpoints, WS event flow, pub/sub fan-out |
| **Contract** | OpenAPI schema + WS schema validation | Client/server agree on shapes |
| **E2E (system)** | Flutter `integration_test` against a staging backend | Full user journey |
| **Load (voice)** | k6 or locust against SFU | WebRTC room capacity |

> **Note:** Playwright is NOT applicable to Flutter (it targets web DOM). Flutter E2E uses the `integration_test` framework driving a real device/emulator via the Flutter driver.

**TDD ordering:** domain/pure-logic unit tests first (geofence math, floor state, encryption) → widget tests → integration tests. Backend: service unit → API integration → contract.

---

## 8. Security Design

### 8.1 API Key Encryption (NFR-SEC-1)

**Recommended scheme — client-side KEK (zero server plaintext):**
1. On first API-key entry, client generates a random 256-bit KEK, stores it in `flutter_secure_storage` (iOS Keychain / Android Keystore — hardware-backed where available).
2. Client encrypts the AI provider key with AES-256-GCM using the KEK → `(ciphertext, iv, authTag)`.
3. Client sends the blob to `PUT /me/api-key` (over TLS) for backup/restore across devices.
4. For inference, client decrypts in-memory, calls provider directly, zeroes the buffer.
5. Server stores the blob in `api_keys.ciphertext`; **server never has the KEK**, so even a full DB breach yields only ciphertext.
6. Cross-device restore: user re-enters a master password (PBKDF2 → KEK) on the new device, pulls the blob, decrypts. (Alternative: server-side KEK in KMS — simpler restore, but server can be compelled to decrypt. Client-side KEK is the stronger BYOK posture.)

**Never:** log the key, include it in analytics, send it to any endpoint other than the user's chosen AI provider, persist plaintext in any store.

### 8.2 Transport Security (NFR-SEC-2)
- All REST + WebSocket traffic over TLS 1.2+ (TLS 1.3 preferred).
- WebRTC media over SRTP (DTLS-SRTP key exchange).
- Certificate pinning on mobile client for backend API (optional, recommended).
- HSTS on backend.

### 8.3 Location Privacy (NFR-PRIV-1)
- Location pings are scoped to `group_id`; WS server enforces membership before fan-out.
- `location_pings` table has a 24h TTL (or partition + drop); only latest position cached in Redis (30s TTL).
- No location data sold/shared with third parties; no analytics on raw coords.
- Background location requires explicit OS permission with clear in-app rationale.
- User can pause location sharing per-group (ghost mode) — UI control.

### 8.4 Auth
- JWT (short-lived access ~15min, refresh ~30d, rotating refresh).
- bcrypt cost 12 for passwords.
- Invite tokens: single-use, 24h expiry, bound to email or open.

### 8.5 Voice Relay
- SFU rooms isolated per group; join requires valid JWT + group membership verified by voice-relay against group-service (or via signed room token from backend).
- Media not recorded or persisted.

---

## 9. Resolved Open Questions (from requirement.md §8)

These are **proposed defaults** (⚠️) — the user can override before implementation.

| Q | Question | Proposed Default | Rationale |
|---|----------|------------------|-----------|
| 1 | Map SDK | **Google Maps Flutter** ⚠️ | Best Flutter DX, solid free tier. Switch to Mapbox if cost/usage demands. |
| 2 | WebRTC vs server-relayed audio | **WebRTC SFU (mediasoup or LiveKit)** ⚠️ | Scales beyond 4 peers, low latency, server-enforced half-duplex. Server-relayed is the fallback if SFU ops is unacceptable. |
| 3 | Tourist spot data source | **Curated JSON seed** ⚠️ | No external cost/latency, full control (CON-3). Wikidata/Places as future enrichment behind registry interface. |
| 4 | Social login providers | **Google + Apple** ⚠️ | Apple required if Google offered (App Store rule). |
| 5 | TTS source | **Provider TTS, native fallback, user-toggle** ⚠️ | Quality + consistent BYOK billing; native free for offline/low-data users. |

---

## 10. Implementation Notes (non-normative)

- **Flutter state:** Riverpod or Bloc for the geofence→voiceover flow (event-driven). Recommend Bloc for the floor-state machine (PTT) given its FSM nature.
- **Background location:** Use `flutter_background_geolocation` (wraps native significant-location-change on both platforms) to satisfy NFR-BAT-1.
- **Offline (NFR-REL-1):** cache last N voiceover transcripts + map tiles (map SDK offline cache). AI inference inherently needs network — degrade by showing cached transcript + "offline" banner.
- **SFU choice:** mediasoup (lower-level, more control, Node.js-friendly) vs LiveKit (batteries-included, has Flutter SDK). **Recommend LiveKit for MVP** (faster integration, official Flutter client) — revisit if custom floor control needs mediasoup. ⚠️
- **PostGIS:** essential for `ST_DWithin` nearest-spot and breach-distance queries without pulling all rows.

---

## 11. Hand-off

This `design.md` is the architecture output. Next stage: **pm-agent** produces `tasks.md` (task breakdown) from `requirement.md` + this `design.md`. No code is written in this stage.

**Out of scope for this file:** requirement changes, task breakdown, code.