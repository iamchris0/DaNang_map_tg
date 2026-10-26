"""Validation and normalisation of agent/owner contact details."""

import re

from app.models.enums import ContactType

_USERNAME = re.compile(r"^[A-Za-z][A-Za-z0-9_]{3,31}$")
_PHONE_DIGITS = re.compile(r"^\d{8,15}$")
_TELEGRAM_LINK = re.compile(
    r"^(?:(?:https?://)?(?:t\.me|telegram\.me)/(?P<path>\+?[A-Za-z0-9_]+)/?"
    r"|tg://resolve\?domain=(?P<domain>[A-Za-z0-9_]+))$",
    re.IGNORECASE,
)


class ContactError(ValueError):
    pass


def normalize_telegram_username(value: str) -> str:
    username = value.strip().removeprefix("@")
    if not _USERNAME.fullmatch(username):
        raise ContactError("Invalid Telegram username")
    return username


def _normalize_phone(value: str) -> str:
    digits = re.sub(r"[\s().-]", "", value.strip())
    has_plus = digits.startswith("+")
    digits = digits.removeprefix("+")
    if not _PHONE_DIGITS.fullmatch(digits):
        raise ContactError("Invalid phone number")
    return f"+{digits}" if has_plus else digits


def _normalize_telegram_link(value: str) -> str:
    match = _TELEGRAM_LINK.fullmatch(value.strip())
    if not match:
        raise ContactError("Invalid Telegram link; use https://t.me/<username>")
    path = match.group("path") or match.group("domain")
    if path.startswith("+"):
        # t.me/+<phone> opens a chat by phone number; invite links (+<hash>) are rejected.
        if not _PHONE_DIGITS.fullmatch(path[1:]):
            raise ContactError("Invalid Telegram link; group invite links are not supported")
        return f"https://t.me/{path}"
    return f"https://t.me/{normalize_telegram_username(path)}"


def normalize_contact(contact_type: ContactType, value: str) -> str:
    match contact_type:
        case ContactType.TELEGRAM_USERNAME:
            return normalize_telegram_username(value)
        case ContactType.TELEGRAM_LINK:
            return _normalize_telegram_link(value)
        case ContactType.PHONE:
            return _normalize_phone(value)


def contact_url(contact_type: ContactType, value: str) -> str:
    """URL a client can open for an already-normalised contact."""
    match contact_type:
        case ContactType.TELEGRAM_USERNAME:
            return f"https://t.me/{value}"
        case ContactType.TELEGRAM_LINK:
            return value
        case ContactType.PHONE:
            return f"tel:{value if value.startswith('+') else '+' + value}"
