# Da Nang Apartments

A Telegram Mini App for browsing and managing long-term rental apartments in Da Nang:
a map-based catalog for users and a mobile-friendly admin panel for channel administrators.

> **Status: Phase 1 (Foundation) of 6.** Infrastructure, data model, migrations and a
> frontend ↔ API health check are done. Auth, the catalog API, map UI, admin panel and
> channel publishing come next. See [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript (strict), Vite, Tailwind CSS 4, React Router, TanStack Query, i18next |
| Backend | Python 3.13, FastAPI, Pydantic v2, SQLAlchemy 2 (async), Alembic, GeoAlchemy2 |
| Data | PostgreSQL 17 + PostGIS 3.5, S3-compatible object storage (RustFS locally) |
| Dev infra | Docker Compose |

Planned for later phases: MapLibre GL JS, React Hook Form + Zod, Telegram Mini Apps SDK, aiogram.

## Repository layout

```
backend/    FastAPI app (app/), Alembic migrations (alembic/), tests (tests/)
frontend/   React Mini App (src/)
docker/     container init scripts
docs/       implementation plan and design decisions
```

## Quick start (Docker)

Prerequisites: Docker with Compose v2 (Docker Desktop, OrbStack, Colima, …).

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

# backend PostGIS integration tests (uses the separate <db>_test database)
docker compose exec backend pytest -m db

# frontend
cd frontend
npm test
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
| Sessions | `SESSION_SECRET`, `SESSION_TTL_MINUTES` | Secret must be ≥ 32 chars in production. |
| Dev login | `DEV_AUTH_ENABLED` | Browser-only development bypass (Phase 2). The app refuses to start with it enabled in production. |
| Image storage | `S3_*` | Any S3-compatible provider. `S3_AUTO_CREATE_BUCKET` must be `false` in production. |
| Map | _(Phase 3)_ | Tile style URL and geocoding provider will be configurable; public OSM tile servers are not used for production traffic. |

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
