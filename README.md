# Da Nang Apartments

A Telegram Mini App for browsing and managing long-term rental apartments in Da Nang:
a map-based catalog for users and a mobile-friendly admin panel for channel administrators.

> **Status: MVP complete (Phases 1–6).** Map- and list-based catalog with filters, details,
> contacts and deep links (EN/RU, Telegram or browser); a phone-friendly admin panel with
> photo upload and location picking; duplicate-safe publishing to the Telegram channel; a
> production stack with automatic HTTPS. Deploy: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
> Acceptance status: [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md).

## Branches

| Branch | Purpose |
|---|---|
| `main` | Production. Only receives tested work promoted from `develop`. |
| `develop` | Integration/testing. Phase work lands here first. |

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript (strict), Vite, Tailwind CSS 4, React Router, TanStack Query, i18next, MapLibre GL JS + supercluster, Telegram Mini Apps script |
| Backend | Python 3.13, FastAPI, Pydantic v2, SQLAlchemy 2 (async), Alembic, GeoAlchemy2 |
| Data | PostgreSQL 17 + PostGIS 3.5, S3-compatible object storage (RustFS locally) |
| Dev infra | Docker Compose |

Planned for later phases: React Hook Form + Zod (admin forms), aiogram (channel publishing).

## Repository layout

```
backend/    FastAPI app (app/), Alembic migrations (alembic/), tests (tests/)
frontend/   React Mini App (src/)
docker/     container init scripts
docs/       implementation plan and design decisions
```

## Quick start (Docker)

Prerequisites: Docker with Compose v2 (Docker Desktop, OrbStack, Colima, …). On macOS
without Docker Desktop:

```bash
brew install colima docker docker-compose docker-buildx
colima start --cpu 4 --memory 6 --vm-type vz --mount-type virtiofs
```

(Homebrew prints how to register the compose/buildx plugins in `~/.docker/config.json`.)

```bash
cp .env.example .env
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend (Vite dev server) | http://localhost:5173 |
| API | http://localhost:8000/api/health |
| API readiness (DB, PostGIS, storage) | http://localhost:8000/api/health/ready |
| OpenAPI docs (non-production only) | http://localhost:8000/api/docs |
| Storage console (RustFS) | http://localhost:9001 (keys from `.env`) |
| PostgreSQL | `localhost:5433` (user/password/db from `.env`) |

The frontend home page shows a live system-status card that queries the API through the
Vite proxy, which confirms the whole chain works.

On start, the backend container applies Alembic migrations (`RUN_MIGRATIONS=true` by
default) and, in development, creates the S3 bucket if it is missing.

Data lives in named volumes (`db-data`, `storage-data`) and survives restarts.
`docker compose down -v` wipes it.

## Demo data

18 clearly labelled fictional listings (`[DEMO]` titles, "DEMO PHOTO" placeholder images)
spread across Da Nang's districts:

```bash
docker compose exec backend python -m app.cli seed-demo            # add once
docker compose exec backend python -m app.cli seed-demo --reset    # replace
```

## Database & migrations

Migrations live in `backend/alembic/versions/`:

- `0001` — enables PostGIS; creates `users`, `districts`, `apartments`, `apartment_images`,
  `telegram_publications` with constraints and indexes (incl. a GiST spatial index).
- `0002` — seeds Da Nang district reference data.

```bash
# apply / roll back (inside Docker)
docker compose exec backend alembic upgrade head
docker compose exec backend alembic downgrade -1

# create a new migration after changing models
docker compose exec backend alembic revision --autogenerate -m "describe change"

# print SQL without a database
cd backend && .venv/bin/alembic upgrade head --sql
```

Data model notes (full rationale in [docs/DECISIONS.md](docs/DECISIONS.md)):

- Drafts may be incomplete; a `CHECK` constraint requires title, price, district,
  bedrooms, coordinates and location precision for any non-draft status.
- `apartments.location` is a PostGIS point **generated** from `latitude`/`longitude`.
- Money is integer VND (`BIGINT`). Studio = `bedrooms = 0`.
- A partial unique index allows only one pending/succeeded/unknown Telegram publication
  per apartment and channel; `idempotency_key` is unique.

## API overview (Phase 2)

Interactive docs: http://localhost:8000/api/docs. All errors use one envelope:
`{"error": {"code": "...", "message": "...", "details": ...}}`.

| Method & path | Access | Purpose |
|---|---|---|
| `POST /api/auth/telegram` | public, rate-limited | Exchange Telegram `initData` for a bearer token |
| `POST /api/auth/dev` | dev only | Token for any Telegram user id (`DEV_AUTH_ENABLED=true`) |
| `GET/PATCH /api/auth/me` | user | Current user (incl. `is_admin`); update `preferred_language` |
| `GET /api/districts` | public | Active districts (en/ru names) |
| `GET /api/apartments` | public | Available listings, paginated; filters below; `sort=newest\|price_asc\|price_desc` |
| `GET /api/apartments/map` | public | Markers inside the required `bbox`, same filters |
| `GET /api/apartments/{id}` | public | Details with contacts + share link; `404` unknown, `410` rented/archived |
| `GET /api/admin/dashboard` | admin | Counts by status |
| `GET /api/admin/apartments` | admin | All non-deleted listings; `q` (title search), `status`, paging |
| `POST /api/admin/apartments` | admin | Create a draft (any subset of fields) |
| `GET/PATCH/DELETE /api/admin/apartments/{id}` | admin | Read / partial update / soft delete |
| `PATCH /api/admin/apartments/{id}/status` | admin | Lifecycle transition (validated) |
| `POST /api/admin/apartments/{id}/images` | admin | Upload one photo (multipart `file`) |
| `PATCH /api/admin/apartments/{id}/images/order` | admin | New order (`image_ids`); first = cover |
| `DELETE /api/admin/apartments/{id}/images/{image_id}` | admin | Remove a photo |
| `GET /api/admin/geocode?q=&lang=` | admin | Address/landmark search inside the service area |
| `GET /api/admin/apartments/{id}/telegram-preview` | admin | Exact post + photos + blockers (never posts) |
| `POST /api/admin/apartments/{id}/publish-telegram` | admin | Post to the channel; requires `Idempotency-Key` header |
| `GET /api/admin/apartments/{id}/telegram-publications` | admin | Attempt history |
| `POST /api/admin/apartments/{id}/telegram-publications/{pid}/resolve` | admin | Record the outcome of an unconfirmed attempt |

Catalog filters: `min_price`, `max_price` (VND), repeated `bedrooms` (`0` = studio,
`3` = 3+), repeated `district` (ids), `min_area`, `max_area` (m²), and
`bbox=min_lng,min_lat,max_lng,max_lat`.

Example (dev login with `DEV_AUTH_ENABLED=true` and your id in `ADMIN_TELEGRAM_USER_IDS`):

```bash
curl -s -X POST localhost:8000/api/auth/dev -H 'Content-Type: application/json' \
  -d '{"telegram_user_id": 1001}'
```


## Frontend (Phase 3)

```
frontend/src/
  telegram/webapp.ts     Telegram WebApp wrapper (init, deep links, back button, links, share)
  api/                   fetch client (bearer session), types, TanStack Query hooks
  auth/                  Telegram initData → API session on launch
  features/filters/      filter state in the URL (shared by map and list), filters sheet
  features/map/          MapLibre map, HTML price markers + clustering, location preview
  features/catalog/      header, map panel + preview sheet, list panel (infinite scroll)
  features/apartment/    card, gallery, contact bar
  pages/                 CatalogPage (/), ApartmentPage (/apartments/:id)
  i18n/locales/          en.json, ru.json
```

- **Routes:** `/` (map; `?view=list` for the list) and `/apartments/:id`. Filters, view
  and sort live in the query string, so links and reloads keep them.
- **Deep links:** `https://t.me/<bot>/<app>?startapp=<listing-id>` opens that listing
  (in a browser: `/?tgWebAppStartParam=<id>` or `/apartments/<id>`). Unknown ids show
  "does not exist"; rented/archived show "no longer available".
- **Telegram:** theme colours, viewport height and safe areas come from Telegram's CSS
  variables. Telegram's own Back button is used on the details page, vertical swipes are
  disabled so map panning doesn't minimise the app, contacts open via
  `openTelegramLink`, and sharing uses Telegram's share sheet.
- **Language:** a manual choice (saved locally and to the profile when signed in) wins,
  then the Telegram user's language, then English.
- **Map tiles:** `VITE_MAP_STYLE_URL` (default: OpenFreeMap). Approximate locations are
  shown with a dashed "~" marker and an area circle, never a precise pin.

### Testing inside Telegram

Use the production build behind an HTTPS tunnel (it loads far faster in Telegram's webview
than the development server); see *Testing inside Telegram before you have a server* in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). The developer sign-in is always refused for
requests that come through a proxy or tunnel, and JavaScript errors from the webview are
logged by the backend as `Client error: …`.

## Admin panel (Phase 4)

Open `/admin` (or the ⚙ button in the catalog header, shown to administrators only).

- **Access:** inside Telegram the user is signed in automatically; admin rights come from
  `ADMIN_TELEGRAM_USER_IDS` and are enforced by the API on every request. In a local
  browser, development builds offer a *Developer sign-in* (needs `DEV_AUTH_ENABLED=true`
  and your ID in `ADMIN_TELEGRAM_USER_IDS`). Production builds don't contain it.
- **Dashboard:** counts per status (tap to filter), search by title, listing cards with
  cover, rent, district, status, channel-post state and quick status actions.
- **Form** (`/admin/apartments/new`, `/admin/apartments/:id`): every field optional for a
  draft. The status panel lists what is still missing before publishing. Leaving with
  unsaved changes asks first (in-app navigation, browser reload, closing the Mini App).
- **Location:** search an address or landmark (server-side proxy to a Nominatim-compatible
  geocoder), tap the map to place the pin, drag to adjust, and choose *exact* or
  *approximate*. A searched place is always set to *approximate* until you confirm it.
- **Photos** (after the first save): JPEG/PNG/WebP, up to 10 MB each and 15 per listing,
  with upload progress, ← → reordering, ★ to make a photo the cover, and removal. The
  server checks the real file contents, applies EXIF rotation, strips metadata (including
  GPS) and stores two WebP sizes (1600 px and 480 px) in S3.

### Image storage in production

Objects are written as `apartments/<listing>/<image>/{lg,sm}.webp` with
`Cache-Control: public, max-age=31536000, immutable`. Browsers load them directly, so the
bucket (or a CDN in front of it) must allow public **read** of objects, and
`S3_PUBLIC_BASE_URL` must point at that public URL. Development does this automatically
(`S3_AUTO_CREATE_BUCKET=true` creates the bucket with a public-read policy). Allow request
bodies of at least 11 MB on the reverse proxy for uploads.

## Telegram channel publishing (Phase 5)

Publishing to the catalog and posting to the channel are separate. A post is only ever
sent when an administrator presses **Publish to Telegram channel** on an *available*
listing, reviews the preview and confirms.

- **The post:** title, rent, district, area, bedrooms, bathrooms, description, deposit,
  minimum rental and a link that opens the listing in the Mini App, in
  `TELEGRAM_POST_LANGUAGE` (en/ru). Up to 10 photos are sent as an album (first photo
  carries the caption). The description is shortened with "…" to fit Telegram's
  1024-character caption limit; user text is HTML-escaped.
- **No duplicates:** each confirmation carries an `Idempotency-Key`. Retrying the same
  request (double click, lost connection) returns the original result. The database allows
  only one pending/posted/unconfirmed post per listing and channel; a second publish
  shows the existing post instead. Reposting is not part of the MVP.
- **Failures:** Telegram's definite rejections (bot not an admin, missing permission,
  channel not found, photos rejected, rate limit…) are stored as *failed* with a readable
  reason, and a new attempt is allowed. If the outcome cannot be confirmed (timeout,
  Telegram 5xx, a crash mid-request), the attempt is stored as *unconfirmed* and is **never
  retried automatically**: the admin checks the channel and taps *It was posted* or *It was
  not posted*.
- **History:** every attempt (who, when, result) is listed on the listing's edit page.
- Editing a listing never changes an existing channel post; the panel says so.

### Bot and channel setup

1. `@BotFather` → `/newbot`; put the token in `TELEGRAM_BOT_TOKEN` and the username
   (without `@`) in `TELEGRAM_BOT_USERNAME`.
2. Add the bot to your channel as an **administrator** with **Post messages**.
3. Set `TELEGRAM_CHANNEL_ID`: `@channelusername` for a public channel, or the numeric id
   (`-100…`) for a private one.
4. `@BotFather` → `/newapp` for the Mini App (HTTPS URL of the frontend); put its short
   name in `TELEGRAM_MINI_APP_SHORT_NAME` so posts link to
   `https://t.me/<bot>/<app>?startapp=<listing>`.
5. Run the bot process (answers `/start` with an "Open apartments" button and sets the
   chat menu button; needs an HTTPS `PUBLIC_APP_URL`):

   ```bash
   docker compose --profile bot up -d bot
   ```

## Running without Docker

You still need a PostGIS-enabled PostgreSQL and an S3-compatible endpoint (e.g. start
just those with `docker compose up db storage`).

```bash
# backend
cd backend
python3.13 -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --reload

# frontend (proxies /api to http://localhost:8000)
cd frontend
npm install
npm run dev
```

The backend reads the repo-root `.env` (or `backend/.env`); real environment variables win.

## Tests, linting, formatting

```bash
# backend
cd backend
.venv/bin/pytest                      # unit tests; PostGIS tests skip without TEST_DATABASE_URL
.venv/bin/ruff check . && .venv/bin/ruff format --check .
.venv/bin/mypy app tests alembic/env.py

# full backend suite incl. PostGIS tests, inside Docker (uses the <db>_test database)
docker compose exec backend pytest

# or from the host against the Compose database
TEST_DATABASE_URL=postgresql+asyncpg://danang:danang@localhost:5433/danang_test .venv/bin/pytest

# frontend
cd frontend
npm test                              # Vitest + Testing Library (MapLibre faked in jsdom)
npx playwright install chromium       # once
npm run test:e2e                      # Playwright: real browser + real MapLibre, API mocked
npm run lint
npm run typecheck
npm run format:check
npm run build
```

## Configuration

All configuration is environment-based; see [.env.example](.env.example) for every variable.

| Concern | Variables | Notes |
|---|---|---|
| Bot token | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` | From @BotFather. Server-side only; never sent to the browser. |
| Mini App link | `TELEGRAM_MINI_APP_SHORT_NAME`, `PUBLIC_APP_URL` | Used for `t.me/<bot>/<app>?startapp=<listing>` deep links (Phase 3). |
| Channel | `TELEGRAM_CHANNEL_ID` | Numeric `-100…` ID or `@username`. The bot must be a channel admin with "Post messages". Never accepted from clients. |
| Admins | `ADMIN_TELEGRAM_USER_IDS` | Comma-separated numeric Telegram user IDs. Usernames are not used for authorization. |
| Admin contact | `ADMIN_CONTACT_TELEGRAM` | Channel administrator's username shown on every listing. |
| Sessions | `SESSION_SECRET`, `SESSION_TTL_MINUTES` | Bearer JWT lifetime. Secret must be ≥ 32 chars in production (dev falls back to an insecure built-in value with a warning). |
| initData freshness | `TELEGRAM_INIT_DATA_MAX_AGE_SECONDS` | Older Telegram launch data is rejected. |
| Dev login | `DEV_AUTH_ENABLED` | Browser-only development bypass. The app refuses to start with it enabled in production. |
| Rate limits | `RATE_LIMIT_AUTH`, `RATE_LIMIT_ADMIN_WRITE` | Per IP for login, per admin for writes. |
| Service area | `SERVICE_AREA_BBOX` | Listing coordinates must fall inside this box. |
| Image storage | `S3_*`, `IMAGE_MAX_UPLOAD_MB`, `IMAGE_MAX_PER_LISTING` | Any S3-compatible provider with public object reads (see *Image storage in production*). `S3_AUTO_CREATE_BUCKET` must be `false` in production. |
| Address search | `GEOCODING_URL`, `GEOCODING_USER_AGENT`, `GEOCODING_RATE_LIMIT` | Nominatim-compatible endpoint; results are limited to `SERVICE_AREA_BBOX` and cached for a day. |
| Map | `VITE_MAP_STYLE_URL` | MapLibre style JSON. Default OpenFreeMap (no key). For production traffic use a self-hosted style or a commercial provider; public OSM tile servers are never used. Geocoding for the admin location picker arrives in Phase 4. |

Production safety checks run at startup when `ENVIRONMENT=production`.

## Deployment (HTTPS)

Telegram requires Mini Apps to be served over HTTPS. Production configuration (built
frontend, reverse proxy with automatic TLS, VPS guide, BotFather setup) is delivered in
Phase 6. For local testing inside Telegram, expose the Vite dev server through an HTTPS
tunnel and add the tunnel host to `VITE_ALLOWED_HOSTS`.

## Health checks

- `GET /api/health` — liveness (process up; used by the container healthcheck).
- `GET /api/health/ready` — readiness: database, PostGIS and storage; returns `503` with a
  per-component breakdown when something is down.
