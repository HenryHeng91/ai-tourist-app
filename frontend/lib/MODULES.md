# Flutter module placeholders

Each subdirectory of `lib/` corresponds to a bounded context from `design.md §3.1`.
Sprint 1 implements `auth`, `core`, `settings`, `widgets`. The remaining
directories are stubs that will be filled in later sprints — they each
contain a `module.dart` barrel file declaring the module's public surface
as a placeholder so imports don't break.

| Module | Sprint | Status |
|--------|--------|--------|
| `auth` | 1 | ✅ login/signup/JWT/interceptor |
| `core` | 1 | ✅ config, theme, router, http, storage, home shell |
| `settings` | 1 | ✅ API key vault (AES-256-GCM) + settings screen |
| `widgets` | 1 | ✅ shared widgets (AppLogo) |
| `location` | 2 | ⏳ GPS + background tracking |
| `geofence` | 2 | ⏳ geofence registration + entry events |
| `voiceover` | 2 | ⏳ prompt builder + AI call + TTS |
| `map` | 2 | ⏳ Google Maps rendering |
| `group` | 3 | ⏳ group CRUD + member list |
| `realtime` | 3 | ⏳ WebSocket client for location pings |
| `walkie_talkie` | 4 | ⏳ PTT + WebRTC peer connection |
| `notification` | 3 | ⏳ FCM/APNs token reg + breach handling |