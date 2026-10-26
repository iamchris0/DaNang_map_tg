"""Address search for the admin location picker, proxied through the backend so the
provider, its rate limit and its usage policy are handled in one place."""

import logging
import time
from dataclasses import dataclass

import httpx

from app.api.errors import AppError
from app.core import rate_limit
from app.core.config import Settings

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 24 * 60 * 60
CACHE_MAX_ENTRIES = 500
_cache: dict[tuple[str, str], tuple[float, list["GeocodeResult"]]] = {}
# Tests swap in httpx.MockTransport; None means real network access.
transport: httpx.AsyncBaseTransport | None = None


@dataclass(frozen=True, slots=True)
class GeocodeResult:
    label: str
    latitude: float
    longitude: float
    kind: str | None


async def _fetch(settings: Settings, query: str, language: str) -> list[GeocodeResult]:
    min_lng, min_lat, max_lng, max_lat = settings.service_area_bbox
    params: dict[str, str | int] = {
        "q": query,
        "format": "jsonv2",
        "limit": 6,
        "countrycodes": "vn",
        "viewbox": f"{min_lng},{max_lat},{max_lng},{min_lat}",
        "bounded": 1,
        "accept-language": language,
    }
    async with httpx.AsyncClient(
        timeout=8, headers={"User-Agent": settings.geocoding_user_agent}, transport=transport
    ) as client:
        response = await client.get(settings.geocoding_url, params=params)
        response.raise_for_status()
        payload = response.json()
    if not isinstance(payload, list):
        raise ValueError("Unexpected geocoder response")
    results = []
    for item in payload:
        try:
            results.append(
                GeocodeResult(
                    label=str(item["display_name"]),
                    latitude=float(item["lat"]),
                    longitude=float(item["lon"]),
                    kind=item.get("addresstype") or item.get("type"),
                )
            )
        except (KeyError, TypeError, ValueError):
            continue
    return results


async def search(settings: Settings, query: str, language: str) -> list[GeocodeResult]:
    key = (query.strip().lower(), language)
    cached = _cache.get(key)
    if cached and time.monotonic() - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]
    # Global limit: public providers (e.g. Nominatim) allow about one request per second.
    await rate_limit.enforce(settings.geocoding_rate_limit, "geocoding", "global")
    try:
        results = await _fetch(settings, query.strip(), language)
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Geocoding failed: %s", exc)
        raise AppError(
            "geocoding_unavailable", "Address search is temporarily unavailable", status_code=502
        ) from exc
    if len(_cache) >= CACHE_MAX_ENTRIES:
        _cache.pop(next(iter(_cache)))
    _cache[key] = (time.monotonic(), results)
    return results


def clear_cache() -> None:
    _cache.clear()
