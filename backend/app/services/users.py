import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.security import TelegramWebAppUser
from app.models import User
from app.models.enums import Language, UserRole


def is_super_admin(settings: Settings, user: User) -> bool:
    """Configured administrators (ADMIN_TELEGRAM_USER_IDS), evaluated on every request."""
    return user.telegram_user_id in settings.admin_telegram_user_ids


def is_admin(settings: Settings, user: User) -> bool:
    """May use the admin panel: configured administrators and landlords."""
    return is_super_admin(settings, user) or user.role is UserRole.LANDLORD


def listing_owner_scope(settings: Settings, user: User) -> uuid.UUID | None:
    """Whose listings this user manages: None for every listing, else only their own."""
    return None if is_super_admin(settings, user) else user.id


def effective_role(settings: Settings, user: User) -> UserRole:
    if is_super_admin(settings, user):
        return UserRole.ADMIN
    return UserRole.LANDLORD if user.role is UserRole.LANDLORD else UserRole.USER


def _language_from_code(code: str | None) -> Language | None:
    base = (code or "").lower().split("-")[0]
    return Language(base) if base in Language._value2member_map_ else None


async def upsert_telegram_user(
    session: AsyncSession, settings: Settings, tg_user: TelegramWebAppUser
) -> User:
    """Create or refresh the user behind a Telegram account (Mini App login or bot chat)."""
    user = await session.scalar(
        select(User).where(User.telegram_user_id == tg_user.id).with_for_update()
    )
    if user is None:
        user = User(
            telegram_user_id=tg_user.id,
            preferred_language=_language_from_code(tg_user.language_code),
        )
        session.add(user)
    user.username = tg_user.username
    user.display_name = tg_user.display_name or None
    # A landlord keeps their role; ADMIN follows the configuration.
    if user.role is not UserRole.LANDLORD or is_super_admin(settings, user):
        user.role = effective_role(settings, user)
    await session.commit()
    await session.refresh(user)
    return user


async def choose_tenant(session: AsyncSession, settings: Settings, user: User) -> User:
    if not is_super_admin(settings, user):
        user.role = UserRole.USER
    user.role_selected_at = user.role_selected_at or datetime.now(UTC)
    await session.commit()
    return user


async def become_landlord(
    session: AsyncSession, settings: Settings, user: User, phone_number: str
) -> User:
    """Called once the user has shared their own contact through Telegram."""
    user.phone_number = phone_number[:32]
    if not is_super_admin(settings, user):
        user.role = UserRole.LANDLORD
    user.role_selected_at = user.role_selected_at or datetime.now(UTC)
    await session.commit()
    return user
