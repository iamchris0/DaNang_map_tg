# Deployment (single VPS)

The production stack (`docker-compose.prod.yml`) runs everything on one server:

| Service | Role |
|---|---|
| `web` | Caddy: automatic HTTPS, the built Mini App, `/api` → backend, `/media` → photos |
| `backend` | FastAPI (applies migrations on start), channel publishing |
| `bot` | Telegram bot (`/start` and the menu button open the Mini App) |
| `db` | PostgreSQL 17 + PostGIS |
| `storage` | S3-compatible photo storage (RustFS) |

Only ports 80 and 443 are exposed. Data lives in named Docker volumes and survives
restarts and image rebuilds.

## 1. Server

- Ubuntu 24.04 (or similar), 2 vCPU / 2–4 GB RAM / 30 GB disk is plenty for the MVP.
- Install Docker Engine with the Compose plugin: <https://docs.docker.com/engine/install/ubuntu/>.
- A domain (or subdomain) with an **A record** pointing at the server's IP, e.g.
  `apartments.example.com`. Ports 80 and 443 must be reachable (Caddy uses them to obtain
  the certificate).

## 2. Configure

```bash
git clone <your repository> danang-apartments && cd danang-apartments
cp deploy/env.production.example .env.production
nano .env.production
```

Fill in at least:

| Variable | Value |
|---|---|
| `SITE_ADDRESS` | your domain, e.g. `apartments.example.com` |
| `PUBLIC_APP_URL` | `https://` + the domain |
| `SESSION_SECRET`, `POSTGRES_PASSWORD`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | long random values: `openssl rand -base64 48` |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` | from @BotFather |
| `TELEGRAM_CHANNEL_ID` | `@channel` or `-100…`; the bot must be a channel admin with *Post messages* |
| `TELEGRAM_MINI_APP_SHORT_NAME` | the short name you give the Mini App in @BotFather (step 4) |
| `ADMIN_TELEGRAM_USER_IDS` | numeric Telegram IDs of administrators, comma-separated |
| `ADMIN_CONTACT_TELEGRAM` | the channel administrator's username (shown on every listing) |
| `GEOCODING_USER_AGENT` | include your domain or e-mail (Nominatim usage policy) |

The backend refuses to start in production with an empty/short `SESSION_SECRET`, without a
bot token, or with `DEV_AUTH_ENABLED` / `S3_AUTO_CREATE_BUCKET` enabled.

## 3. Start

```bash
export ENV_FILE=.env.production
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
# one-time: create the photo bucket (public read for /media)
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm backend python -m app.cli init-storage
# optional: 18 clearly labelled fictional demo listings with placeholder photos
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm backend python -m app.cli seed-demo
```

Check: `https://<domain>/api/health/ready` → `{"status":"ok",…}`, then open
`https://<domain>/` in a browser.

To remove the demo listings later, open each in the admin panel and delete it, or run
`seed-demo --reset` to replace them with a fresh set.

## 4. Telegram setup (@BotFather)

1. **Mini App:** `/newapp` → choose the bot → title, short description, a 640×360 image →
   Web App URL `https://<domain>/` → short name (e.g. `app`). Put that short name into
   `TELEGRAM_MINI_APP_SHORT_NAME` and restart (`up -d`). Listing links then look like
   `https://t.me/<bot>/app?startapp=<listing-id>` and open the listing inside Telegram.
2. **Main Mini App (optional):** *Bot Settings → Configure Mini App → Enable* with the same
   URL adds an "Open app" button on the bot's profile.
3. **Menu button:** set automatically by the `bot` service when `PUBLIC_APP_URL` is HTTPS.
4. **Channel:** add the bot as an administrator with *Post messages*. To give subscribers a
   way into the catalog, pin a post with the link `https://t.me/<bot>/<short-name>`.

## 5. Operate

```bash
C="docker compose -f docker-compose.prod.yml --env-file .env.production"
$C ps                       # status
$C logs -f backend bot web  # logs (client-side errors from Telegram appear as "Client error")
git pull && $C up -d --build   # update; migrations run automatically on backend start
```

**Backups** (run daily from cron, copy off the server):

```bash
$C exec -T db pg_dump -U danang -Fc danang > backup-$(date +%F).dump
docker run --rm -v danang-apartments-prod_storage-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/photos-$(date +%F).tgz -C /data .
```

Restore: `pg_restore -U danang -d danang --clean` inside the `db` container, and untar the
photo archive into the `storage-data` volume while the stack is stopped.

## Testing inside Telegram before you have a server

Run the production stack locally and expose it with a temporary HTTPS tunnel. The
production build is a few small files, so it loads quickly in Telegram's webview (the
development server serves hundreds of separate modules, which can stall on mobile data):

```bash
# .env.production with SITE_ADDRESS=:80, HTTP_PORT=8088, HTTPS_PORT=8443 and your real bot settings
export ENV_FILE=.env.production
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
cloudflared tunnel --url http://localhost:8088
```

Set `PUBLIC_APP_URL` to the printed `https://….trycloudflare.com` address (restart the
stack) and use it as the Mini App URL in @BotFather. Stop the development `bot` service
first (`docker compose stop bot`): only one process may poll a bot at a time. Quick-tunnel
addresses change on every restart, so update @BotFather each time, or use a real domain.
