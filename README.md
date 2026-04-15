# CapyPad

CapyPad is a collaborative real-time notepad inspired by dontpad, with Obsidian-style markdown live preview and LaTeX support.

Users open a pad directly by URL path (for example `/my-note`), write together in real time, and changes are persisted automatically.

## Features

- Real-time collaborative pads addressed by URL path
- Case-insensitive pad paths (normalized to lowercase)
- Live markdown preview that keeps the active cursor line editable in raw markdown
- KaTeX math rendering for inline (`$...$`) and block (`$$...$$`) formulas
- Image upload and serving API
- Dark mode with system preference detection and manual toggle
- Auto-save with debounce
- Automatic cleanup of stale pads

## Tech Stack

- Backend: Java + Quarkus + PostgreSQL (production) + Hibernate ORM Panache
- Frontend: React + TypeScript + Tailwind CSS + CodeMirror 6
- Authentication: Keycloak (OIDC)
- Optional deploy stack: Docker Compose + reverse proxy (Nginx/Caddy)

## Repository Structure

- `backend/`: Quarkus API and persistence layer
- `frontend/`: React app and editor implementation
- `keycloak/`: Custom Keycloak login theme
- `docs/`: Additional deployment and Keycloak production docs

## Quick Start (Local Development)

### Prerequisites

- Docker + Docker Compose
- Node.js 20+
- Java 21 (for local backend development outside containers)

### Option 1: Start full stack with Docker Compose

```bash
cp backend/.env.example backend/.env
docker compose up -d --build
```

Services:

- Backend: http://localhost:8080
- Keycloak: http://localhost:8180/auth
- Postgres: localhost:5432

Note: service ports are bound to localhost in `docker-compose.yml` to avoid accidental external exposure.

### Option 2: Run frontend and backend in dev mode

Use the helper script:

```bash
./dev.sh
```

Or run each side manually:

```bash
cd backend && ./mvnw quarkus:dev
cd frontend && npm install && npm run dev
```

## Environment Configuration

Backend variables are loaded from `backend/.env`.

Important values:

- `QUARKUS_HTTP_PORT`
- `QUARKUS_DATASOURCE_JDBC_URL`
- `KEYCLOAK_URL`
- `CAPYPAD_FRONTEND_URL`
- `CAPYPAD_KEYCLOAK_EXTERNAL_URL`
- `CAPYPAD_OIDC_TOKEN_ISSUER`

Frontend optional environment:

- `frontend/.env` with `VITE_API_URL`

## Tests

Backend:

```bash
cd backend
./mvnw test
```

Frontend:

```bash
cd frontend
npm test
```

## Deployment

- General deployment guide: `DEPLOY.md`
- Keycloak production setup: `docs/keycloak-production.md`

## Security Notes

- Do not commit `.env` files.
- Do not commit private keys (for example `privateKey.pem`).
- `kc_token.txt` is ignored and must never be tracked.
- Keep backend and Keycloak ports private behind a reverse proxy in production.

## License

MIT
