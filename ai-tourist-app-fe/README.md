# AI Travel Guide — Frontend (React + TypeScript + Vite)

Location-aware AI travel guide web app. When you reach a tourist spot, the app
detects it, prompts your own AI provider key for commentary, and plays it as
audio. Includes a shared group map, geofence breach alerts, and a push-to-talk
walkie-talkie channel.

This package hosts the **React web client** that deploys to **Vercel**. The
backend lives in `../ai-tourist-app-be/`.

## Stack

- React 18 + TypeScript (strict)
- Vite 5 (build, dev server, PWA)
- React Router 6
- Zustand (state)
- Axios (HTTP), Socket.IO (real-time)
- Google Maps JavaScript API Loader
- simple-peer (WebRTC), web-push (notifications)
- crypto-js (BYOK API-key vault)
- Vitest + Testing Library (unit), Playwright (E2E)
- vite-plugin-pwa + Workbox (PWA + offline)

## Layout

```
src/
  auth/         login, signup, social login (Issue 1.3)
  location/     geolocation + visibility-based polling (Issue 3.2)
  geofence/     distance + entry detection (Issue 3.2)
  voiceover/    prompt + TTS + transcript (Issue 4.1)
  map/          Google Maps screen + markers (Issue 3.2)
  group/        create / join / leave + member list (Issue 5.3)
  walkie_talkie/ PTT + WebRTC peer (Issue 7.2)
  settings/     API-key vault + threshold (Issues 2.2, 5.3)
  realtime/     Socket.IO client (Issue 5.3)
  notification/ Web Push subscription + breach handling (Issue 6.2)
  core/         config, http client, store, logger, router
  components/   shared UI (layout, pages)
  hooks/        custom React hooks
  utils/        pure helpers
```

## Environment

Copy `.env.example` → `.env.local` and fill in:

| Variable | Required | Notes |
|---|---|---|
| `VITE_API_URL` | yes | Backend base URL, e.g. `http://localhost:4000` |
| `VITE_GOOGLE_MAPS_KEY` | yes | Browser-exposed Google Maps JS API key |
| `VITE_PUBLIC_APP_URL` | no | Used for absolute share links |
| `VITE_LOG_LEVEL` | no | `debug` \| `info` \| `warn` \| `error` |

## Scripts

```bash
npm install         # install deps
npm run dev         # vite dev server (http://localhost:5173)
npm run build       # tsc + vite build → dist/
npm run preview     # serve dist/ locally
npm run typecheck   # tsc --noEmit
npm test            # vitest run (single pass)
npm run test:watch  # vitest watch mode
npm run test:e2e    # playwright test
```

## Deployment (Vercel)

`vercel.json` configures SPA rewrites and cache headers. Set
`VITE_API_URL` and `VITE_GOOGLE_MAPS_KEY` in the Vercel project settings.

## PWA

`vite-plugin-pwa` generates `manifest.webmanifest` and `sw.js` at build time
with Workbox runtime caching (API: NetworkFirst, static assets: CacheFirst).
The offline banner in the layout is driven by `useAppStore.isOnline`.

## Security notes

- AI API keys are encrypted **client-side** with AES (see `auth/keyVault/`,
  Issue 2.2). The backend stores only ciphertext and never sees plaintext.
- `core/http.ts` strips the bearer token on a 401 but never logs it.

## Related docs

- `../specs/2026-09-22-ai-travel-guide/requirement.md`
- `../specs/2026-09-22-ai-travel-guide/design.md`
- `../specs/2026-09-22-ai-travel-guide/tasks.md`
