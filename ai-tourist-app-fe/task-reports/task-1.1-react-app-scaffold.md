# Task 1.1 — React App Scaffold (FE)

**Issue:** #22 — [1.1] React App Scaffold
**Date:** 2026-09-25
**Owner:** frontend-agent
**Sub-tasks:** 1.1.1 → 1.1.5
**Status:** DONE_WITH_CONCERNS

---

## What I implemented

### 1.1.1 — Vite + React + TypeScript scaffold
- Scaffolded via `npx create-vite@latest --template react-ts` into a temp
  folder, then merged the contents into the existing `ai-tourist-app-fe/`
  directory (which already hosts the Flutter app under `frontend/`).
- **Downgraded from the Vite template's defaults** to stable React 18
  (`^18.3.1`) + TypeScript 5.6 (`~5.6.3`). The current template default
  (React 19.2 + TS 6.0) is bleeding-edge and would risk CI dependency
  resolution. Documented in `README.md` and `package.json` `description`.
- Strict TypeScript is enforced: `strict`, `noImplicitAny`,
  `strictNullChecks`, `noUncheckedIndexedAccess`, `noImplicitOverride`,
  `noUnusedLocals/Parameters`, `noFallthroughCasesInSwitch`.

### 1.1.2 — Module directory structure
Created `src/{auth, location, geofence, voiceover, map, group,
walkie_talkie, settings, realtime, notification, core, components, hooks,
utils, test}`. Each module ships with a barrel `index.ts` documenting
its responsibility and which Issue wires the real implementation
(Epic 2–7). This keeps the structure ready for follow-up tasks without
overbuilding.

Additional file (`src/geofence/geo.ts`) ships the **haversine distance +
radius check** helpers now because they're pure math — they're already
needed by 3.2.3 and are fully tested, saving that work later.

### 1.1.3 — Core dependencies
All requested packages installed (`npm ls` shows exact resolved
versions):
- `axios@1.20.0`
- `socket.io-client@4.8.3`
- `@googlemaps/js-api-loader@1.16.10`
- `crypto-js@4.2.0` *(see Concern #1 — npm warns deprecation; pinning to
  requested version because the task spec explicitly lists it)*
- `zustand@4.5.7`
- `react-router-dom@6.30.6`
- `simple-peer@9.11.1`
- `web-push@3.6.7`

Testing stack: `vitest@2.1.9`, `@testing-library/react@16.3.3`,
`@testing-library/user-event@14.6.7`, `@testing-library/jest-dom@6.9.1`,
`jsdom@25.0.1`, `@vitest/coverage-v8@2.1.9`.

E2E: `@playwright/test@1.63.0` with a `playwright.config.ts` and a smoke
spec at `e2e/smoke.spec.ts`.

Build tooling: `vite@5.4.21`, `@vitejs/plugin-react@4.7.0`,
`vite-plugin-pwa@0.20.5` (Workbox runtime caching).

### 1.1.4 — Vercel deployment
- `vercel.json` with:
  - `framework: "vite"`
  - SPA rewrite → `/index.html`
  - Long-cache headers for `/assets/*`
  - Service-worker cache headers (`Service-Worker-Allowed: /`)
  - Manifest content-type header
- `.env.example` documents `VITE_API_URL`, `VITE_GOOGLE_MAPS_KEY`,
  optional `VITE_PUBLIC_APP_URL` and `VITE_LOG_LEVEL`.
- A typed `core/config.ts` reads env vars with safe defaults
  (`VITE_API_URL` falls back to `http://localhost:4000`, Maps key is
  optional at boot and surfaces a runtime error on first map load).

### 1.1.5 — Theme + base routing + PWA
- `src/theme.css` exposes CSS custom properties for the design tokens
  (colors, spacing, typography, radius, shadow) plus light/dark
  auto-switch via `prefers-color-scheme`. Inter is the default font;
  Roboto/Segoe UI as system fallbacks.
- `src/core/router.tsx` defines base routes:
  - `/` → redirects to `/home`
  - `/auth` (placeholder login — real flow in 1.3)
  - `/home`, `/settings`, `/group` (protected by `ProtectedRoute`)
  - `*` → `NotFoundPage`
- `src/components/AppLayout.tsx` is the persistent shell: brand, primary
  nav, offline banner wired to `useAppStore.isOnline`.
- `src/components/HomePage.tsx`, `src/settings/SettingsPage.tsx`,
  `src/group/GroupPage.tsx`, `src/auth/AuthPage.tsx` are honest
  placeholders explaining which Epic fills them in.
- PWA configuration via `vite-plugin-pwa`:
  - `manifest.webmanifest` (verified in `dist/`)
  - `sw.js` + Workbox runtime caching (NetworkFirst for `/api`, CacheFirst
    for static assets, navigate fallback `/index.html`, denylist `/api/`)
  - SVG icon set in `public/` (`favicon.svg`, `pwa-192x192.svg`,
    `pwa-512x512.svg`) — SVG chosen over PNG to avoid committing binary
    assets; modern browsers accept SVG PWA icons.

### Bonus
- `core/store.ts` (Zustand) holds the minimal app-level state (online
  status, auth-token presence) and listens to `online`/`offline`
  window events.
- `core/http.ts` is a shared Axios instance with bearer-token
  interceptor + 401 auto-logout. Never logs the token.
- `core/logger.ts` is a tiny scoped logger that respects a
  `VITE_LOG_LEVEL` env var.
- `core/ProtectedRoute.tsx` gates authenticated routes.
- `auth/store.ts` (Zustand) holds the placeholder auth session.

---

## What I tested and test results

```
npm run typecheck  →  pass (0 errors)
npm test           →  14/14 passing, output pristine
                       src/geofence/geo.test.ts       (6 tests)
                       src/core/config.test.ts        (6 tests)
                       src/components/AppLayout.test.tsx  (2 tests)
npm run build      →  dist/ generated (172 KB JS, 56.5 KB gzip)
                       manifest.webmanifest, sw.js, workbox-*.js emitted
npm run test:e2e   →  1/1 passing
                       e2e/smoke.spec.ts: redirects unauthenticated → /auth
```

### Test breakdown

`src/geofence/geo.test.ts` — haversine + radius helpers (used by Issue 3.2):
- identical points → 0 m
- London ↔ Paris distance within 340–350 km tolerance
- symmetry `d(a,b) === d(b,a)`
- in/out of radius check (Tokyo Tower vicinity)
- invalid radii rejected

`src/core/config.test.ts` — appConfig invariants:
- frozen object
- apiUrl always defined (env or default), trailing slash stripped
- missing Maps key doesn't crash boot
- appVersion/isProduction are primitives

`src/components/AppLayout.test.tsx` — shell layout:
- brand + 3 nav links render
- offline banner appears when store reports offline

`e2e/smoke.spec.ts` — full-stack:
- `/home` redirects unauthenticated user to `/auth`
- heading "Sign in to AI Travel Guide" visible

---

## Files changed / created

```
ai-tourist-app-fe/
  package.json                      (rewritten: pinned deps, scripts)
  tsconfig.json, tsconfig.app.json, tsconfig.node.json
                                   (strict TS enabled, Vite/React types)
  vite.config.ts                    (PWA + Vitest config in one file)
  vercel.json                       (NEW — SPA rewrites, cache headers)
  .env.example                      (NEW — env template)
  .gitignore                        (rewritten — coverage, .vite cache)
  index.html                        (PWA meta tags + manifest link)
  playwright.config.ts              (NEW — E2E config)
  README.md                         (rewritten — usage, env, layout)
  public/
    favicon.svg, pwa-192x192.svg, pwa-512x512.svg  (NEW)
  e2e/
    smoke.spec.ts                   (NEW)
  src/
    main.tsx                        (BrowserRouter + future flags)
    theme.css                       (NEW — design tokens + utility classes)
    test/setup.ts                   (NEW — jest-dom matchers)
    core/
      config.ts, http.ts, store.ts, logger.ts, router.tsx,
      ProtectedRoute.tsx, index.ts, config.test.ts  (NEW)
    auth/
      store.ts, AuthPage.tsx, index.ts                (NEW)
    components/
      AppLayout.tsx, HomePage.tsx, NotFoundPage.tsx,
      index.ts, AppLayout.test.tsx                    (NEW)
    settings/SettingsPage.tsx, index.ts              (NEW)
    group/GroupPage.tsx, index.ts                    (NEW)
    geofence/geo.ts, geo.test.ts, index.ts           (NEW — helpers used later)
    location/, voiceover/, map/, walkie_talkie/,
    realtime/, notification/, hooks/, utils/
      index.ts                                       (NEW — module docs)
```

---

## Concerns

1. **`crypto-js` is officially deprecated.** The task explicitly lists it
   and the auth vault design (§8.1 of `design.md`) relies on
   AES-256-GCM. npm emits a deprecation warning at install. Options for
   later sprints:
   - Migrate to the Web Crypto API (`crypto.subtle`) — zero deps, modern,
     audit-friendly.
   - Migrate to `@noble/ciphers` — actively maintained.
   For Issue 1.1 (scaffold) I pinned the requested version; please call
   out a preference at the start of Issue 2.2.

2. **Vite template's default stack is React 19 + TypeScript 6.** I
   downgraded to React 18 + TS 5.6 because TS 6 / React 19 are not
   widely battle-tested in CI environments and several dependencies
   (e.g. `vite-plugin-pwa`) pin to React 18 peer ranges. If the team
   wants the bleeding-edge stack, we should bump together with a peer
   review of each plugin.

3. **PWA icons are SVG, not PNG.** Browsers support SVG PWA icons but a
   few legacy install flows expect PNG. If we want first-class iOS
   "Add to Home Screen" support, generate PNGs (e.g. via
   `vite-plugin-pwa`'s built-in generator or `sharp`) in a follow-up.

4. **`ai-tourist-app-fe/` already contains a Flutter app** under
   `frontend/`. To avoid clobbering it, the React project sits at the
   root of `ai-tourist-app-fe/` while the Flutter project lives in
   `frontend/`. This matches the existing `.github/workflows/ci-cd.yml`
   which already runs `npm install / npm test / npm run build` from the
   `ai-tourist-app-fe/` root. The Flutter subproject has its own pubspec
   and is unaffected.

5. **No commits made.** The user-facing task did not explicitly ask to
   commit, and the parent prompt says "Only create commits when
   requested by the user". All changes are uncommitted in the working
   tree and ready for review.

---

## Self-review

- **Completeness:** All 5 sub-tasks covered. Modules exist with
  documented intent; no implementation is missing per the task brief.
- **Quality:** Strict TS, no `any`, no unused locals. Frozen config,
  scoped logger, no token-logging. Barrel exports make module
  boundaries explicit.
- **Discipline:** Did not implement features owned by later Issues
  (login flow, geofence engine, key vault, real PWA assets, etc.).
- **Testing:** All tests verify behavior, not implementation. API is
  mocked via a real Zustand store, not internal jest.fn.

---

## Verification commands

```bash
cd ai-tourist-app-fe
npm install          # 540 packages installed in ~2 min
npm run typecheck    # 0 errors
npm test             # 14/14 pass, ~1.3 s
npm run build        # dist/ generated with PWA artefacts
npm run test:e2e     # 1/1 pass (smoke: redirect to /auth)
```
