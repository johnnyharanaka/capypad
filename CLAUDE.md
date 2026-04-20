# CapyPad

A collaborative real-time notepad inspired by dontpad, with Obsidian-style live preview markdown, LaTeX, image/file uploads, user auth, and an admin panel. Built as a vibecoding jam project.

## Architecture

- **Backend:** Java 21 + Quarkus + PostgreSQL + Hibernate ORM Panache
- **Frontend:** React 19 + TypeScript + Tailwind CSS v4 + CodeMirror 6
- **Auth:** Keycloak (OIDC, Authorization Code + PKCE) behind an HttpOnly cookie
- **Deploy:** Docker Compose + reverse proxy (Nginx/Caddy), frontend on GitHub Pages

## Project Vision

- Users open a pad by URL path (e.g. `/my-note`) — dontpad-style.
- URLs are case-insensitive (normalized to lowercase).
- Obsidian-style live preview: markdown renders when the cursor leaves the line; raw source on the active line.
- LaTeX rendering via KaTeX (`$inline$` and `$$block$$`).
- Dark mode with system-preference detection + manual toggle (localStorage).
- Auto-save with debounce.
- Real-time sync across clients editing the same pad.
- Scheduled cleanup of pads not updated within a configurable window (default 30 days).

## Backend (`backend/`)

Package root: `com.capypad.pad`.

- **`controller/`** — JAX-RS resources:
  - `PadResource` — GET/PUT pads
  - `PadEventsResource` — SSE stream for realtime sync
  - `ImageResource` / `ImageServeResource` — upload + serve pad images
  - `FileResource` / `FileServeResource` — upload + serve pad file attachments
  - `AuthResource` — OIDC login/callback/logout via cookie
  - `AdminResource` — admin endpoints (users, pads, settings, storage cleanup)
- **`service/`** — `UserService`, `ImageStorageService`, `FileStorageService`, `PadBroadcastService` (SSE fan-out), `PadCreationLimiter`, `UploadLimitService`, `SiteSettingsService`
- **`model/`** — JPA entities: `Pad`, `PadImage`, `PadFile`, `User`, `Role`, `SiteSettings`
- **`security/`** — `CookieBearerAuthMechanism` (reads JWT from HttpOnly cookie), `CustomRoleAugmentor`, `AdminSetupMain` (one-shot CLI to create first admin)
- **`filter/`** — `ApiRateLimitFilter` (per-IP throttling), `MaintenanceFilter`
- **`job/`** — `PadCleanupJob` (scheduled)

## Frontend (`frontend/src/`)

- **`pages/`** — `Home`, `PadEditorPage`, `AdminPage`
- **`editor/`** — `PadEditor` (CodeMirror 6 wrapper), `livePreview` (custom extension), `formatting`, `imageUpload`
- **`components/`** — `actions/`, `editor/`, `feedback/`, `icons/`, `layout/`
- **`hooks/`** — `useAuth`, `useDarkMode`, `useRealtimeSync` (EventSource client)
- **`api.ts`** — typed fetch client

## Features

### Editor & Live Preview
- Real-time collaborative pads addressed by URL path
- Live markdown rendering — active cursor line stays in raw markdown
- Headings, bold, italic, underline, strikethrough, inline code, blockquotes, HR, links
- Text alignment (center, right, justify)
- KaTeX math (inline + block)
- Word and character counter
- Copy pad URL to clipboard
- Read-only mode for unauthenticated users

### Uploads
- **Images:** drag-and-drop or click, JPEG/PNG/GIF/WebP, up to 10MB each
  - Client-side compression (max 1920px, JPEG quality 82%)
  - Content-hash deduplication (SHA-256) — identical images stored once
  - Per-pad limits: 20 images, 50MB total
  - Magic-byte + content-type validation on the server
  - Automatic cleanup of orphaned images removed from content
- **Files:** generic attachments with size + total-disk limits
- Immutable caching with ETags

### Export
- Download pad as PDF with markdown, images, and LaTeX rendered (jspdf + html2canvas-pro)

### Authentication
- Keycloak OIDC with PKCE
- HttpOnly cookie-based JWT storage (no token in JS)
- User approval workflow — new accounts must be approved by an admin before editing

### Admin Panel
- **Users:** list, create, approve/reject, delete, filter by status
- **Pads:** list all pads with metadata, search by path, delete
- **Settings:** maintenance mode toggle, block uploads toggle, cleanup max-age
- **Storage:** manual orphan cleanup with freed-bytes report

### Security
- Role-based access control (`USER` / `ADMIN`)
- Image content-type whitelisting + magic-byte validation
- Rate limiting (per-IP): 5 image uploads / 60s, 120 API requests / 60s, 20 new pads / hour
- Pad content size limit: 256KB
- Path traversal prevention
- Security headers: `X-Content-Type-Options`, `X-Frame-Options: DENY`, CSP, Referrer-Policy
- Slowloris / open-socket hardening via Quarkus limits
- HTTP compression for text payloads

### Infrastructure
- Scheduled cleanup of stale pads (configurable interval + max age)
- Content-hash storage (SHA-256) with atomic writes
- Real-time broadcast via Server-Sent Events

## Testing

- **Backend:** JUnit 5 + RESTAssured
  - `PadResourceTest`, `PadCleanupTest`, `ImageUploadProtectionTest`
  - Test profile uses H2 in-memory (`drop-and-create`) with reduced limits for faster tests
- **Frontend:** Vitest + React Testing Library
  - `App.test.tsx`, `DownloadPdfButton.test.tsx`
  - `jsdom` environment

## Commands

- Run full stack locally: `./dev.sh` (starts Postgres + Keycloak in Docker, then backend + frontend)
- Backend dev: `cd backend && ./mvnw quarkus:dev`
- Frontend dev: `cd frontend && npm run dev`
- Backend tests: `cd backend && ./mvnw test`
- Frontend tests: `cd frontend && npm test`
- Full stack in containers: `docker compose up -d --build`

## Configuration

Backend env vars (loaded from `backend/.env`):

- **HTTP:** `QUARKUS_HTTP_PORT`, `QUARKUS_HTTP_CORS_ORIGINS`, `QUARKUS_HTTP_CORS_METHODS`, `QUARKUS_HTTP_CORS_HEADERS`
- **Database:** `QUARKUS_DATASOURCE_JDBC_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- **Keycloak:** `KEYCLOAK_URL`, `KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD`, `KEYCLOAK_CLIENT_SECRET`
- **OIDC / Auth URLs:** `CAPYPAD_FRONTEND_URL`, `CAPYPAD_AUTH_CALLBACK_URL`, `CAPYPAD_KEYCLOAK_EXTERNAL_URL`, `CAPYPAD_OIDC_TOKEN_ISSUER`
- **Cookies:** `CAPYPAD_AUTH_COOKIE_SECURE`, `CAPYPAD_AUTH_COOKIE_SAME_SITE`
- **App:** `CAPYPAD_CLEANUP_MAX_AGE_DAYS`, `CAPYPAD_CLEANUP_INTERVAL`, `BLOCK_IMAGE`, `MAINTENANCE_MODE`
- **Admin CLI:** `ADMIN_SETUP`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` (one-shot bootstrap)

Frontend env (`frontend/.env`):

- `VITE_API_URL` — backend base URL
- `VITE_BASE_PATH` — Vite base path (default `/`)

See [`backend/.env.example`](backend/.env.example) for the full template.

## Deployment

- General deploy guide: [`docs/deploy.md`](docs/deploy.md)
- Keycloak production setup: [`docs/keycloak-production.md`](docs/keycloak-production.md)

Frontend ships via GitHub Actions to GitHub Pages. Backend ships via GitHub Actions rsync + `docker compose` to a DigitalOcean droplet.
