# CapyPad — Deployment Guide

For Keycloak hardening and realm setup in production, also read: [`keycloak-production.md`](keycloak-production.md).

## Frontend (GitHub Pages)

The frontend deploys automatically to the configured custom domain via GitHub Actions.

**How it works:**

- Push to `main` under `frontend/**` triggers `.github/workflows/deploy.yml`
- Installs deps, writes `frontend/.env.production` from the `ENV_FRONTEND` secret
- Builds the Vite app (served from `/` — see `base` in `vite.config.ts`)
- Copies `index.html` → `404.html` for SPA client-side routing
- Writes a `CNAME` file pointing to the custom domain
- Deploys the `dist/` folder to the `gh-pages` branch

**Required GitHub secrets:**

- `ENV_FRONTEND` — full contents of `frontend/.env.production` (e.g. `VITE_API_URL=https://api.yourdomain.com`)

**First-time setup:**

1. Go to the repo **Settings → Pages**
2. Set Source to **Deploy from a branch**
3. Select branch `gh-pages` / `/ (root)`
4. Under **Custom domain**, enter your domain (e.g. `capypad.yourdomain.com`) and enable **Enforce HTTPS**
5. Add a DNS `CNAME` record pointing that subdomain to `<your-gh-user>.github.io`
6. Update the `CNAME` step in `.github/workflows/deploy.yml` to match your domain

**Manual deploy:**

```bash
cd frontend
npm ci && npm run build
cp dist/index.html dist/404.html
echo "capypad.yourdomain.com" > dist/CNAME
# Push dist/ contents to gh-pages branch
```

---

## Backend (DigitalOcean Droplet)

### Prerequisites

- Droplet with Docker and Docker Compose installed
- DNS: `A` record for `api.yourdomain.com` → Droplet IP
- Reverse proxy (Nginx or Caddy) for HTTPS

### Deploy with Docker Compose

```bash
# Clone the repo on the Droplet
git clone https://github.com/johnnyharanaka/capypad.git
cd capypad

# Review/edit production env
nano backend/.env.production

# Build and start (prod overlay switches Keycloak from start-dev to start)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Check logs
docker compose logs -f backend
```

### Nginx Reverse Proxy (api.yourdomain.com)

```nginx
server {
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 10M;
    }
}
```

Then enable HTTPS with Certbot:

```bash
sudo certbot --nginx -d api.yourdomain.com
```

### Caddy Alternative (simpler)

```
api.yourdomain.com {
    reverse_proxy localhost:8080
}
```

Caddy handles HTTPS automatically.

### Update Deployment

```bash
cd capypad
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### Server Resources (memory / swap)

The stack runs on a 2 GB droplet (Postgres + Keycloak + the capypad backend, plus the
co-located capylink backend). Container memory limits in `docker-compose.yml`:

| Service   | Limit | Notes |
|-----------|-------|-------|
| postgres  | 300M  | |
| keycloak  | 768M  | the memory-hungry one; 500M OOM-kills Keycloak 26 |
| backend   | 160M  | **native (GraalVM) build** — was 350M on the JVM |

The backend is compiled to a **native executable** (built in CI with
`mvnw package -Dnative`, see `deploy-backend.yml`), so it idles at ~60–90M RSS instead of
the ~250–300M a JVM needs. Adjust the limit with `docker stats` if you change extensions.

Keycloak remains the memory-hungry one — 500M is too small for Keycloak 26 and the kernel
OOM-kills it (`CONSTRAINT_MEMCG`), which surfaces as **502 Bad Gateway** on `/auth/...`
during login while it restarts.

A swapfile is required as a safety net (the droplet ships with **no swap**). One-time setup:

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab   # persist across reboots
sysctl -w vm.swappiness=10 && echo 'vm.swappiness=10' >> /etc/sysctl.conf
```

Quick health check when auth 502s:

```bash
docker stats --no-stream                          # is keycloak near its limit?
dmesg | grep -i 'killed process'                  # cgroup OOM kills
docker inspect capypad-keycloak --format '{{.HostConfig.Memory}}'
```

### Data Persistence

- PostgreSQL data lives in the `postgres-data` Docker volume.
- Uploaded images and files live in the `capypad-data` volume (mounted at `/app/data` inside the backend container).

Both persist across container rebuilds.

To backup the database:

```bash
docker compose exec postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup.sql
```

To backup uploaded files:

```bash
docker compose exec backend tar czf /tmp/backup.tar.gz /app/data
docker compose cp backend:/tmp/backup.tar.gz ./backup.tar.gz
```
