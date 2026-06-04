# Como o CapyPad funciona (guia de estudo)

> 🇧🇷 Português · 🇺🇸 [English version](how-it-works.en.md)

Este documento explica **como o backend e o frontend funcionam por dentro**, pensado pra
quem quer estudar o projeto. Ele assume zero contexto e vai do quadro geral até os fluxos
principais, sempre apontando os arquivos reais do código.

---

## 1. Visão geral

CapyPad é um **bloco de notas colaborativo em tempo real**. Você abre uma URL
(ex: `capypad.eiji.dev/minha-nota`), edita markdown com preview ao vivo, e as mudanças
sincronizam entre quem estiver na mesma nota.

São **três peças que rodam separadas**:

```
┌─────────────────┐     HTTPS      ┌──────────────────┐
│  Frontend (SPA) │ ─────────────▶ │  Backend (API)   │
│  React + Vite   │ ◀───────────── │  Quarkus/Java    │
│  GitHub Pages   │   JSON + SSE   │  no droplet      │
└─────────────────┘                └────────┬─────────┘
        │                                    │
        │ redirect de login                  │ JDBC
        ▼                                    ▼
┌─────────────────┐                ┌──────────────────┐
│    Keycloak     │                │   PostgreSQL     │
│  (login OIDC)   │                │  (dados)         │
└─────────────────┘                └──────────────────┘
```

- **Frontend** — app estático (React) servido pelo GitHub Pages. Não tem servidor próprio;
  conversa com o backend por HTTP.
- **Backend** — API em Java/Quarkus rodando em container no droplet. Dono dos dados e das regras.
- **Keycloak** — servidor de identidade (login). O backend delega autenticação a ele.
- **PostgreSQL** — banco de dados.

> Em produção, frontend e backend ficam em domínios diferentes (`capypad.eiji.dev` e
> `api.eiji.dev`) — por isso o CORS e os cookies precisam de cuidado (ver seção 6).

---

## 2. Backend

### 2.1 Stack

- **Java 21 + Quarkus** — framework web (parecido com Spring, mas mais leve e rápido pra subir).
- **Hibernate ORM com Panache** — mapeia classes Java ↔ tabelas do banco. O padrão "Active Record":
  a própria entidade tem métodos como `Pad.findByPath(...)` e `pad.persist()`.
- **PostgreSQL** — banco relacional.
- **JAX-RS (Jakarta REST)** — define os endpoints HTTP com anotações (`@GET`, `@Path`, etc).

### 2.2 As camadas

O código vive em [backend/src/main/java/com/capypad/pad/](backend/src/main/java/com/capypad/pad/)
e é dividido por responsabilidade:

| Pasta | O que faz | Exemplo |
|---|---|---|
| `controller/` | Recebe requisições HTTP, valida entrada, devolve resposta | [PadResource.java](backend/src/main/java/com/capypad/pad/controller/PadResource.java) |
| `service/` | Regras de negócio reutilizáveis | [UserService.java](backend/src/main/java/com/capypad/pad/service/UserService.java) |
| `model/` | Entidades JPA (tabelas do banco) | [Pad.java](backend/src/main/java/com/capypad/pad/model/Pad.java) |
| `dto/` | Objetos de transporte (o JSON que entra/sai) | [PadDto.java](backend/src/main/java/com/capypad/pad/dto/PadDto.java) |
| `security/` | Autenticação e papéis | [CookieBearerAuthMechanism.java](backend/src/main/java/com/capypad/pad/security/CookieBearerAuthMechanism.java) |
| `filter/` | Interceptadores (rate limit, manutenção) | [ApiRateLimitFilter.java](backend/src/main/java/com/capypad/pad/filter/ApiRateLimitFilter.java) |
| `job/` | Tarefas agendadas | [PadCleanupJob.java](backend/src/main/java/com/capypad/pad/job/PadCleanupJob.java) |

**Por que separar?** O controller cuida do "HTTP" (status, headers), o service cuida da
"lógica", o model cuida do "banco". Isso deixa cada parte testável e fácil de achar.

### 2.3 O ciclo de uma requisição

Quando chega um `PUT /api/pad/minha-nota`:

1. **Filtros** rodam antes ([ApiRateLimitFilter](backend/src/main/java/com/capypad/pad/filter/ApiRateLimitFilter.java)
   limita req/IP; [MaintenanceFilter](backend/src/main/java/com/capypad/pad/filter/MaintenanceFilter.java)
   bloqueia em modo manutenção).
2. **Autenticação** — se houver cookie de sessão, o
   [CookieBearerAuthMechanism](backend/src/main/java/com/capypad/pad/security/CookieBearerAuthMechanism.java)
   lê o JWT do cookie e identifica o usuário.
3. **Controller** ([PadResource.put](backend/src/main/java/com/capypad/pad/controller/PadResource.java))
   valida o path, aplica regras e salva.
4. **Resposta** volta como JSON.

### 2.4 Fluxo central: salvar um pad

O coração do app é [PadResource.put()](backend/src/main/java/com/capypad/pad/controller/PadResource.java).
Acompanhe a lógica:

- **Normaliza o path** pra minúsculas e valida (só letras/números/`.`/`-`/`_`, evita `..`
  contra path traversal).
- **Checa manutenção** — se ligado, devolve 503.
- **Anônimo vs logado** — se não está logado, o conteúdo passa pelo
  [AnonymousContentSanitizer](backend/src/main/java/com/capypad/pad/service/AnonymousContentSanitizer.java)
  (remove coisas perigosas).
- **Limite de tamanho** — conteúdo acima de 256KB → 413.
- **"Claim" do pad** — se um usuário registrado já "reivindicou" a nota (`claimedBy`),
  anônimos não podem mais editar. Quem cria/edita logado vira o dono.
- **Rate limit de criação** — pads novos por IP são limitados ([PadCreationLimiter](backend/src/main/java/com/capypad/pad/service/PadCreationLimiter.java)).
- **Limpa imagens órfãs** — varre o markdown procurando referências `\image[...]`; imagens
  que não aparecem mais no texto são apagadas do disco e do banco.
- **Broadcast** — avisa os outros clientes conectados (próxima seção).

### 2.5 Tempo real (Server-Sent Events)

A sincronização usa **SSE** — um canal HTTP onde o servidor empurra eventos pro cliente
(mais simples que WebSocket, unidirecional).

- O cliente abre `GET /api/pad/{path}/events`
  ([PadEventsResource](backend/src/main/java/com/capypad/pad/controller/PadEventsResource.java)),
  passando um `clientId` único.
- O [PadBroadcastService](backend/src/main/java/com/capypad/pad/service/PadBroadcastService.java)
  guarda os "inscritos" por pad.
- Quando alguém salva, o `PadResource.put` chama `broadcaster.publish(path, clientId, dto)`.
  O broadcaster manda o conteúdo novo pra **todos os inscritos daquele pad, menos quem originou
  a mudança** (por isso o `X-Client-Id` — você não recebe de volta o seu próprio eco).

### 2.6 Uploads (imagens e arquivos)

- [ImageResource](backend/src/main/java/com/capypad/pad/controller/ImageResource.java) recebe o
  upload; [ImageStorageService](backend/src/main/java/com/capypad/pad/service/ImageStorageService.java)
  valida (magic bytes + content-type), faz **dedupe por hash SHA-256** (imagens idênticas são
  guardadas uma vez só) e grava em disco de forma atômica.
- [ImageServeResource](backend/src/main/java/com/capypad/pad/controller/ImageServeResource.java)
  serve a imagem com cache forte (ETag).
- Arquivos genéricos seguem o mesmo padrão (`FileResource` / `FileServeResource`).

### 2.7 Autenticação (resumo — detalhe na seção 6)

- O login é via **Keycloak (OIDC + PKCE)**. O backend orquestra o fluxo em
  [AuthResource](backend/src/main/java/com/capypad/pad/controller/AuthResource.java).
- O token JWT fica num **cookie HttpOnly** (o JS nunca vê o token → mais seguro contra XSS).
- Papéis (`USER`/`ADMIN`) são resolvidos pelo
  [CustomRoleAugmentor](backend/src/main/java/com/capypad/pad/security/CustomRoleAugmentor.java).

### 2.8 Admin, limpeza e configurações

- [AdminResource](backend/src/main/java/com/capypad/pad/controller/AdminResource.java) — endpoints
  protegidos por `@RolesAllowed("ADMIN")`: gerenciar usuários, pads e configurações do site.
- [PadCleanupJob](backend/src/main/java/com/capypad/pad/job/PadCleanupJob.java) — roda agendado
  (`@Scheduled`) e apaga pads velhos (TTL configurável).
- [SiteSettingsService](backend/src/main/java/com/capypad/pad/service/SiteSettingsService.java) —
  flags globais (manutenção, bloquear upload, idade de limpeza).

---

## 3. Frontend

### 3.1 Stack

- **React 19 + TypeScript** — UI baseada em componentes.
- **Vite** — bundler/dev server (rápido, com hot reload).
- **Tailwind CSS v4** — estilização por classes utilitárias.
- **CodeMirror 6** — o editor de texto (o "miolo" da experiência de digitar).

### 3.2 Estrutura

O código vive em [frontend/src/](frontend/src/):

| Pasta/arquivo | O que faz |
|---|---|
| [main.tsx](frontend/src/main.tsx) | Ponto de entrada; monta o React |
| [App.tsx](frontend/src/App.tsx) | Decide qual página renderizar |
| `pages/` | Telas: [Home](frontend/src/pages/Home.tsx), [PadEditorPage](frontend/src/pages/PadEditorPage.tsx), [AdminPage](frontend/src/pages/AdminPage.tsx) |
| `editor/` | O editor CodeMirror e suas extensões |
| `components/` | Peças de UI reutilizáveis (botões, ícones, layout) |
| `hooks/` | Lógica reutilizável com estado (auth, dark mode, sync) |
| [api.ts](frontend/src/api.ts) | Cliente HTTP tipado pra falar com o backend |

### 3.3 Como "hooks" organizam a lógica

Um **hook** é uma função React que encapsula estado + efeitos. Os três centrais:

- [useAuth](frontend/src/hooks/useAuth.ts) — sabe se você está logado, faz login/logout e
  **renova a sessão automaticamente** (ver seção 6).
- [useRealtimeSync](frontend/src/hooks/useRealtimeSync.ts) — abre um `EventSource` pro endpoint
  SSE e aplica as mudanças que chegam de outros clientes.
- [useDarkMode](frontend/src/hooks/useDarkMode.ts) — tema claro/escuro (detecta preferência do
  sistema + toggle manual salvo no `localStorage`).

### 3.4 O editor e o "live preview"

A experiência estilo Obsidian vive em [frontend/src/editor/](frontend/src/editor/):

- [PadEditor.tsx](frontend/src/editor/PadEditor.tsx) — embrulha o CodeMirror em um componente React.
- [livePreview.ts](frontend/src/editor/livePreview.ts) — extensão custom: renderiza o markdown
  (negrito, títulos, LaTeX, imagens…) **exceto na linha onde o cursor está**, que mostra o
  markdown cru pra você editar.
- [formatting.ts](frontend/src/editor/formatting.ts) — atalhos de formatação.
- [imageUpload.ts](frontend/src/editor/imageUpload.ts) — colar/arrastar imagem dispara o upload.

### 3.5 Auto-save

Quando você digita, o frontend espera você parar (**debounce**) e então manda
`PUT /api/pad/{path}` via [api.ts](frontend/src/api.ts). O [SaveIndicator](frontend/src/components/feedback/SaveIndicator.tsx)
mostra "salvando…/salvo".

---

## 4. Um fluxo de ponta a ponta: digitar e ver no outro navegador

1. Você digita na aba A → CodeMirror atualiza → após o debounce, `api.ts` faz `PUT /api/pad/nota`
   com header `X-Client-Id: A`.
2. Backend salva ([PadResource.put](backend/src/main/java/com/capypad/pad/controller/PadResource.java))
   e chama `broadcaster.publish("nota", "A", dto)`.
3. O [PadBroadcastService](backend/src/main/java/com/capypad/pad/service/PadBroadcastService.java)
   empurra um evento SSE pra **todos os inscritos de "nota", menos A**.
4. Na aba B, o [useRealtimeSync](frontend/src/hooks/useRealtimeSync.ts) (que tinha um `EventSource`
   aberto em `/api/pad/nota/events`) recebe o evento e atualiza o editor.

Resultado: a aba B vê a mudança quase instantaneamente, e a aba A não recebe um eco do próprio
texto (graças ao `X-Client-Id`).

---

## 5. Autenticação em detalhe (OIDC + cookie + refresh)

Este é o fluxo mais sofisticado do projeto. Vale entender bem.

### 5.1 Login (Authorization Code + PKCE)

1. Frontend chama `GET /api/auth/login` → backend gera um `code_verifier`/`code_challenge`
   (PKCE), guarda num cookie temporário e devolve a URL do Keycloak.
2. Navegador vai pro Keycloak, usuário faz login lá.
3. Keycloak redireciona de volta pra `GET /api/auth/callback` com um `code`.
4. Backend troca o `code` por tokens (access + refresh + id) — ver
   [UserService.exchangeCodeForToken](backend/src/main/java/com/capypad/pad/service/UserService.java).
5. Backend grava os tokens em **cookies HttpOnly** e manda você de volta pro frontend.

### 5.2 Por que cookie HttpOnly?

O token nunca fica acessível ao JavaScript → mesmo se houver um XSS, o atacante não rouba o
token. O [CookieBearerAuthMechanism](backend/src/main/java/com/capypad/pad/security/CookieBearerAuthMechanism.java)
lê o JWT do cookie em cada request e entrega pro Quarkus validar.

### 5.3 Renovação automática (refresh)

O access token do Keycloak expira rápido (~5 min). Pra você não ser deslogado o tempo todo:

- O `GET /api/auth/me` devolve o `expiresAt` do token.
- O [useAuth](frontend/src/hooks/useAuth.ts) **agenda uma renovação proativa** antes de expirar,
  chamando `POST /api/auth/refresh`, que usa o refresh token pra pegar um access novo.
- Se você volta depois do token já ter expirado, o `useAuth` tenta um refresh silencioso antes
  de deslogar.

> O limite final é a **sessão SSO do Keycloak** (idle/max), configurada no realm — não no código.

---

## 6. Detalhes de produção que afetam o comportamento

- **CORS** — frontend e backend ficam em domínios diferentes, então o backend precisa permitir
  a origem do frontend e `allow-credentials=true` (pros cookies). Ver
  [application.properties](backend/src/main/resources/application.properties).
- **Reverse proxy (nginx)** no droplet roteia por path: `/api/links*` → capylink, o resto →
  capypad, `/auth/*` → Keycloak. Ver [docs/deploy.md](docs/deploy.md).
- **Memória** — o Keycloak é guloso; há um limite de memória e swap no servidor (também em
  [docs/deploy.md](docs/deploy.md)).

---

## 7. Rodando localmente

```bash
./dev.sh                       # sobe Postgres + Keycloak (Docker) e backend + frontend
# ou separado:
cd backend  && ./mvnw quarkus:dev   # backend em :8080 (Dev UI em /q/dev)
cd frontend && npm run dev          # frontend em :5173 (proxy /api → :8080)
```

Testes:

```bash
cd backend  && ./mvnw test     # JUnit + RESTAssured
cd frontend && npm test        # Vitest + Testing Library
```

---

## 8. Por onde começar a ler o código

Sugestão de ordem pra estudar:

1. [PadResource.java](backend/src/main/java/com/capypad/pad/controller/PadResource.java) — entenda
   o fluxo principal (salvar/ler um pad).
2. [Pad.java](backend/src/main/java/com/capypad/pad/model/Pad.java) — veja como uma entidade Panache é.
3. [PadEditorPage.tsx](frontend/src/pages/PadEditorPage.tsx) + [useRealtimeSync.ts](frontend/src/hooks/useRealtimeSync.ts)
   — o lado do cliente do mesmo fluxo.
4. [AuthResource.java](backend/src/main/java/com/capypad/pad/controller/AuthResource.java) +
   [useAuth.ts](frontend/src/hooks/useAuth.ts) — o fluxo de login completo.
5. [livePreview.ts](frontend/src/editor/livePreview.ts) — a "mágica" do preview ao vivo.
