# CapyPad — Deployment Guide

## Frontend (GitHub Pages)

The frontend deploys automatically to `eiji.dev/capypad` via GitHub Actions.

**How it works:**
- Push to `main` triggers `.github/workflows/deploy.yml`
- Builds the Vite app with `base: /capypad/`
- Deploys the `dist/` folder to the `gh-pages` branch
- GitHub Pages serves it at `eiji.dev/capypad`

**First-time setup:**
1. Go to the repo **Settings → Pages**
2. Set Source to **Deploy from a branch**
3. Select branch `gh-pages` / `/ (root)`
4. If using custom domain `eiji.dev`, ensure the CNAME is configured on `johnnyharanaka.github.io`

**Manual deploy:**
```bash
cd frontend
npm ci && npm run build
cp dist/index.html dist/404.html
# Push dist/ contents to gh-pages branch
```

---

## Backend (DigitalOcean Droplet)

### Prerequisites
- Droplet with Docker and Docker Compose installed
- DNS: `A` record for `api.eiji.dev` → Droplet IP
- Reverse proxy (Nginx or Caddy) for HTTPS

### Deploy with Docker Compose

```bash
# Clone the repo on the Droplet
git clone https://github.com/johnnyharanaka/capypad.git
cd capypad

# Review/edit production env
nano backend/.env.production

# Build and start
docker compose up -d --build

# Check logs
docker compose logs -f backend
```

### Nginx Reverse Proxy (api.eiji.dev)

```nginx
server {
    server_name api.eiji.dev;

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
sudo certbot --nginx -d api.eiji.dev
```

### Caddy Alternative (simpler)

```
api.eiji.dev {
    reverse_proxy localhost:8080
}
```

Caddy handles HTTPS automatically.

### Update Deployment

```bash
cd capypad
git pull
docker compose up -d --build
```

### Data Persistence

The H2 database and uploaded images are stored in a Docker volume (`capypad-data`), so data persists across container rebuilds.

To backup:
```bash
docker compose exec backend tar czf /tmp/backup.tar.gz /app/data
docker compose cp backend:/tmp/backup.tar.gz ./backup.tar.gz
```
