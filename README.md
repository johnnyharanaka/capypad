# CapyPad

CapyPad is a collaborative real-time notepad inspired by dontpad, with Obsidian-style markdown live preview, LaTeX support, image uploads, and user management. Built as a **vibecoding jam** project.

Users open a pad directly by URL path (e.g. `/my-note`), write together, and changes are persisted automatically.

## Documentation

- **How it works (study guide):** [English](docs/how-it-works.en.md) · [Português](docs/how-it-works.pt-BR.md) — a from-scratch walkthrough of the backend, frontend, and auth flows.
- **Deployment guide:** [`docs/deploy.md`](docs/deploy.md)
- **Keycloak production setup:** [`docs/keycloak-production.md`](docs/keycloak-production.md)

## Features

### Editor

- Real-time collaborative pads addressed by URL path
- Case-insensitive pad paths (normalized to lowercase)
- Auto-save with debounce
- Word and character count
- Read-only mode for unauthenticated users with login prompt overlay
- Copy pad URL to clipboard

### Markdown Live Preview

- Live rendering while editing — active cursor line stays in raw markdown
- Headings, bold, italic, underline, strikethrough, inline code
- Blockquotes, horizontal rules, links
- Text alignment (center, right, justify)
- KaTeX math rendering: inline (`$...$`) and block (`$$...$$`)

### Image Upload

- Drag-and-drop or click to upload JPEG, PNG, GIF, WebP (up to 10MB each)
- Client-side image compression (max 1920px, JPEG quality 82%)
- Content-hash deduplication — identical images are stored once
- Per-pad limits: 20 images, 50MB total
- Automatic cleanup of orphaned images when removed from content

### Export

- Download pad as PDF with full markdown, image, and LaTeX rendering

### Authentication

- Keycloak OIDC with PKCE
- Secure HttpOnly cookie-based JWT storage
- User approval workflow — new accounts require admin approval before editing

### Admin Panel

- **Users:** list, create, approve/reject, delete, search by status
- **Pads:** list all pads with metadata, search by path, delete
- **Settings:** maintenance mode, block file uploads, cleanup max age
- **Storage:** manual orphan file cleanup with freed bytes report

### Security

- Role-based access control (USER / ADMIN)
- Image content-type whitelisting + magic byte validation
- Rate limiting: 5 uploads / 60s, 120 API requests / 60s per IP
- Pad creation rate limiting: 20 new pads / hour per IP
- Pad content size limit: 256KB
- Path traversal prevention

### Infrastructure

- Automatic cleanup of pads not updated within configurable days (default: 30)
- Content-hash based file storage (SHA-256) with atomic writes
- Immutable image caching with ETags

## Tech Stack

- **Backend:** Java + Quarkus + PostgreSQL + Hibernate ORM Panache
- **Frontend:** React 19 + TypeScript + Tailwind CSS v4 + CodeMirror 6
- **Auth:** Keycloak (OIDC)
- **Deploy:** Docker Compose + reverse proxy (Nginx/Caddy)

## Repository Structure

- `backend/` — Quarkus API and persistence layer
- `frontend/` — React app and editor implementation
- `keycloak/` — Custom Keycloak login theme
- `docs/` — Study guide, deployment, and Keycloak production docs

## Quick Start (Local Development)

### Prerequisites

- Docker + Docker Compose
- Node.js 20+
- Java 21 (for local backend development outside containers)

### Option 1: Full stack with Docker Compose

```bash
cp backend/.env.example backend/.env
docker compose up -d --build
```

Services:

- Backend: http://localhost:8080
- Keycloak: http://localhost:8180/auth
- Postgres: localhost:5432

> Service ports are bound to localhost in `docker-compose.yml` to avoid accidental external exposure.

### Option 2: Dev mode

```bash
./dev.sh
```

Or manually:

```bash
cd backend && ./mvnw quarkus:dev
cd frontend && npm install && npm run dev
```

## Environment Configuration

Backend variables are loaded from `backend/.env`.

Key values:

- `QUARKUS_HTTP_PORT`
- `QUARKUS_DATASOURCE_JDBC_URL`
- `KEYCLOAK_URL`
- `CAPYPAD_FRONTEND_URL`
- `CAPYPAD_KEYCLOAK_EXTERNAL_URL`
- `CAPYPAD_OIDC_TOKEN_ISSUER`

Frontend optional:

- `frontend/.env` with `VITE_API_URL`

## Tests

Backend:

```bash
cd backend && ./mvnw test
```

Frontend:

```bash
cd frontend && npm test
```

## Deployment

- General deployment guide: [`docs/deploy.md`](docs/deploy.md)
- Keycloak production setup: [`docs/keycloak-production.md`](docs/keycloak-production.md)

## Security Notes

- Do not commit `.env` files.
- Keep backend and Keycloak ports private behind a reverse proxy in production.

## License

Apache 2.0 — see [LICENSE](LICENSE) for details.
