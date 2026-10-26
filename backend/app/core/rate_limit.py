"""Rate limiting for sensitive operations.

In-process storage is sufficient for the single-instance MVP deployment. Switching to a
shared backend (e.g. Redis) is a one-line change via `limits.aio.storage.storage_from_string`.
"""

from limits import parse
from limits.aio.storage import MemoryStorage
from limits.aio.strategies import MovingWindowRateLimiter

from app.api.errors import AppError

storage = MemoryStorage()
_limiter = MovingWindowRateLimiter(storage)


async def enforce(limit: str, scope: str, key: str) -> None:
    """Record a hit for `key` in `scope`; raise 429 when `limit` (e.g. "20/minute") is exceeded."""
    if not await _limiter.hit(parse(limit), scope, key):
        raise AppError("rate_limited", "Too many requests, please slow down", status_code=429)
