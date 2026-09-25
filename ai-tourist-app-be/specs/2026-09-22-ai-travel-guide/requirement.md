# Requirement — AI Travel Guide (Flutter)

**Project:** ai-tourist-app
**Platform:** Flutter (iOS + Android)
**Date:** 2026-09-22
**Status:** Draft

---

## 1. Overview

A location-aware AI travel guide mobile app. When the user arrives at a tourist spot, the app auto-detects the location and prompts an AI to deliver a voiceover describing the place — its history, why it's attractive, and nearby amenities (restaurants, toilets, marts). Users bring their own AI API key so token costs bill to their own account, not the app's.

The app also supports group travel: members appear on a shared map with live positions, a geofence alerts the group if anyone strays >10km, and a push-to-talk walkie-talkie enables hands-free group voice chat.

## 2. Stakeholders & Goals

| Stakeholder | Goal |
|-------------|------|
| Tourist (primary user) | Get rich, hands-free audio commentary at tourist spots without paying a human guide |
| Group organizer | Keep the group together and connected while touring |
| App operator | Run the service without central LLM token cost (BYOK model) |

## 3. Functional Requirements

### 3.1 Authentication & Onboarding
- **REQ-AUTH-1**: The system SHALL allow a user to sign up and log in (email + password, and social login).
- **REQ-AUTH-2**: The system SHALL let each user store their own AI provider API key (OpenAI-compatible) encrypted at rest.
- **REQ-AUTH-3**: The system SHALL validate the user-supplied API key before accepting it.
- **REQ-AUTH-4**: The system SHALL NEVER use a central/app-owned LLM key for per-user inference; all inference SHALL use the user's stored key.

### 3.2 Location & Geofencing
- **REQ-LOC-1**: The system SHALL request and use device GPS to detect the user's current location.
- **REQ-LOC-2**: The system SHALL maintain a database/registry of known tourist spots (lat/lng + metadata).
- **REQ-LOC-3**: When the user enters a geofence radius around a tourist spot, the system SHALL trigger the AI voiceover flow.
- **REQ-LOC-4**: The system SHALL continue tracking location in the background while the app is active.

### 3.3 AI Voiceover
- **REQ-AI-1**: On tourist-spot arrival, the system SHALL call the user's AI provider with a prompt requesting: history of the place, why it is attractive, and nearby useful amenities (restaurants, toilets, marts).
- **REQ-AI-2**: The system SHALL convert the AI text response to speech (TTS) and play it as audio.
- **REQ-AI-3**: The system SHALL allow the user to replay, pause, and stop the voiceover.
- **REQ-AI-4**: The system SHALL show a text transcript of the voiceover on screen.
- **REQ-AI-5**: All AI calls SHALL be billed to the user's own API key (per REQ-AUTH-4).

### 3.4 Group Management
- **REQ-GRP-1**: The system SHALL allow a user to create a group and invite members.
- **REQ-GRP-2**: The system SHALL allow a user to accept a group invite and join.
- **REQ-GRP-3**: The system SHALL display each group member's profile picture on a shared map at their live location.
- **REQ-GRP-4**: The system SHALL update member positions on the map in near real-time (WebSocket).
- **REQ-GRP-5**: The system SHALL detect when a group member moves more than 10 km away from the group centroid (or from other members) and send a push notification to the other members.
- **REQ-GRP-6**: The 10 km threshold SHALL be configurable per group.

### 3.5 Walkie-Talkie (Push-to-Talk)
- **REQ-WT-1**: When a group exists, the system SHALL enable a push-to-talk walkie-talkie channel for group members.
- **REQ-WT-2**: The system SHALL transmit voice audio between members in real-time (WebRTC or streaming audio).
- **REQ-WT-3**: The system SHALL support half-duplex operation (one speaker at a time) with a "floor" indicator showing who is speaking.
- **REQ-WT-4**: The system SHALL work over cellular and Wi-Fi.

### 3.6 Home Screen
- **REQ-UI-1**: The system SHALL provide a home screen showing the user's current location on a map.
- **REQ-UI-2**: The home screen SHALL show nearby tourist spots as map markers.
- **REQ-UI-3**: The home screen SHALL provide access to group management and settings (API key, threshold).

## 4. Non-Functional Requirements

- **NFR-PERF-1**: Location updates SHALL be transmitted to group members within 2 seconds.
- **NFR-PERF-2**: Voiceover playback SHALL begin within 5 seconds of tourist-spot detection.
- **NFR-SEC-1**: User AI API keys SHALL be encrypted at rest (AES-256) and never logged or transmitted to the app operator.
- **NFR-SEC-2**: All API and WebSocket traffic SHALL use TLS.
- **NFR-REL-1**: The app SHALL degrade gracefully when offline — cached voiceovers and maps remain available.
- **NFR-PRIV-1**: Location data SHALL only be shared with group members the user has explicitly joined; never public.
- **NFR-BAT-1**: Background location tracking SHALL use significant-location-change APIs to minimize battery drain.

## 5. Constraints

- **CON-1**: Frontend MUST be Flutter (Dart) — single codebase for iOS + Android.
- **CON-2**: No central LLM token spend — BYOK only.
- **CON-3**: Tourist spot registry: seed with a curated dataset; allow future expansion.

## 6. Out of Scope (MVP)

- Multi-language voiceover (English first; i18n later)
- Offline-first AI inference (on-device LLM)
- Monetization / paid plans
- Admin web dashboard
- Tourist spot user-generated content / reviews

## 7. Dependencies

- Map SDK (Google Maps / Mapbox) for Flutter
- AI provider (OpenAI-compatible API, user-supplied key)
- TTS service (platform-native or AI provider)
- Push notification service (FCM + APNs)
- Real-time backend (WebSocket for location; WebRTC or streaming for voice)
- Auth backend (OAuth2 / JWT)

## 8. Open Questions

1. Which map SDK — Google Maps vs Mapbox vs OpenStreetMap? (cost + license)
2. WebRTC vs server-relayed audio for walkie-talkie? (WebRTC = lower latency, P2P; server = simpler, more reliable on restrictive networks)
3. Tourist spot data source — curated JSON seed, or integrate an existing POI API (e.g., Google Places, Wikidata)?
4. Social login providers — Google, Apple, both?
5. TTS — use the user's AI provider TTS endpoint, or platform-native TTS (free, lower quality)?