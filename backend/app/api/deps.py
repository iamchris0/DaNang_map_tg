import uuid
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import AppError
from app.core import rate_limit
from app.core.config import Settings, get_settings
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import User
from app.services import apartments
from app.services.users import is_admin, listing_owner_scope

_bearer = HTTPBearer(auto_error=False)

DbSession = Annotated[AsyncSession, Depends(get_db)]
AppSettings = Annotated[Settings, Depends(get_settings)]


async def _user_from_token(db: AsyncSession, settings: Settings, token: str) -> User | None:
    user_id = decode_access_token(settings, token)
    return await db.get(User, user_id) if user_id else None


async def get_current_user(
    db: DbSession,
    settings: AppSettings,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if credentials is None:
        raise AppError("unauthorized", "Authentication required", status_code=401)
    user = await _user_from_token(db, settings, credentials.credentials)
    if user is None:
        raise AppError("unauthorized", "Invalid or expired session", status_code=401)
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_optional_user(
    db: DbSession,
    settings: AppSettings,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User | None:
    """Public routes: the signed-in user if the token is valid, otherwise anonymous."""
    if credentials is None:
        return None
    return await _user_from_token(db, settings, credentials.credentials)


OptionalUser = Annotated[User | None, Depends(get_optional_user)]


async def require_admin(user: CurrentUser, settings: AppSettings) -> User:
    if not is_admin(settings, user):
        raise AppError("forbidden", "Administrator access required", status_code=403)
    return user


AdminUser = Annotated[User, Depends(require_admin)]


def owner_scope(admin: AdminUser, settings: AppSettings) -> uuid.UUID | None:
    """None for configured administrators (every listing); a landlord's own user id."""
    return listing_owner_scope(settings, admin)


OwnerScope = Annotated[uuid.UUID | None, Depends(owner_scope)]


async def require_listing_access(apartment_id: uuid.UUID, db: DbSession, owner: OwnerScope) -> None:
    """For every /admin/apartments/{apartment_id}/… route: landlords only reach their own."""
    if owner is not None:
        await apartments.ensure_owner(db, apartment_id, owner)


async def limit_auth(request: Request, settings: AppSettings) -> None:
    client = request.client.host if request.client else "unknown"
    await rate_limit.enforce(settings.rate_limit_auth, "auth", client)


async def limit_admin_write(admin: AdminUser, settings: AppSettings) -> None:
    await rate_limit.enforce(settings.rate_limit_admin_write, "admin-write", str(admin.id))
