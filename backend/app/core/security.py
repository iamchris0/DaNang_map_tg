"""Telegram Mini App initData verification and API session tokens."""

import hashlib
import hmac
import json
import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qsl

import jwt

from app.core.config import Settings

logger = logging.getLogger(__name__)

# Allowed clock skew for auth_date values slightly in the future.
_CLOCK_SKEW = timedelta(seconds=60)
_DEV_SESSION_SECRET = "insecure-development-session-secret-change-me"  # noqa: S105
_JWT_ALGORITHM = "HS256"


class InitDataError(Exception):
    """initData is malformed, tampered with, or expired. `reason` is a stable machine code."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


@dataclass(frozen=True, slots=True)
class TelegramWebAppUser:
    id: int
    first_name: str
    last_name: str | None
    username: str | None
    language_code: str | None

    @property
    def display_name(self) -> str:
        return " ".join(part for part in (self.first_name, self.last_name) if part)


@dataclass(frozen=True, slots=True)
class VerifiedInitData:
    user: TelegramWebAppUser
    auth_date: datetime
    start_param: str | None


def verify_init_data(
    init_data: str, bot_token: str, max_age_seconds: int, now: datetime | None = None
) -> VerifiedInitData:
    """Validate Telegram WebApp initData per
    https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
    """
    if not bot_token:
        raise InitDataError("bot_token_not_configured")

    try:
        pairs = parse_qsl(init_data, keep_blank_values=True, strict_parsing=True)
    except ValueError as exc:
        raise InitDataError("malformed") from exc
    fields = dict(pairs)
    if len(fields) != len(pairs):
        raise InitDataError("malformed")

    received_hash = fields.pop("hash", None)
    if not received_hash:
        raise InitDataError("missing_hash")

    data_check_string = "\n".join(f"{key}={value}" for key, value in sorted(fields.items()))
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    expected_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected_hash, received_hash):
        raise InitDataError("invalid_signature")

    try:
        auth_date = datetime.fromtimestamp(int(fields["auth_date"]), tz=UTC)
    except (KeyError, ValueError, OverflowError) as exc:
        raise InitDataError("malformed") from exc
    now = now or datetime.now(UTC)
    if auth_date > now + _CLOCK_SKEW:
        raise InitDataError("invalid_auth_date")
    if now - auth_date > timedelta(seconds=max_age_seconds):
        raise InitDataError("expired")

    try:
        raw_user = json.loads(fields["user"])
        user = TelegramWebAppUser(
            id=int(raw_user["id"]),
            first_name=str(raw_user.get("first_name") or ""),
            last_name=raw_user.get("last_name") or None,
            username=raw_user.get("username") or None,
            language_code=raw_user.get("language_code") or None,
        )
    except (KeyError, ValueError, TypeError) as exc:
        raise InitDataError("missing_user") from exc

    return VerifiedInitData(
        user=user, auth_date=auth_date, start_param=fields.get("start_param") or None
    )


def _session_secret(settings: Settings) -> str:
    secret = settings.session_secret.get_secret_value()
    if secret:
        return secret
    # Production startup refuses an empty secret (see Settings), so this is dev/test only.
    logger.warning("SESSION_SECRET is empty; using an insecure development secret")
    return _DEV_SESSION_SECRET


@dataclass(frozen=True, slots=True)
class AccessToken:
    token: str
    expires_at: datetime


def create_access_token(settings: Settings, user_id: uuid.UUID) -> AccessToken:
    now = datetime.now(UTC)
    expires_at = now + timedelta(minutes=settings.session_ttl_minutes)
    payload = {"sub": str(user_id), "iat": now, "exp": expires_at, "typ": "access"}
    token = jwt.encode(payload, _session_secret(settings), algorithm=_JWT_ALGORITHM)
    return AccessToken(token=token, expires_at=expires_at)


def decode_access_token(settings: Settings, token: str) -> uuid.UUID | None:
    """Return the user id for a valid, unexpired token, else None."""
    try:
        payload = jwt.decode(
            token,
            _session_secret(settings),
            algorithms=[_JWT_ALGORITHM],
            options={"require": ["sub", "exp", "iat"]},
        )
        if payload.get("typ") != "access":
            return None
        return uuid.UUID(payload["sub"])
    except (jwt.PyJWTError, ValueError):
        return None
