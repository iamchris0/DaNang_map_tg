# Decisions & Assumptions

Short records of choices that are not obvious from the code.

## D1. Local S3: RustFS instead of MinIO

MinIO stopped publishing community Docker images (the `minio/minio` repository is
no longer available on Docker Hub as of this writing). Local development uses
**RustFS** (`rustfs/rustfs`, S3-compatible, Apache-2.0) pinned to a specific
version. The backend only speaks the S3 API via `boto3`, so production can use
any S3-compatible provider (AWS S3, Cloudflare R2, Backblaze B2, Wasabi,
self-hosted Garage/SeaweedFS) by changing `S3_*` variables.

In development the backend creates the bucket on startup when
`S3_AUTO_CREATE_BUCKET=true`. In production the bucket should be provisioned
out-of-band and the flag left `false`.

## D2. Districts

Vietnam abolished the district administrative level on 1 July 2025 and merged Da
Nang with Quang Nam. Renters and agents still search by the familiar names
(Hải Châu, Sơn Trà, Ngũ Hành Sơn, …), so the `districts` table holds these
market-area names as reference data. Rows can be deactivated (`active = false`)
or added via migration without code changes.

## D3. Draft completeness

The product requires saving incomplete drafts. Publish-required columns
(`title`, `price_vnd`, `district_id`, `bedrooms`, `latitude`, `longitude`,
`location_precision`) are nullable, and the check constraint
`ck_apartments_publishable_fields` enforces them for any non-draft status. This
gives a database-level guarantee that nothing incomplete is ever public, while
the service layer adds richer validation and the photo requirement.

## D4. Studio = 0 bedrooms

`bedrooms = 0` represents a studio. The "3+" filter is `bedrooms >= 3`.

## D5. Money

All VND amounts are `BIGINT` integers. No decimals, no floats.

## D6. Enums as VARCHAR + CHECK

Native PostgreSQL enum types make adding values a non-transactional migration
chore. We use SQLAlchemy `Enum(native_enum=False, create_constraint=True)` which
emits `VARCHAR` with a `CHECK` constraint.

## D7. Telegram channel ID storage

`telegram_publications.telegram_channel_id` is a string so it can hold either a
numeric chat ID (`-100…`) or an `@channelusername`. The value always comes from
server configuration, never from clients.

## D8. Roles

`users.role` is a cache of the last computed role. The source of truth for admin
rights is the `ADMIN_TELEGRAM_USER_IDS` environment variable, re-evaluated on
every authentication (Phase 2).

## D9. Python toolchain

Python 3.13 in Docker (spec requires 3.12+). Dependencies are declared in
`backend/pyproject.toml`; plain `pip` is used so no extra tool is required.

## D10. PostGIS image

`postgis/postgis` publishes amd64 images only. Compose uses `imresamu/postgis`
(same Dockerfiles, built for amd64 and arm64 by a docker-postgis maintainer) so the
stack runs natively on Apple Silicon and ARM servers.

## D11. API sessions: bearer JWT, not cookies

`POST /api/auth/telegram` verifies initData (HMAC-SHA256 per the Telegram docs; every
field except `hash`, including the newer `signature`, is part of the data-check-string)
and returns a short-lived HS256 JWT (`SESSION_TTL_MINUTES`, default 24 h) that the
client sends as `Authorization: Bearer`. Cookies are unreliable inside Telegram's
webviews (third-party-cookie rules in Telegram Web), and bearer tokens also make CSRF
irrelevant. The token carries only the user id: admin rights are re-checked against
`ADMIN_TELEGRAM_USER_IDS` on every request, so removing an ID revokes access at the
next restart, without waiting for tokens to expire.

## D12. Development login

`POST /api/auth/dev` issues a session for any Telegram user id without a signature, so
the app can be used in a normal browser. It returns 404 unless `DEV_AUTH_ENABLED=true`,
and the app refuses to start with that flag in production.

## D13. Status transitions

Beyond the required transitions, `draft → archived` and `rented → archived` are allowed
so stale drafts and old rentals can be tidied away. Going back to `draft` is not allowed.
Setting the current status again is a no-op (safe for retries). Any change to
`available` re-validates required fields and requires at least one photo. Editing a
non-draft listing may not remove a required field.

## D14. Unavailable vs unknown listings

`GET /api/apartments/{id}` returns `404 listing_not_found` for unknown, deleted and
draft listings, and `410 listing_unavailable` for rented/archived ones, so a shared
link can say "no longer available" without disclosing any listing data.

## D15. Rate limiting

The `limits` library with in-process memory storage (moving window): login attempts
per client IP and admin writes per admin. This is enough for a single backend instance.
For multiple instances, switch to a shared storage such as Redis.

## D16. Service area

Coordinates must fall inside `SERVICE_AREA_BBOX` (default: Da Nang including
Hoa Vang). This catches swapped latitude/longitude and mis-taps on the map picker.

## D17. Catalog pagination

The list view uses page/page_size with a total count, because the UI shows the number
of matches anyway. The map endpoint requires a viewport `bbox` and returns at most 500
lightweight markers (`truncated: true` beyond that). Clustering happens client-side.

## D18. Telegram SDK

The app uses Telegram's official `telegram-web-app.js` (loaded in `index.html`) with
`@types/telegram-web-app` typings, behind a small wrapper in `src/telegram/webapp.ts`.
It is the canonical Mini Apps API, always matches the current Telegram clients, and
needs no extra npm dependency. All calls are version-gated (`isVersionAtLeast`) and are
no-ops in a regular browser.

## D19. Map markers

Price labels are HTML elements (React portals into MapLibre markers), clustered client-
side with `supercluster`. Markers are therefore real, focusable buttons with translated
accessible names, and are easy to style (selected, approximate). The map endpoint caps
results at 500, which HTML markers handle comfortably. Markers and data load without
waiting for tiles. The map stays mounted when switching to the list, and the camera is
restored when returning from a listing.

## D20. Map tiles

Default style: OpenFreeMap (`tiles.openfreemap.org/styles/liberty`), which is free, needs
no key and uses OSM data. It is configurable with `VITE_MAP_STYLE_URL`. For production
traffic, prefer a self-hosted style (e.g. OpenFreeMap or Protomaps on our own server) or
a paid provider with an SLA. MapLibre's worker is loaded from an explicitly emitted asset
(`setWorkerUrl`) so it works with Vite's pre-bundling and hashed builds.

## D21. Catalog state in the URL

Filters, view (map/list) and sort are query parameters (`?bedrooms=2&max_price=…`). Map
and list therefore share one source of truth, filters survive reloads, and the browser
or Telegram back button behaves predictably (`replace` navigation, so filter tweaks don't
pile up history). API requests use filters debounced by 350 ms, and map viewports are
rounded to ~100 m to reuse cached queries.

## D22. Client session storage

The API token from `/api/auth/telegram` lives in memory and `sessionStorage`: it survives
a reload of the Mini App but not closing it. Public browsing never needs it.

## D23. Image pipeline

Uploads are checked against both the declared MIME type and the real file format (Pillow),
with a decompression-bomb limit (40 MP). They are rotated by EXIF orientation and
re-encoded to WebP at 1600 px and 480 px. Re-encoding strips all metadata, including GPS
coordinates from phone photos. Clients get `url` (large) and `thumb_url`; cards use
`srcset` so phones download the small one. Uploads are one file per request (sequential
in the UI) so each file reports progress and fails independently. Sort orders stay
contiguous from 0, and the cover is always `sort_order = 0`. A non-draft listing can't
lose its last photo. If saving the database row fails, the stored objects are removed;
deleting a photo removes its objects after the commit (best effort, logged).

## D24. Geocoding through the backend

The admin location search goes through `GET /api/admin/geocode`. This keeps the provider
switchable (`GEOCODING_URL`), applies its usage policy in one place (identifying
User-Agent, a global 1 request/second limit, a 24 h in-memory cache), limits results to
the service area, and means admins never need a key. Picking a search result sets
precision to *approximate*, because results are often a street or district; the admin
confirms *exact* explicitly.

## D25. Admin forms

React Hook Form + Zod for client-side validation. Messages are i18n keys, and inputs
stay strings while editing (prices accept "13,500,000"). The backend stays authoritative:
the status panel shows its `missing_fields`, and server errors are mapped to translated
messages by error code. Photos need a saved listing, so the first save creates a draft and
opens the edit page. The admin chunk (forms, validation) is lazy-loaded and never
downloaded by regular users.
