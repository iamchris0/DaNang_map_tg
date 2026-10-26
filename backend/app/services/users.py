from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.security import TelegramWebAppUser
from app.models import User
from app.models.enums import Language, UserRole


def is_admin(settings: Settings, user: User) -> bool:
    """Admin rights come from configuration only, evaluated on every request."""
    return user.telegram_user_id in settings.admin_telegram_user_ids


def _language_from_code(code: str | None) -> Language | None:
    base = (code or "").lower().split("-")[0]
    return Language(base) if base in Language._value2member_map_ else None


async def upsert_telegram_user(
    session: AsyncSession, settings: Settings, tg_user: TelegramWebAppUser
) -> User:
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
    user.role = UserRole.ADMIN if tg_user.id in settings.admin_telegram_user_ids else UserRole.USER
    await session.commit()
    await session.refresh(user)
    return user
