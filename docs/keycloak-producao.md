# Configurando Keycloak em Producao

Guia para configurar o Keycloak no CapyPad em ambiente de producao (Droplet/VPS).

---

## 1. Docker Compose

No `docker-compose.yml`, o servico do Keycloak precisa de ajustes para producao:

```yaml
keycloak:
  image: quay.io/keycloak/keycloak:latest
  container_name: capypad-keycloak
  restart: unless-stopped
  command: start # "start" em prd (nao "start-dev")
  env_file:
    - ./backend/.env
  environment:
    KC_DB: postgres
    KC_DB_URL: jdbc:postgresql://postgres:5432/capypad
    KC_HTTP_ENABLED: "true"
    KC_HTTP_RELATIVE_PATH: /auth
    KC_PROXY_HEADERS: "xforwarded"
    KC_HOSTNAME: "seudominio.com" # dominio publico
    KC_HOSTNAME_PATH: /auth
    KC_HOSTNAME_STRICT: "false"
    KC_HOSTNAME_STRICT_HTTPS: "false" # true se tiver HTTPS direto no KC
  volumes:
    - ./keycloak/themes/capypad:/opt/keycloak/themes/capypad
  ports:
    - "127.0.0.1:8180:8080" # expor apenas em localhost (nginx faz o proxy)
  networks:
    - capypad-net
  depends_on:
    - postgres
```

**Diferenca chave vs dev:** `start` ao inves de `start-dev` (desabilita hot-reload, caches de tema, etc).

---

## 2. Nginx (reverse proxy)

O Keycloak roda na porta 8180 interna. O Nginx expoe via HTTPS:

```nginx
# /etc/nginx/sites-available/capypad

server {
    listen 80;
    server_name seudominio.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name seudominio.com;

    ssl_certificate     /etc/letsencrypt/live/seudominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/seudominio.com/privkey.pem;

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

    # Frontend (se servido pelo mesmo server)
    location / {
        root /var/www/capypad;
        try_files $uri $uri/ /index.html;
    }
}
```

---

## 3. Variaveis de ambiente (backend/.env em producao)

```env
# PostgreSQL
POSTGRES_USER=capypad_prd
POSTGRES_PASSWORD=<senha-forte-gerada>
POSTGRES_DB=capypad
KC_DB_USERNAME=capypad_prd
KC_DB_PASSWORD=<senha-forte-gerada>

# Keycloak Admin
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=<senha-forte-gerada>

# URLs
KEYCLOAK_URL=http://keycloak:8080
CAPYPAD_FRONTEND_URL=https://seudominio.com
CAPYPAD_AUTH_CALLBACK_URL=https://seudominio.com/api/auth/callback
CAPYPAD_KEYCLOAK_EXTERNAL_URL=https://seudominio.com/auth
CAPYPAD_OIDC_TOKEN_ISSUER=http://keycloak:8080/auth/realms/capypad

# Client secret (gerar no Keycloak admin console)
KEYCLOAK_CLIENT_SECRET=<secret-do-client>

# Cookie seguro (HTTPS em producao)
CAPYPAD_AUTH_COOKIE_SECURE=true
CAPYPAD_AUTH_COOKIE_SAME_SITE=Lax
```

**Nota:** `KEYCLOAK_URL` usa o hostname interno do Docker (`keycloak:8080`), enquanto `CAPYPAD_KEYCLOAK_EXTERNAL_URL` usa a URL publica (o que o browser do usuario acessa).

**Importante:** `CAPYPAD_OIDC_TOKEN_ISSUER` deve bater exatamente com o claim `iss` do access token emitido pelo Keycloak. Em setup com `start-dev` sem hostname fixo, normalmente sera `http://keycloak:8080/auth/realms/capypad`.

---

## 4. Configuracao do Realm no Keycloak

Acesse `https://seudominio.com/auth/admin` e faca login com as credenciais admin.

### 4.1 Criar o Realm

1. Clique no dropdown do realm (canto superior esquerdo) → **Create Realm**
2. Nome: `capypad`
3. Salve

### 4.2 Criar o Client

1. **Clients** → **Create client**
2. **Client ID:** `backend-api`
3. **Client authentication:** ON (confidential)
4. **Authentication flow:** marque apenas **Standard flow** (Authorization Code)
5. Avance e configure:
   - **Valid Redirect URIs:** `https://seudominio.com/api/auth/callback`
   - **Web Origins:** `https://seudominio.com`
   - **Valid Post Logout Redirect URIs:** `https://seudominio.com/*`
6. Salve
7. Va na aba **Credentials** → copie o **Client secret** → cole no `.env` como `KEYCLOAK_CLIENT_SECRET`

### 4.3 Criar Realm Roles

1. **Realm roles** → **Create role**
2. Crie duas roles:
   - `USER`
   - `ADMIN`

### 4.4 Habilitar Self-Registration (opcional)

Se quiser que usuarios se registrem sozinhos (com aprovacao do admin depois):

1. **Realm Settings** → aba **Login**
2. Ative **User registration**
3. Salve

### 4.5 Selecionar o Tema

1. **Realm Settings** → aba **Themes**
2. **Login theme:** `capypad`
3. Salve

### 4.6 Configurar Email (opcional, recomendado)

Para reset de senha funcionar:

1. **Realm Settings** → aba **Email**
2. Configure o SMTP (ex: Gmail, SES, Mailgun)
3. Salve e teste

---

## 5. Criar o Primeiro Admin

Com o Keycloak e Postgres rodando, execute o backend com setup mode:

```bash
docker compose run --rm \
  -e ADMIN_SETUP=true \
  -e ADMIN_USERNAME=seunome \
  -e ADMIN_PASSWORD='suasenha-forte' \
  -e QUARKUS_HTTP_PORT=8180 \
  backend
```

Esse comando cria o admin em um container temporario e encerra em seguida.

---

## 6. Checklist de Seguranca

- [ ] `start` ao inves de `start-dev` no Keycloak
- [ ] Keycloak exposto apenas via `127.0.0.1` (nao `0.0.0.0`)
- [ ] HTTPS com certificado valido (Let's Encrypt)
- [ ] `CAPYPAD_AUTH_COOKIE_SECURE=true`
- [ ] Senhas fortes para Postgres, Keycloak admin e client secret
- [ ] Valid Redirect URI no client eh a URL exata (nao wildcard)
- [ ] Remover `ADMIN_SETUP` apos criar o primeiro admin
- [ ] Firewall: portas 8080 e 8180 fechadas externamente (so Nginx acessa)
- [ ] Backup do banco PostgreSQL configurado
