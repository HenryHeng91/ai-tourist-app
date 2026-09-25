# AI Tourist App - Project Memory

**Last Updated:** 2026-09-25
**Sprint Completed:** Sprint 1
**Commit:** `6dbc01e`

---

## Project Overview

**Project Name:** AI Tourist App
**Repository:** https://github.com/HenryHeng91/ai-tourist-app
**Owner:** HenryHeng91

### Purpose
Mobile travel companion app with AI-powered voice-guided tours, group sharing, geofencing triggers, and walkie-talkie communication.

### Tech Stack
- **Frontend:** React + Vite + TypeScript (PWA)
- **Backend:** Node.js + Express + TypeScript
- **Database:** PostgreSQL + PostGIS
- **Cache:** Redis
- **State:** Zustand
- **Testing:** Vitest + Jest + Testing Library

---

## Architecture

### Project Structure
```
ai-tourist-app/
├── ai-tourist-app-fe/      # React frontend (main)
├── ai-tourist-app-be/      # Express backend (main)
├── ai-tourist-app/         # Flutter prototype (legacy)
├── .github/workflows/       # CI/CD pipelines
├── .agents/                # SDLC agentic pipeline skills
└── specs/                  # Project specifications
```

### Frontend Architecture (`ai-tourist-app-fe/`)
- **Framework:** React 18 + Vite + TypeScript
- **Routing:** React Router v6
- **State:** Zustand with localStorage persistence
- **HTTP:** Axios with interceptors for JWT refresh
- **Styling:** CSS with CSS variables for theming
- **PWA:** Service worker with workbox
- **Build:** 241 KB JS / 81 KB gzip

### Backend Architecture (`ai-tourist-app-be/backend/`)
- **Framework:** Express + TypeScript
- **Database:** PostgreSQL via `pg` library
- **Cache:** Redis via `ioredis`
- **Validation:** Zod schemas
- **Auth:** JWT (15m access / 7d refresh) + bcrypt (cost 12)
- **Docker:** docker-compose with Postgres + Redis

---

## Sprint 1 Completed (2026-09-25)

### Tasks Completed

| Issue | Task | Status | Tests |
|-------|------|--------|-------|
| #22 | [1.1] React App Scaffold | ✅ | 14 |
| #23 | [1.2] Backend Scaffold | ✅ | 102 |
| #24 | [1.3] Auth | ✅ | 154 BE + 143 FE |
| #25 | [2.1] Key Vault Backend | ✅ | 119 |
| #26 | [2.2] Key Vault Client | ✅ | 90 |

**Total Tests:** 622 passing

### Key Implementations

#### Frontend Features
1. **Auth UI**
   - `AuthPage` with login/signup tabs
   - Email/password validation with ARIA errors
   - Zustand `useAuthStore` with localStorage persistence
   - `bootstrapAuth()` on app load
   - Google OAuth stub

2. **Key Vault UI**
   - AES-256-GCM encryption via Web Crypto API
   - PBKDF2-SHA256 key derivation (100k iterations)
   - `AddKeyModal` for adding encrypted keys
   - `MyKeysPage` for viewing/validating/deleting keys
   - Route `/keys` with nav link

3. **HTTP Client**
   - Axios interceptor for bearer token attachment
   - Single-flight 401 refresh with retry flag
   - `/auth/*` endpoints opt out of refresh

#### Backend Features
1. **Auth Endpoints**
   - `POST /auth/signup` (+ `/register` alias)
   - `POST /auth/login`
   - `POST /auth/refresh` (rotation + family revocation)
   - `POST /auth/logout`
   - `GET /auth/me`

2. **Key Vault Endpoints**
   - `POST /keys/:id` - Store encrypted key
   - `GET /keys/:id` - Retrieve encrypted key
   - `DELETE /keys/:id` - Remove key
   - `POST /keys/:id/validate` - Validate with provider (10/min rate limit)

3. **Security**
   - Server never decrypts ciphertext (enforced at schema/service/test layers)
   - Plaintext zeroed via `fill(0)` after use
   - Rate limiting on validate endpoint

---

## Security Considerations

### Sensitive Files (.gitignore'd)
- `.env` files
- Credentials JSON
- Private keys (.pem, .crt, .key)
- Database files (.sqlite, .db)

### .env.example Templates
Created for both frontend and backend:
- `ai-tourist-app-fe/.env.example`
- `ai-tourist-app-be/backend/.env.example`

### BYOK Security Model
- Plaintext API keys encrypted client-side with user's passphrase
- Server stores only ciphertext + IV + authTag
- Validation happens client-side (key sent directly to provider)
- Plaintext never touches server

---

## Database Migrations

Located in `ai-tourist-app-be/backend/src/migrations/`:
- `001_init.up.sql` - Users, spots tables
- `002_poi_columns.up.sql` - POI metadata columns
- `003_push_subscription.up.sql` - Push notification subscriptions
- `004_refresh_tokens.up.sql` - JWT refresh token management with family revocation

---

## Remaining Work (Epics 3-8)

### Epic 3: Location + Geofencing
| Issue | Task |
|-------|------|
| #27 | [3.1] Tourist Spot Registry (backend) |
| #28 | [3.2] Location + Geofence Client (frontend) |

### Epic 4: AI Voiceover
| Issue | Task |
|-------|------|
| #29 | [4.1] AI Voiceover Client (frontend) |

### Epic 5: Groups
| Issue | Task |
|-------|------|
| #30 | [5.1] Group Service (backend) |
| #31 | [5.2] Location Broadcast (backend, WebSocket) |
| #32 | [5.3] Group Client (frontend) |

### Epic 6: Notifications
| Issue | Task |
|-------|------|
| #33 | [6.1] Notification Service (backend) |
| #34 | [6.2] Notification Client (frontend) |

### Epic 7: Walkie-Talkie
| Issue | Task |
|-------|------|
| #35 | [7.1] Voice Relay (LiveKit SFU) (backend) |
| #36 | [7.2] Walkie-Talkie Client (frontend) |

### Epic 8: Testing & Hardening
| Issue | Task |
|-------|------|
| #37 | [8.1] Home Screen (frontend) |
| #38 | [8.2] Testing & Hardening |

---

## Development Workflow

### SDLC Agentic Pipeline
The project uses a multi-agent SDLC pipeline with these agents:
1. **PM Agent** - Requirements, task breakdown
2. **Backend Agent** - Server-side implementation
3. **Frontend Agent** - Client-side implementation
4. **Code Reviewer** - Quality gates
5. **Tester** - Test coverage
6. **DevOps** - CI/CD, deployment
7. **Architect** - Design decisions
8. **Figma Design** - UI/UX

### Quality Gates
All tasks must pass:
1. TypeScript compilation (`npm run typecheck`)
2. Unit tests (`npm test`)
3. Linting (`npm run lint`)
4. Build (`npm run build`)

### Branch Strategy
- `feature/backend/sprintN-group` - Backend work
- `feature/frontend/sprintN-group` - Frontend work
- `main` - Production-ready code

---

## Known Issues / Follow-up Items

1. **Key Vault Endpoint Path Mismatch**
   - Frontend may use different paths than backend
   - Needs coordination between FE/BE agents

2. **Salt Key Placeholder**
   - Currently using placeholder for user salt
   - Should switch to real `userId` after Auth ships

3. **unlockKey No-op**
   - Feature incomplete until Epic 4
   - Key unlocking not yet implemented

4. **Demo Folder**
   - Contains Windows reserved name file (`nul`)
   - Cannot be removed from Windows
   - Gitignored but can't be deleted

---

## Testing Commands

### Frontend
```bash
cd ai-tourist-app-fe
npm install
npm run typecheck
npm test
npm run lint
npm run build
```

### Backend
```bash
cd ai-tourist-app-be/backend
npm install
docker-compose up -d  # Start Postgres + Redis
npm run migrate         # Run migrations
npm test
npm run lint
npm run build
```

---

## Environment Setup

### Frontend (.env)
```
VITE_API_URL=http://localhost:3000/api
VITE_WS_URL=ws://localhost:3000
VITE_GOOGLE_MAPS_KEY=<your_key>
```

### Backend (.env)
```
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/ai_tourist_app
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=<32+ char secret>
JWT_REFRESH_SECRET=<32+ char secret>
ENCRYPTION_MASTER_KEY=<32 byte hex>
```

---

## Contact & Context

- **Owner:** HenryHeng91
- **Repo:** https://github.com/HenryHeng91/ai-tourist-app
- **CI/CD:** GitHub Actions (`.github/workflows/ci-cd.yml`)
- **Issues:** 38 total, 5 closed (Sprint 1), 33 remaining
