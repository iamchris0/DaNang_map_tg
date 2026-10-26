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
