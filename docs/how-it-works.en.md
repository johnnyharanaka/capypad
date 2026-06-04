# How CapyPad works (study guide)

> 🇺🇸 English · 🇧🇷 [Versão em português](how-it-works.pt-BR.md)

This document explains **how the backend and frontend work internally**, written for someone
studying the project. It assumes no prior context and goes from the big picture down to the main
flows, always pointing at the real source files.

---

## 1. Big picture

CapyPad is a **real-time collaborative notepad**. You open a URL
(e.g. `capypad.eiji.dev/my-note`), edit markdown with live preview, and changes sync between
everyone on the same note.

There are **three pieces running separately**:

```
┌─────────────────┐     HTTPS      ┌──────────────────┐
│  Frontend (SPA) │ ─────────────▶ │  Backend (API)   │
│  React + Vite   │ ◀───────────── │  Quarkus/Java    │
│  GitHub Pages   │   JSON + SSE   │  on the droplet  │
└─────────────────┘                └────────┬─────────┘
        │                                    │
        │ login redirect                     │ JDBC
        ▼                                    ▼
┌─────────────────┐                ┌──────────────────┐
│    Keycloak     │                │   PostgreSQL     │
│  (OIDC login)   │                │  (data)          │
└─────────────────┘                └──────────────────┘
```

- **Frontend** — a static React app served by GitHub Pages. It has no server of its own; it talks
  to the backend over HTTP.
- **Backend** — a Java/Quarkus API running in a container on the droplet. Owner of the data and rules.
- **Keycloak** — identity server (login). The backend delegates authentication to it.
- **PostgreSQL** — the database.

> In production, frontend and backend live on different domains (`capypad.eiji.dev` and
> `api.eiji.dev`) — that's why CORS and cookies need care (see section 6).

---

## 2. Backend

### 2.1 Stack

- **Java 21 + Quarkus** — web framework (like Spring, but lighter and faster to boot).
- **Hibernate ORM with Panache** — maps Java classes ↔ database tables. It uses the "Active
  Record" pattern: the entity itself has methods like `Pad.findByPath(...)` and `pad.persist()`.
- **PostgreSQL** — relational database.
- **JAX-RS (Jakarta REST)** — declares HTTP endpoints with annotations (`@GET`, `@Path`, etc).

### 2.2 The layers

The code lives in [backend/src/main/java/com/capypad/pad/](backend/src/main/java/com/capypad/pad/)
and is split by responsibility:

| Folder | What it does | Example |
|---|---|---|
| `controller/` | Receives HTTP requests, validates input, returns responses | [PadResource.java](backend/src/main/java/com/capypad/pad/controller/PadResource.java) |
| `service/` | Reusable business logic | [UserService.java](backend/src/main/java/com/capypad/pad/service/UserService.java) |
| `model/` | JPA entities (database tables) | [Pad.java](backend/src/main/java/com/capypad/pad/model/Pad.java) |
| `dto/` | Transport objects (the JSON in/out) | [PadDto.java](backend/src/main/java/com/capypad/pad/dto/PadDto.java) |
| `security/` | Authentication and roles | [CookieBearerAuthMechanism.java](backend/src/main/java/com/capypad/pad/security/CookieBearerAuthMechanism.java) |
| `filter/` | Interceptors (rate limit, maintenance) | [ApiRateLimitFilter.java](backend/src/main/java/com/capypad/pad/filter/ApiRateLimitFilter.java) |
| `job/` | Scheduled tasks | [PadCleanupJob.java](backend/src/main/java/com/capypad/pad/job/PadCleanupJob.java) |

**Why split it?** The controller handles "HTTP" (status, headers), the service handles "logic",
the model handles "the database". This keeps each part testable and easy to find.

### 2.3 The lifecycle of a request

When a `PUT /api/pad/my-note` comes in:

1. **Filters** run first ([ApiRateLimitFilter](backend/src/main/java/com/capypad/pad/filter/ApiRateLimitFilter.java)
   throttles requests/IP; [MaintenanceFilter](backend/src/main/java/com/capypad/pad/filter/MaintenanceFilter.java)
   blocks during maintenance mode).
2. **Authentication** — if a session cookie is present, the
   [CookieBearerAuthMechanism](backend/src/main/java/com/capypad/pad/security/CookieBearerAuthMechanism.java)
   reads the JWT from the cookie and identifies the user.
3. **Controller** ([PadResource.put](backend/src/main/java/com/capypad/pad/controller/PadResource.java))
   validates the path, applies the rules and saves.
4. **Response** goes back as JSON.

### 2.4 Core flow: saving a pad

The heart of the app is [PadResource.put()](backend/src/main/java/com/capypad/pad/controller/PadResource.java).
Follow the logic:

- **Normalizes the path** to lowercase and validates it (only letters/digits/`.`/`-`/`_`, blocks
  `..` against path traversal).
- **Checks maintenance** — if on, returns 503.
- **Anonymous vs logged-in** — if not logged in, the content goes through the
  [AnonymousContentSanitizer](backend/src/main/java/com/capypad/pad/service/AnonymousContentSanitizer.java)
  (strips dangerous things).
- **Size limit** — content above 256KB → 413.
- **Pad "claim"** — once a registered user has "claimed" a note (`claimedBy`), anonymous users
  can no longer edit it. Whoever creates/edits while logged in becomes the owner.
- **Creation rate limit** — new pads per IP are limited ([PadCreationLimiter](backend/src/main/java/com/capypad/pad/service/PadCreationLimiter.java)).
- **Orphan image cleanup** — scans the markdown for `\image[...]` references; images no longer
  present in the text are deleted from disk and the database.
- **Broadcast** — notifies other connected clients (next section).

### 2.5 Real-time (Server-Sent Events)

Syncing uses **SSE** — an HTTP channel where the server pushes events to the client (simpler than
WebSocket, one-directional).

- The client opens `GET /api/pad/{path}/events`
  ([PadEventsResource](backend/src/main/java/com/capypad/pad/controller/PadEventsResource.java)),
  passing a unique `clientId`.
- The [PadBroadcastService](backend/src/main/java/com/capypad/pad/service/PadBroadcastService.java)
  keeps the "subscribers" per pad.
- When someone saves, `PadResource.put` calls `broadcaster.publish(path, clientId, dto)`. The
  broadcaster pushes the new content to **every subscriber of that pad except the one who made the
  change** (that's what `X-Client-Id` is for — you don't get your own echo back).

### 2.6 Uploads (images and files)

- [ImageResource](backend/src/main/java/com/capypad/pad/controller/ImageResource.java) receives the
  upload; [ImageStorageService](backend/src/main/java/com/capypad/pad/service/ImageStorageService.java)
  validates it (magic bytes + content-type), does **SHA-256 hash dedupe** (identical images are
  stored once) and writes to disk atomically.
- [ImageServeResource](backend/src/main/java/com/capypad/pad/controller/ImageServeResource.java)
  serves the image with strong caching (ETag).
- Generic files follow the same pattern (`FileResource` / `FileServeResource`).

### 2.7 Authentication (summary — details in section 5)

- Login goes through **Keycloak (OIDC + PKCE)**. The backend orchestrates the flow in
  [AuthResource](backend/src/main/java/com/capypad/pad/controller/AuthResource.java).
- The JWT lives in an **HttpOnly cookie** (JS never sees the token → safer against XSS).
- Roles (`USER`/`ADMIN`) are resolved by the
  [CustomRoleAugmentor](backend/src/main/java/com/capypad/pad/security/CustomRoleAugmentor.java).

### 2.8 Admin, cleanup and settings

- [AdminResource](backend/src/main/java/com/capypad/pad/controller/AdminResource.java) — endpoints
  protected by `@RolesAllowed("ADMIN")`: manage users, pads and site settings.
- [PadCleanupJob](backend/src/main/java/com/capypad/pad/job/PadCleanupJob.java) — runs on a schedule
  (`@Scheduled`) and deletes stale pads (configurable TTL).
- [SiteSettingsService](backend/src/main/java/com/capypad/pad/service/SiteSettingsService.java) —
  global flags (maintenance, block uploads, cleanup age).

---

## 3. Frontend

### 3.1 Stack

- **React 19 + TypeScript** — component-based UI.
- **Vite** — bundler/dev server (fast, with hot reload).
- **Tailwind CSS v4** — utility-class styling.
- **CodeMirror 6** — the text editor (the core of the typing experience).

### 3.2 Structure

The code lives in [frontend/src/](frontend/src/):

| Folder/file | What it does |
|---|---|
| [main.tsx](frontend/src/main.tsx) | Entry point; mounts React |
| [App.tsx](frontend/src/App.tsx) | Decides which page to render |
| `pages/` | Screens: [Home](frontend/src/pages/Home.tsx), [PadEditorPage](frontend/src/pages/PadEditorPage.tsx), [AdminPage](frontend/src/pages/AdminPage.tsx) |
| `editor/` | The CodeMirror editor and its extensions |
| `components/` | Reusable UI pieces (buttons, icons, layout) |
| `hooks/` | Reusable stateful logic (auth, dark mode, sync) |
| [api.ts](frontend/src/api.ts) | Typed HTTP client to talk to the backend |

### 3.3 How "hooks" organize logic

A **hook** is a React function that wraps state + side effects. The three central ones:

- [useAuth](frontend/src/hooks/useAuth.ts) — knows whether you're logged in, does login/logout and
  **refreshes the session automatically** (see section 5).
- [useRealtimeSync](frontend/src/hooks/useRealtimeSync.ts) — opens an `EventSource` to the SSE
  endpoint and applies changes coming from other clients.
- [useDarkMode](frontend/src/hooks/useDarkMode.ts) — light/dark theme (detects system preference +
  manual toggle saved in `localStorage`).

### 3.4 The editor and "live preview"

The Obsidian-style experience lives in [frontend/src/editor/](frontend/src/editor/):

- [PadEditor.tsx](frontend/src/editor/PadEditor.tsx) — wraps CodeMirror in a React component.
- [livePreview.ts](frontend/src/editor/livePreview.ts) — custom extension: renders the markdown
  (bold, headings, LaTeX, images…) **except on the line where the cursor is**, which shows raw
  markdown so you can edit it.
- [formatting.ts](frontend/src/editor/formatting.ts) — formatting shortcuts.
- [imageUpload.ts](frontend/src/editor/imageUpload.ts) — paste/drag an image triggers the upload.

### 3.5 Auto-save

As you type, the frontend waits for you to stop (**debounce**) and then sends
`PUT /api/pad/{path}` via [api.ts](frontend/src/api.ts). The [SaveIndicator](frontend/src/components/feedback/SaveIndicator.tsx)
shows "saving…/saved".

---

## 4. An end-to-end flow: typing and seeing it in another browser

1. You type in tab A → CodeMirror updates → after the debounce, `api.ts` does `PUT /api/pad/note`
   with header `X-Client-Id: A`.
2. Backend saves ([PadResource.put](backend/src/main/java/com/capypad/pad/controller/PadResource.java))
   and calls `broadcaster.publish("note", "A", dto)`.
3. The [PadBroadcastService](backend/src/main/java/com/capypad/pad/service/PadBroadcastService.java)
   pushes an SSE event to **all subscribers of "note" except A**.
4. In tab B, [useRealtimeSync](frontend/src/hooks/useRealtimeSync.ts) (which had an `EventSource`
   open on `/api/pad/note/events`) receives the event and updates the editor.

Result: tab B sees the change almost instantly, and tab A doesn't get an echo of its own text
(thanks to `X-Client-Id`).

---

## 5. Authentication in detail (OIDC + cookie + refresh)

This is the most sophisticated flow in the project. Worth understanding well.

### 5.1 Login (Authorization Code + PKCE)

1. Frontend calls `GET /api/auth/login` → backend generates a `code_verifier`/`code_challenge`
   (PKCE), stores it in a temporary cookie and returns the Keycloak URL.
2. Browser goes to Keycloak, the user logs in there.
3. Keycloak redirects back to `GET /api/auth/callback` with a `code`.
4. Backend exchanges the `code` for tokens (access + refresh + id) — see
   [UserService.exchangeCodeForToken](backend/src/main/java/com/capypad/pad/service/UserService.java).
5. Backend stores the tokens in **HttpOnly cookies** and sends you back to the frontend.

### 5.2 Why HttpOnly cookies?

The token is never accessible to JavaScript → even if there's an XSS, the attacker can't steal the
token. The [CookieBearerAuthMechanism](backend/src/main/java/com/capypad/pad/security/CookieBearerAuthMechanism.java)
reads the JWT from the cookie on every request and hands it to Quarkus to validate.

### 5.3 Automatic renewal (refresh)

Keycloak's access token expires quickly (~5 min). So you're not logged out constantly:

- `GET /api/auth/me` returns the token's `expiresAt`.
- [useAuth](frontend/src/hooks/useAuth.ts) **schedules a proactive renewal** before it expires,
  calling `POST /api/auth/refresh`, which uses the refresh token to get a new access token.
- If you come back after the token already expired, `useAuth` tries a silent refresh before
  logging you out.

> The final ceiling is the **Keycloak SSO session** (idle/max), configured in the realm — not in
> the code.

---

## 6. Production details that affect behavior

- **CORS** — frontend and backend live on different domains, so the backend must allow the
  frontend origin and `allow-credentials=true` (for the cookies). See
  [application.properties](backend/src/main/resources/application.properties).
- **Reverse proxy (nginx)** on the droplet routes by path: `/api/links*` → capylink, the rest →
  capypad, `/auth/*` → Keycloak. See [docs/deploy.md](docs/deploy.md).
- **Memory** — Keycloak is memory-hungry; there's a container memory limit and swap on the server
  (also in [docs/deploy.md](docs/deploy.md)).

---

## 7. Running locally

```bash
./dev.sh                       # starts Postgres + Keycloak (Docker) and backend + frontend
# or separately:
cd backend  && ./mvnw quarkus:dev   # backend on :8080 (Dev UI at /q/dev)
cd frontend && npm run dev          # frontend on :5173 (proxies /api → :8080)
```

Tests:

```bash
cd backend  && ./mvnw test     # JUnit + RESTAssured
cd frontend && npm test        # Vitest + Testing Library
```

---

## 8. Where to start reading the code

A suggested order for studying:

1. [PadResource.java](backend/src/main/java/com/capypad/pad/controller/PadResource.java) — understand
   the core flow (save/read a pad).
2. [Pad.java](backend/src/main/java/com/capypad/pad/model/Pad.java) — see what a Panache entity looks like.
3. [PadEditorPage.tsx](frontend/src/pages/PadEditorPage.tsx) + [useRealtimeSync.ts](frontend/src/hooks/useRealtimeSync.ts)
   — the client side of the same flow.
4. [AuthResource.java](backend/src/main/java/com/capypad/pad/controller/AuthResource.java) +
   [useAuth.ts](frontend/src/hooks/useAuth.ts) — the full login flow.
5. [livePreview.ts](frontend/src/editor/livePreview.ts) — the "magic" of live preview.
```
