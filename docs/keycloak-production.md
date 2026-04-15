# Keycloak Production Setup

Guide for configuring Keycloak for CapyPad in a production environment (Droplet/VPS).

---

## 1. Docker Compose

In `docker-compose.yml`, the Keycloak service should be configured for production:

```yaml
keycloak:
  image: quay.io/keycloak/keycloak:latest
  container_name: capypad-keycloak
  restart: unless-stopped
  command: start # use "start" in production (not "start-dev")
  env_file:
    - ./backend/.env
  environment:
    KC_DB: postgres
    KC_DB_URL: jdbc:postgresql://postgres:5432/capypad
    KC_HTTP_ENABLED: "true"
    KC_HTTP_RELATIVE_PATH: /auth
    KC_PROXY_HEADERS: "xforwarded"
    KC_HOSTNAME: "yourdomain.com"
    KC_HOSTNAME_PATH: /auth
    KC_HOSTNAME_STRICT: "false"
    KC_HOSTNAME_STRICT_HTTPS: "false" # set true if TLS terminates at Keycloak
  volumes:
    - ./keycloak/themes/capypad:/opt/keycloak/themes/capypad
  ports:
    - "127.0.0.1:8180:8080" # keep private; expose through reverse proxy only
  networks:
    - capypad-net
  depends_on:
    - postgres
```

Key production difference vs development: use `start` instead of `start-dev`.

---

## 2. Nginx Reverse Proxy

Keycloak runs internally on port 8180, and Nginx exposes it through HTTPS:

```nginx
# /etc/nginx/sites-available/capypad

server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Keycloak
    location /auth/ {
        proxy_pass http://127.0.0.1:8180;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_busy_buffers_size 256k;
    }

    # Frontend (if served from same server)
    location / {
        root /var/www/capypad;
        try_files $uri $uri/ /index.html;
    }
}
```

---

## 3. Production Environment Variables (`backend/.env`)

```env
# PostgreSQL
POSTGRES_USER=capypad_prd
POSTGRES_PASSWORD=<strong-generated-password>
POSTGRES_DB=capypad
KC_DB_USERNAME=capypad_prd
KC_DB_PASSWORD=<strong-generated-password>

# Keycloak Admin
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=<strong-generated-password>

# URLs
KEYCLOAK_URL=http://keycloak:8080
CAPYPAD_FRONTEND_URL=https://yourdomain.com
CAPYPAD_AUTH_CALLBACK_URL=https://yourdomain.com/api/auth/callback
CAPYPAD_KEYCLOAK_EXTERNAL_URL=https://yourdomain.com/auth
CAPYPAD_OIDC_TOKEN_ISSUER=https://yourdomain.com/auth/realms/capypad

# Client secret (from Keycloak admin console)
KEYCLOAK_CLIENT_SECRET=<client-secret>

# Secure cookie settings
CAPYPAD_AUTH_COOKIE_SECURE=true
CAPYPAD_AUTH_COOKIE_SAME_SITE=Lax
```

Notes:

- `KEYCLOAK_URL` uses the internal Docker hostname (`keycloak:8080`).
- `CAPYPAD_KEYCLOAK_EXTERNAL_URL` uses the public URL that browsers access.
- `CAPYPAD_OIDC_TOKEN_ISSUER` must match the token `iss` claim exactly.

---

## 4. Realm Configuration in Keycloak

Open `https://yourdomain.com/auth/admin` and sign in with the admin account.

### 4.1 Create Realm

1. Open realm dropdown (top-left) and click **Create Realm**
2. Name: `capypad`
3. Save

### 4.2 Create Client

1. Go to **Clients** and click **Create client**
2. **Client ID:** `backend-api`
3. Turn **Client authentication** on (confidential)
4. In authentication flow, keep only **Standard flow** (Authorization Code)
5. Configure:
   - **Valid Redirect URIs:** `https://yourdomain.com/api/auth/callback`
   - **Web Origins:** `https://yourdomain.com`
   - **Valid Post Logout Redirect URIs:** `https://yourdomain.com/*`
6. Save
7. Open **Credentials**, copy **Client secret**, and set it as `KEYCLOAK_CLIENT_SECRET` in `.env`

### 4.3 Create Realm Roles

1. Open **Realm roles** and click **Create role**
2. Create:
   - `USER`
   - `ADMIN`

### 4.4 Enable Self Registration (Optional)

1. Open **Realm Settings** -> **Login**
2. Enable **User registration**
3. Save

### 4.5 Select Theme

1. Open **Realm Settings** -> **Themes**
2. Set **Login theme** to `capypad`
3. Save

### 4.6 Configure Email (Optional, Recommended)

1. Open **Realm Settings** -> **Email**
2. Configure SMTP provider (Gmail, SES, Mailgun, etc.)
3. Save and send a test email

---

## 5. Create the First Admin

With Keycloak and Postgres running, run backend setup mode:

```bash
docker compose run --rm \
  -e ADMIN_SETUP=true \
  -e ADMIN_USERNAME=youradmin \
  -e ADMIN_PASSWORD='your-strong-password' \
  -e QUARKUS_HTTP_PORT=8180 \
  backend
```

This creates the first admin user in a temporary container and exits.

---

## 6. Security Checklist

- [ ] Use `start` instead of `start-dev` for Keycloak
- [ ] Keep Keycloak bound to `127.0.0.1` only
- [ ] Enable HTTPS with a valid certificate (Let's Encrypt)
- [ ] Set `CAPYPAD_AUTH_COOKIE_SECURE=true`
- [ ] Use strong passwords for Postgres, Keycloak admin, and client secret
- [ ] Keep redirect URIs exact (avoid broad wildcards)
- [ ] Disable `ADMIN_SETUP` after creating the first admin
- [ ] Block direct external access to ports 8080 and 8180 at firewall level
- [ ] Configure PostgreSQL backups
