# Implementation Plan

Concise plan for the Da Nang Apartments MVP. The full product brief is the source of
truth for requirements; this file records how we deliver it and in what order.

## Repository layout

```
.
├── backend/              FastAPI app, SQLAlchemy models, Alembic, tests
│   ├── app/
│   │   ├── api/          HTTP routers (thin; delegate to services)
│   │   ├── core/         settings, logging, security helpers
│   │   ├── db/           engine/session, declarative base
│   │   ├── models/       SQLAlchemy ORM models
│   │   ├── schemas/      Pydantic request/response models   (Phase 2)
│   │   ├── services/     business logic                      (Phase 2+)
│   │   └── bot/          aiogram integration                 (Phase 5)
│   ├── alembic/          migrations
│   └── tests/
├── frontend/             React + Vite + TS Mini App
│   └── src/
│       ├── api/          fetch client + TanStack Query hooks
│       ├── i18n/         i18next setup + en/ru resources
│       ├── pages/        route screens
│       └── components/
├── docs/                 plan, decisions
├── docker-compose.yml    db (PostGIS), S3 (RustFS), backend, frontend
└── .env.example
```

## Phases

| Phase | Scope | Exit check |
|---|---|---|
| 1 Foundation ✅ | Monorepo, tooling (ruff, mypy, pytest, ESLint, Prettier, Vitest), Docker Compose, settings, ORM models, initial migration + district reference data, health endpoints, frontend shell talking to API | `docker compose up` → `/api/health/ready` OK, frontend shows backend status; lint + tests pass |
| 2 Auth & core API ✅ | initData HMAC validation, session tokens (signed JWT in `Authorization` header (D11)), admin allow-list, apartment CRUD service, status state machine, public catalog + map (bbox) endpoints, districts endpoint, structured errors, rate limiting | pytest suite incl. PostGIS integration tests |
| 3 Public frontend ✅ | Telegram SDK init/theme/viewport/safe-area, i18n switcher, MapLibre map with price markers + clustering, bottom sheet / side panel, list view with infinite scroll, shared filter state in URL, details page, contacts, `startapp` deep links | Vitest + Playwright flows |
| 4 Admin panel ✅ | Dashboard counts, listing cards w/ search + status filter, RHF+Zod form, location picker w/ geocoding, image upload (validation, Pillow re-encode to WebP variants, S3), reorder/cover, status actions, unsaved-changes guard | e2e admin create/edit/status |
| 5 Channel publishing ✅ | Post renderer (caption limits), preview, confirm, aiogram send (media group / photo / text), idempotent publication records, error taxonomy, "unknown" state recovery | mocked Bot API tests |
| 6 Integration ✅ | Seed data (fictional, labelled), prod compose + Caddy HTTPS, BotFather/Mini App docs, VPS guide, acceptance walkthrough | all tests green, acceptance checklist |

## Key design decisions (Phase 1)

See [DECISIONS.md](DECISIONS.md) for rationale. Highlights:

- **Drafts may be incomplete.** Publish-required apartment columns are nullable;
  a DB `CHECK` guarantees they are present whenever `status <> 'draft'`. The
  "≥ 1 photo" rule is enforced in the service layer (Phase 2).
- **Location** is stored as `latitude`/`longitude` plus a PostGIS
  `geometry(Point, 4326)` **generated column** with a GiST index, so the two can
  never drift apart.
- **Enums** are stored as `VARCHAR` + `CHECK` constraints (not native PG enums)
  to keep migrations simple.
- **Cover image** = the image with `sort_order = 0`. `(apartment_id, sort_order)`
  is a deferrable unique constraint so reordering can happen in one transaction.
- **Duplicate channel posts** are prevented in the DB: `idempotency_key` is
  unique, and a partial unique index allows at most one `pending`/`succeeded`/
  `unknown` publication per apartment and channel.
- **Districts** are seeded as reference data in a migration (familiar
  rental-market names; see DECISIONS.md about the 2025 administrative reform).
