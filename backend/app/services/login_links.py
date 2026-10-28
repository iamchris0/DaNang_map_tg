"""One-time browser sign-in links, sent by the bot to administrators and landlords (/login).

The link carries a random code; only its SHA-256 hash is stored. A code works once and only
until it expires, so a leaked or forwarded link soon becomes useless.
"""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models import LoginCode, User


def _hash(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def login_url(settings: Settings, code: str) -> str:
    return f"{settings.public_app_url.rstrip('/')}/login?code={code}"


async def issue_code(session: AsyncSession, settings: Settings, user: User) -> str:
    """Create a code for `user` and return it (the only time it exists in plain text)."""
    now = datetime.now(UTC)
    # Housekeeping: drop this user's spent or expired codes.
    await session.execute(
        delete(LoginCode).where(
            LoginCode.user_id == user.id,
            (LoginCode.used_at.is_not(None)) | (LoginCode.expires_at <= now),
        )
    )
    code = secrets.token_urlsafe(32)
    session.add(
        LoginCode(
            code_hash=_hash(code),
            user_id=user.id,
            expires_at=now + timedelta(seconds=settings.login_link_ttl_seconds),
        )
    )
    await session.commit()
    return code


async def redeem_code(session: AsyncSession, code: str) -> User | None:
    """The user the code belongs to, if it is valid; marks it used in the same statement."""
    now = datetime.now(UTC)
    user_id = await session.scalar(
        update(LoginCode)
        .where(
            LoginCode.code_hash == _hash(code),
            LoginCode.used_at.is_(None),
            LoginCode.expires_at > now,
        )
        .values(used_at=now)
        .returning(LoginCode.user_id)
    )
    await session.commit()
    if user_id is None:
        return None
    return await session.scalar(select(User).where(User.id == user_id))
