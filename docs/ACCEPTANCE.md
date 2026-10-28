# MVP acceptance checklist

Status of the 22 acceptance criteria from the specification. "Automated" means covered by
the test suites (backend pytest incl. PostGIS, frontend Vitest, Playwright end-to-end on
mobile and desktop viewports). "Manual" means checked by hand against the running stack.

| # | Criterion | Evidence | Status |
|---|---|---|---|
| 1 | The Telegram bot opens the Mini App | `/start` button + chat menu button (`app/bot`), unit tests; menu button confirmed set via Bot API | ⚠️ Needs a confirmation on a phone with the production build over HTTPS (see DEPLOYMENT.md, "Testing inside Telegram") |
| 2 | A regular user sees the apartment map | e2e `browse` (real MapLibre), Vitest map tests | ✅ |
| 3 | Markers display rental prices | e2e/Vitest (`12M ₫`, `~7.5M ₫` for approximate) | ✅ |
| 4 | Markers open relevant previews | e2e/Vitest (preview card with photo, price, district, area, rooms) | ✅ |
| 5 | Full apartment details | e2e/Vitest details tests (facts, missing fields hidden, map, contacts) | ✅ |
| 6 | Filters work on map and list | e2e `filters apply to both map and list views`, backend filter tests | ✅ |
| 7 | Contact agent and channel admin | Vitest contact tests (browser + Telegram link handling) | ✅ |
| 8 | English, Russian and Vietnamese UI | e2e language test, translation key parity check (Vitest), Russian plurals | ✅ |
| 9 | Admin can create a draft | e2e admin flow, backend CRUD tests | ✅ |
| 10 | Admin uploads real images and sets coordinates | Real uploads verified in the browser against the dev stack (WebP variants in S3); address search + map pin; e2e admin flow; backend image tests | ✅ |
| 11 | Valid listing → Available → appears on the public map | Backend lifecycle + public visibility tests; e2e admin publish; manual | ✅ |
| 12 | Admin can edit the listing | Vitest edit test, backend PATCH tests | ✅ |
| 13 | Rented removes it from the public catalog | Backend visibility tests (410 for rented), manual smoke test | ✅ |
| 14 | Admin can preview a Telegram post | Backend preview tests, Vitest/e2e preview sheet | ✅ |
| 15 | Confirmed publish creates a channel post | Real Bot API call path verified (photo upload + album) against Telegram; mocked success paths tested | ⚠️ One real post to your channel still to be done by an administrator (automation was not permitted to post) |
| 16 | Message ID and status stored | Backend publication tests | ✅ |
| 17 | No duplicate posts on repeats/retries | Idempotency + live-publication index + UI same-key retry; backend and Vitest tests | ✅ |
| 18 | Ordinary users cannot invoke admin operations | Backend 401/403 tests for every admin endpoint | ✅ |
| 19 | Data and images survive restarts | Named volumes; containers recreated many times during development with data intact | ✅ |
| 20 | Works on mobile and desktop | Playwright `mobile` (Pixel 7) and `desktop` projects; manual checks at 375 px and desktop widths | ✅ |
| 21 | Started with documented instructions | README (development), DEPLOYMENT.md (production) | ✅ |
| 22 | Critical automated tests pass | Backend 244, Vitest 57, Playwright 10 | ✅ |

## Remaining limitations

- **Telegram webview confirmation (1, 15):** these need a person in Telegram. Client-side
  errors from the webview are now reported to the backend log (`Client error: …`), which
  makes any remaining issue diagnosable.
- **Map tiles:** OpenFreeMap's public instance is used by default. For significant traffic,
  self-host tiles or use a paid provider (`VITE_MAP_STYLE_URL`).
- **Geocoding:** public Nominatim (light use, 1 request/second). Configure your own instance
  or a provider for heavier admin use.
- **Rate limiting** is in-process (single backend instance), as designed for the MVP.
- **Reposting** to the channel and automatic updates of existing posts are out of scope.
