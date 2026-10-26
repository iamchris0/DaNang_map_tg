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
from app.services.users import is_admin

_bearer = HTTPBearer(auto_error=False)

DbSession = Annotated[AsyncSession, Depends(get_db)]
AppSettings = Annotated[Settings, Depends(get_settings)]


async def get_current_user(
    db: DbSession,
    settings: AppSettings,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if credentials is None:
        raise AppError("unauthorized", "Authentication required", status_code=401)
    user_id = decode_access_token(settings, credentials.credentials)
    user = await db.get(User, user_id) if user_id else None
    if user is None:
        raise AppError("unauthorized", "Invalid or expired session", status_code=401)
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def require_admin(user: CurrentUser, settings: AppSettings) -> User:
    if not is_admin(settings, user):
        raise AppError("forbidden", "Administrator access required", status_code=403)
    return user


AdminUser = Annotated[User, Depends(require_admin)]


async def limit_auth(request: Request, settings: AppSettings) -> None:
    client = request.client.host if request.client else "unknown"
    await rate_limit.enforce(settings.rate_limit_auth, "auth", client)


async def limit_admin_write(admin: AdminUser, settings: AppSettings) -> None:
    await rate_limit.enforce(settings.rate_limit_admin_write, "admin-write", str(admin.id))
