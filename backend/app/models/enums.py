from enum import StrEnum

from sqlalchemy import Enum


class UserRole(StrEnum):
    USER = "user"  # tenant: browses the catalog
    LANDLORD = "landlord"  # chosen in the bot after sharing a contact; manages own listings
    ADMIN = "admin"  # cached from ADMIN_TELEGRAM_USER_IDS; manages every listing


class Language(StrEnum):
    EN = "en"
    RU = "ru"
    VI = "vi"


class ApartmentStatus(StrEnum):
    DRAFT = "draft"
    AVAILABLE = "available"
    RENTED = "rented"
    ARCHIVED = "archived"


class LocationPrecision(StrEnum):
    EXACT = "exact"
    APPROXIMATE = "approximate"


class ContactType(StrEnum):
    TELEGRAM_USERNAME = "telegram_username"
    TELEGRAM_LINK = "telegram_link"
    PHONE = "phone"


class PublicationStatus(StrEnum):
    PENDING = "pending"  # attempt recorded, Bot API call in flight
    SUCCEEDED = "succeeded"  # Telegram confirmed, message id stored
    FAILED = "failed"  # Telegram definitively rejected; safe to retry
    UNKNOWN = "unknown"  # outcome unconfirmed (e.g. timeout); needs manual resolution


def str_enum(enum_cls: type[StrEnum], name: str) -> Enum:
    """VARCHAR column restricted by a CHECK constraint, storing enum *values*."""
    return Enum(
        enum_cls,
        name=name,
        native_enum=False,
        create_constraint=True,
        length=32,
        values_callable=lambda cls: [member.value for member in cls],
        validate_strings=True,
    )
