import logging
from typing import Any

import pytest
from pydantic import ValidationError

from app.core.config import Environment, Settings
from app.core.logging import RedactingFilter

PROD_OK: dict[str, Any] = {
    "environment": "production",
    "session_secret": "x" * 32,
    "telegram_bot_token": "123456:abc",
    # Explicit, so values from the surrounding environment (e.g. Docker) can't leak in.
    "dev_auth_enabled": False,
    "s3_auto_create_bucket": False,
}


def test_comma_separated_lists(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ADMIN_TELEGRAM_USER_IDS", "111, 222,,333")
    monkeypatch.setenv("CORS_ORIGINS", "https://a.example, https://b.example")
    settings = Settings(_env_file=None)
    assert settings.admin_telegram_user_ids == frozenset({111, 222, 333})
    assert settings.cors_origins == ["https://a.example", "https://b.example"]


def test_empty_admin_list(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ADMIN_TELEGRAM_USER_IDS", "")
    assert Settings(_env_file=None).admin_telegram_user_ids == frozenset()


def test_production_accepts_safe_config() -> None:
    settings = Settings(_env_file=None, **PROD_OK)
    assert settings.environment is Environment.PRODUCTION


@pytest.mark.parametrize(
    "override",
    [
        {"dev_auth_enabled": True},
        {"session_secret": "short"},
        {"telegram_bot_token": ""},
        {"s3_auto_create_bucket": True},
    ],
)
def test_production_rejects_unsafe_config(override: dict[str, Any]) -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **{**PROD_OK, **override})


def test_dev_auth_allowed_outside_production() -> None:
    settings = Settings(_env_file=None, environment="development", dev_auth_enabled=True)
    assert settings.dev_auth_enabled


@pytest.mark.parametrize(
    ("message", "leaked"),
    [
        ("token 1234567890:AAH-abcdefghijklmnopqrstuvwxyz0123456", "AAH-abcdef"),
        ("Authorization: Bearer eyJhbGciOi.payload.sig", "eyJhbGciOi"),
        ("initData user=...&hash=" + "a" * 64, "a" * 64),
    ],
)
def test_log_redaction(message: str, leaked: str) -> None:
    record = logging.LogRecord("t", logging.INFO, __file__, 1, message, None, None)
    RedactingFilter().filter(record)
    assert leaked not in record.getMessage()
