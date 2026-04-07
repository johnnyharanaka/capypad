# CapyPad

A collaborative real-time notepad inspired by dontpad, with Obsidian-style live preview markdown editing and LaTeX support. Think dontpad but more elegant.

## Architecture

- **Backend:** Java with Quarkus
- **Frontend:** React + TypeScript + Tailwind CSS

## Project Vision

- Users access a pad via URL path (e.g., `/my-note`) — just like dontpad
- URLs are case-insensitive (normalized to lowercase)
- Obsidian-style live preview: markdown renders when cursor leaves the line, raw markdown shown on cursor line
- LaTeX formula rendering via KaTeX (`$inline$` and `$$block$$`)
- Dark mode with system preference detection + manual toggle
- Auto-save with 1s debounce
- Auto-cleanup of pads not updated in 30 days

## Tech Stack

### Backend (Java + Quarkus)
- REST API: GET/PUT `/api/pad/{path}`
- Quarkus framework with Scheduler
- H2 database (file-based, embedded) with Hibernate ORM Panache
- Scheduled cleanup job (configurable via .env)

### Frontend (React + TypeScript + Tailwind CSS)
- CodeMirror 6 editor with custom live preview extension
- KaTeX for LaTeX formula rendering
- Three.js (react-three-fiber) animated network background on home page
- Tailwind CSS v4 for styling
- Dark/light mode with localStorage persistence

## Features

- **Home page:** Logo with gradient, typewriter animated placeholder, Three.js network background
- **Editor:** Backdrop-blur glass header, word/char counter, copy URL button, save indicator (spinner → checkmark)
- **Live preview:** Headings, bold, italic, inline code, links, blockquotes, horizontal rules, LaTeX math
- **Persistence:** H2 file-based DB, auto-save, env-configurable cleanup

## Testing

- Backend: JUnit 5 + RESTAssured (4 tests — API + cleanup)
- Frontend: Vitest + React Testing Library (4 tests — home + editor)
- Test DB: H2 in-memory with drop-and-create

## Commands

- Run all: `./dev.sh`
- Build backend: `cd backend && ./mvnw quarkus:dev`
- Build frontend: `cd frontend && npm run dev`
- Test backend: `cd backend && ./mvnw test`
- Test frontend: `cd frontend && npm test`

## Configuration

Backend `.env`:
- `QUARKUS_HTTP_PORT` — server port (default: 8080)
- `QUARKUS_HTTP_CORS_ORIGINS` — allowed CORS origins
- `QUARKUS_DATASOURCE_JDBC_URL` — H2 database URL
- `CAPYPAD_CLEANUP_MAX_AGE_DAYS` — days before pad cleanup (default: 30)
- `CAPYPAD_CLEANUP_INTERVAL` — cleanup job interval (default: 24h)

Frontend `.env`:
- `VITE_API_URL` — backend API URL
