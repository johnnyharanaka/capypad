# CapyPad

A collaborative real-time notepad inspired by dontpad, with support for command-based formatting (LaTeX-style). Think dontpad but more elegant.

## Architecture

- **Backend:** Java with Quarkus
- **Frontend:** React

## Project Vision

- Users access a pad via URL path (e.g., `/my-note`) — just like dontpad
- Content supports command-based formatting (LaTeX-style syntax — to be defined incrementally)
- Clean, elegant UI

## Tech Stack

### Backend (Java + Quarkus)
- REST API (or WebSocket for real-time sync)
- Quarkus framework
- H2 database (file-based, embedded) with Hibernate ORM Panache

### Frontend (React + TypeScript + Tailwind CSS)
- SPA that renders pad content
- TypeScript for type safety
- Tailwind CSS for styling
- Command/formatting engine (LaTeX-style — scope TBD)

## Testing

- Backend: JUnit 5 + RESTAssured (Quarkus default)
- Frontend: Vitest + React Testing Library

## Commands

- Run all: `./dev.sh`
- Build backend: `cd backend && ./mvnw quarkus:dev`
- Build frontend: `cd frontend && npm run dev`
- Test backend: `cd backend && ./mvnw test`
- Test frontend: `cd frontend && npm test`
