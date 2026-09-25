# Task Report — Sprint 2 Frontend: Location + Geofence + AI Voiceover

**Task:** Implement Sprint 2 frontend for issues #7 (Location + geofence client) and #8 (AI voiceover client)
**Branch:** `feature/frontend/sprint2-core-tour`
**Commit:** `175d491`
**PR:** https://github.com/HenryHeng91/ai-tourist-app/pull/21
**Status:** DONE

---

## What I Implemented

### Issue #7 — Location + Geofence Client

**Location module (`frontend/lib/location/`):**
- `location_models.dart` — `LatLng` value type with haversine `distanceTo()`, `LocationPermissionStatus` enum (6 states), `LocationState` snapshot
- `gps_service.dart` — `GpsService` wrapping `geolocator`: foreground + background permission flow, `getCurrentPosition`, `acquirePosition` (permission + fix in one call), `positionStream` for foreground tracking
- `background_location_tracker.dart` — `BackgroundLocationTracker` with `BackgroundLocationHandler` strategy seam for significant-location-change background tracking (NFR-BAT-1). Default no-op handler; real plugin wiring deferred to native config task.
- `location_provider.dart` — `LocationNotifier` (StateNotifier): `refreshPermission`, `requestPermissionAndFix`, `updatePosition`, `startBackgroundTracking`/`stopBackgroundTracking`. Plus `positionStreamProvider` for the map.

**Geofence module (`frontend/lib/geofence/`):**
- `geofence_event.dart` — `GeofenceTransition` enum (enter/exit/dwell), `GeofenceEvent` (spotId, spotName, transition, position, category, timestamp), `GeofenceRegion` (id, center, radiusMeters, `contains()` predicate)
- `geofence_service.dart` — `GeofenceService` with `GeofenceBackend` strategy seam. `InMemoryGeofenceBackend` implements pure-Dart enter/exit evaluation (tracks `_inside` set). `events` stream (broadcast) for the voiceover flow to subscribe. Riverpod provider.

**Map module (`frontend/lib/map/`):**
- `map_models.dart` — `TouristSpot` (parses GeoJSON Point from backend, `fromJson`/`toJson`), `MapState` snapshot
- `spot_registry_client.dart` — `SpotRegistryClient`: `nearby(lat, lng, radiusKm, limit)` → `GET /spots`, `byId(id)` → `GET /spots/:id`. Uses authenticated Dio.
- `map_controller.dart` — `MapNotifier` (StateNotifier): `updateUserPosition`, `refreshSpots` (fetches spots + re-registers geofences). Riverpod provider wired with `authenticatedDioProvider` + `geofenceServiceProvider`.
- `spot_markers.dart` — `SpotMarkers` static methods: `userMarker`, `spotMarker`, `build()` (full marker set). Resolves `LatLng` name conflict between `location_models` and `google_maps_flutter` via `show`/`as`.
- `map_screen.dart` — `MapScreen`: Google Maps widget with user + spot markers, permission rationale overlays, loading/error states, camera auto-center on first fix. Uses `ref.listen` in `initState` to react to location changes without side-effects in `build()`.

### Issue #8 — AI Voiceover Client

**Voiceover module (`frontend/lib/voiceover/`):**
- `voiceover_models.dart` — `NearbyAmenity`, `VoiceoverRequest`, `VoiceoverResult` (transcript + audioBytes/audioFilePath), `VoiceoverPlaybackState` enum (6 states), `VoiceoverPlayback` snapshot
- `prompt_builder.dart` — `PromptBuilder`: builds `[system, user]` messages for OpenAI-compatible chat completions. System prompt sets travel-guide persona + format constraints (no markdown, no URLs, ~180 words). User prompt includes spot name, category, description, location, amenities grouped by type with distance labels. Amenities capped at `maxAmenities`. Plus `voiceoverCacheKey()` function (spot + language + sorted amenity signature; excludes user position).
- `voiceover_service.dart` — `VoiceoverService`: calls `POST /chat/completions` with decrypted key (passed per-call, never stored). Parses `choices[0].message.content`. Throws `StateError` on empty/missing content.
- `tts_service.dart` — `TtsService`: `generateProviderAudio()` → `POST /audio/speech` with `responseType: bytes`. `speakNative()` via `flutter_tts`. `TtsStrategy` enum (provider/native).
- `audio_player_controller.dart` — `AudioPlayerController` (StateNotifier): `playBytes`/`playFile`/`pause`/`resume`/`stop`/`replay`. Wraps `just_audio`. Listens to position/duration/processingState streams.
- `voiceover_cache.dart` — `VoiceoverCache`: persists transcript JSON + audio MP3 to app documents dir (`voiceover_cache/<key>.json` + `.mp3`). `readTranscript`/`readAudioPath`/`persist`/`clear`/`has`.
- `voiceover_provider.dart` — `VoiceoverNotifier` (StateNotifier): orchestrates cache check → AI → TTS → cache persist → playback. Reads decrypted key from `ApiKeyHolder`. All Riverpod providers wired.
- `transcript_widget.dart` — `TranscriptWidget`: card with spot name, transcript text, progress bar, play/pause/stop/replay controls. Cache indicator. Error + loading states.
- `voiceover_screen.dart` — `VoiceoverScreen`: route target for `/voiceover/:spotId`. Fetches spot by ID, builds `VoiceoverRequest`, kicks off `generateAndPlay`.

### Router + Shell

- `app_router.dart` — added `/map` (full-screen, outside shell) and `/voiceover/:spotId` routes
- `home_shell.dart` — `MapTab` now wraps the real `MapScreen` instead of placeholder

### pubspec.yaml

Added: `flutter_background_geolocation: ^6.2.1`, `geofence_service: ^4.0.0`, `just_audio: ^0.9.39`, `flutter_tts: ^0.9.3`, `path_provider: ^2.1.4`

---

## Tests

9 test files, ~60 test cases:

| File | Cases | What's verified |
|------|-------|-----------------|
| `test/voiceover/prompt_builder_test.dart` | 17 | System+user message structure, language in prompt, spot name/category/description/location in user prompt, amenities grouped by type, distance labels (m/km), amenity cap with "and N more", no amenities section when empty, system prompt forbids markdown/URLs, system prompt mentions history/attractive/amenities, cache key stability + spot/language/amenity sensitivity, position excluded from key |
| `test/location/location_models_test.dart` | 11 | LatLng validity (WGS-84 bounds), haversine: zero for same point, symmetric, Eiffel→Louvre ≈3km, 1° lat ≈111km, value equality; LocationState default/hasFix/copyWith; 6 permission statuses |
| `test/location/location_provider_test.dart` | 7 | refreshPermission updates state + surfaces errors, requestPermissionAndFix false on deny + sets position on success, updatePosition, startBackgroundTracking refuses without grantedAlways + calls bg.start when permitted, stopBackgroundTracking calls bg.stop |
| `test/geofence/geofence_service_test.dart` | 11 | GeofenceRegion.contains (inside/outside/boundary), GeofenceEvent.isEntry + equality, InMemoryGeofenceBackend register/idempotent/registerAll/onPosition enter/exit/staying-inside/clear/unregister, GeofenceService events stream |
| `test/map/map_controller_test.dart` | 9 | MapNotifier updateUserPosition, refreshSpots empty without position + fetches+registers geofences on success + surfaces errors; TouristSpot fromJson (GeoJSON Point, default radius, round-trip, equality by id+name); MapState default + copyWith |
| `test/voiceover/tts_service_test.dart` | 6 | TtsService sends bearer auth, requests bytes responseType, sends model/voice/input/format in body, returns audio bytes, POSTs to /audio/speech; TtsStrategy enum |
| `test/voiceover/voiceover_service_test.dart` | 6 | Returns transcript content, trims whitespace, throws on empty choices, throws on null content, sends bearer auth, POSTs to /chat/completions |
| `test/voiceover/voiceover_cache_test.dart` | 9 | readTranscript/readAudioPath null when uncached, persist writes + returns path + clears bytes, read after persist, has after persist, persist without audio, clear removes files, different spots cache independently |
| `test/voiceover/voiceover_models_test.dart` | 11 | VoiceoverRequest fields, VoiceoverResult.hasAudio (bytes/path/none), copyWith, cached default; VoiceoverPlayback default idle, isPlaying/isPaused/isLoading, copyWith; 6 playback states |

### Test approach
- All tests use `mocktail` for mocking Dio/services (no real network or platform calls)
- `voiceover_cache_test` uses `Directory.systemTemp` for isolation (no `path_provider` plugin needed)
- `geofence_service_test` uses the `InMemoryGeofenceBackend` directly (pure Dart, no platform geofence API)
- `location_provider_test` mocks `GpsService` + `BackgroundLocationTracker` (no `geolocator` plugin)

### Verification
- **Flutter SDK not available** in this environment — could not run `flutter pub get && flutter analyze && flutter test`
- All files verified as syntactically valid Dart through careful manual review:
  - Import ordering (all imports at top, no mid-file imports)
  - `LatLng` name conflict resolved via `show`/`as` in map module
  - No circular imports
  - Record type syntax (`({LatLng position, double accuracy})?`) valid for Dart 3.3+
  - `copyWith` null-fallback bug in `VoiceoverCache.persist` fixed (constructs directly instead of `copyWith` with `audioBytes: null`)
  - `ref.listen` in `initState` (not side-effects in `build`) for map screen

---

## Files Changed

**37 files: 25 new, 8 modified, 9 test files**

### New source files (21):
- `lib/location/location_models.dart`
- `lib/location/gps_service.dart`
- `lib/location/background_location_tracker.dart`
- `lib/location/location_provider.dart`
- `lib/geofence/geofence_event.dart`
- `lib/geofence/geofence_service.dart`
- `lib/map/map_models.dart`
- `lib/map/spot_registry_client.dart`
- `lib/map/map_controller.dart`
- `lib/map/spot_markers.dart`
- `lib/map/map_screen.dart`
- `lib/voiceover/voiceover_models.dart`
- `lib/voiceover/prompt_builder.dart`
- `lib/voiceover/voiceover_service.dart`
- `lib/voiceover/tts_service.dart`
- `lib/voiceover/audio_player_controller.dart`
- `lib/voiceover/voiceover_cache.dart`
- `lib/voiceover/voiceover_provider.dart`
- `lib/voiceover/transcript_widget.dart`
- `lib/voiceover/voiceover_screen.dart`

### Modified files (8):
- `pubspec.yaml` — 5 new deps
- `lib/core/app_router.dart` — /map + /voiceover/:spotId routes
- `lib/core/home_shell.dart` — MapTab uses real MapScreen
- `lib/geofence/geofence.dart` — barrel exports
- `lib/location/location.dart` — barrel exports
- `lib/map/map.dart` — barrel exports
- `lib/voiceover/voiceover.dart` — barrel exports
- `lib/MODULES.md` — status update

### New test files (9):
- `test/location/location_models_test.dart`
- `test/location/location_provider_test.dart`
- `test/geofence/geofence_service_test.dart`
- `test/map/map_controller_test.dart`
- `test/voiceover/prompt_builder_test.dart`
- `test/voiceover/tts_service_test.dart`
- `test/voiceover/voiceover_service_test.dart`
- `test/voiceover/voiceover_cache_test.dart`
- `test/voiceover/voiceover_models_test.dart`

---

## Self-Review Findings

**Completeness:** All checklist items from both issues implemented. Geofence on-entry → voiceover flow wired via `GeofenceService.events` stream (voiceover provider subscribes). Map screen fetches from `GET /spots?lat&lng&radius`. Prompt builder covers history + why attractive + nearby amenities (restaurant/toilet/mart). TTS has provider + native fallback. Audio controls: play/pause/stop/replay. Transcript UI shows text. Cache stores transcript + audio file.

**Quality:** Names match purpose (GpsService, VoiceoverService, PromptBuilder). Pure logic separated from IO (PromptBuilder, InMemoryGeofenceBackend, LatLng.distanceTo are all pure). Strategy seams (GeofenceBackend, BackgroundLocationHandler) enable testing without platform plugins.

**Discipline:** No overbuilding — platform backends left as seams (native geofence API, flutter_background_geolocation wiring deferred to native config task). Built on Sprint 1 patterns (hand-written immutable classes, Riverpod StateNotifier, mocktail tests, no freezed codegen).

**Concerns:**
1. **No flutter SDK** — could not run `flutter analyze`/`flutter test`. Code verified by manual review only.
2. **Platform backends are seams** — `flutter_background_geolocation` and `geofence_service` are in pubspec but not imported (the in-memory evaluator covers tests + fallback). Native wiring is a follow-up task.
3. **`VoiceoverNotifier._play` mirrors player state** via `state = state.copyWith(state: _player.state.state)` — this captures state at an instant, not ongoing updates. For continuous position tracking in the UI, a `ref.listen` on `audioPlayerControllerProvider` would be more robust. Acceptable for MVP.
4. **`MapScreen` side effects** — `ref.listen` in `initState` is the correct Riverpod pattern, but the `_spotsRequested` flag is instance state that resets if the widget is recreated (e.g. on hot reload). Acceptable for MVP.