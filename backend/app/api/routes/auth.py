import logging

from fastapi import APIRouter, Depends, Request

from app.api.deps import AppSettings, CurrentUser, DbSession, limit_auth
from app.api.errors import AppError
from app.core.security import (
    InitDataError,
    TelegramWebAppUser,
    create_access_token,
    verify_init_data,
)
from app.models import User
from app.schemas.auth import (
    AuthResponse,
    DevAuthRequest,
    TelegramAuthRequest,
    UserOut,
    UserPreferencesUpdate,
)
from app.services.users import effective_role, is_admin, set_language, upsert_telegram_user

logger = logging.getLogger(__name__)

# Present when a request was forwarded by a proxy/tunnel (Cloudflare, nginx, Caddy…).
PROXY_HEADERS = ("cf-connecting-ip", "x-forwarded-for", "forwarded", "x-real-ip")
router = APIRouter(prefix="/auth", tags=["auth"])


def _user_out(settings: AppSettings, user: User) -> UserOut:
    return UserOut(
        id=user.id,
        telegram_user_id=user.telegram_user_id,
        username=user.username,
        display_name=user.display_name,
        preferred_language=user.preferred_language,
        is_admin=is_admin(settings, user),
        role=effective_role(settings, user),
    )


def _auth_response(settings: AppSettings, user: User, start_param: str | None) -> AuthResponse:
    token = create_access_token(settings, user.id)
    return AuthResponse(
        access_token=token.token,
        expires_at=token.expires_at,
        user=_user_out(settings, user),
        start_param=start_param,
    )


@router.post("/telegram", response_model=AuthResponse, dependencies=[Depends(limit_auth)])
async def telegram_login(
    body: TelegramAuthRequest, db: DbSession, settings: AppSettings
) -> AuthResponse:
    """Exchange signed Telegram Mini App initData for an API session token."""
    try:
        verified = verify_init_data(
            body.init_data,
            settings.telegram_bot_token.get_secret_value(),
            settings.telegram_init_data_max_age_seconds,
        )
    except InitDataError as exc:
        logger.info("Rejected Telegram initData: %s", exc.reason)
        raise AppError(
            "invalid_init_data",
            "Telegram authentication failed",
            status_code=401,
            details={"reason": exc.reason},
        ) from exc
    user = await upsert_telegram_user(db, settings, verified.user)
    return _auth_response(settings, user, verified.start_param)


@router.post("/dev", response_model=AuthResponse, dependencies=[Depends(limit_auth)])
async def dev_login(
    body: DevAuthRequest, request: Request, db: DbSession, settings: AppSettings
) -> AuthResponse:
    """Local development login without Telegram. Disabled unless DEV_AUTH_ENABLED=true,
    never available in production (enforced at startup), and refused for requests that
    arrive through a proxy or tunnel (e.g. a public HTTPS tunnel for testing in Telegram)."""
    if (
        not settings.dev_auth_enabled
        or settings.is_production
        or any(header in request.headers for header in PROXY_HEADERS)
    ):
        raise AppError("not_found", "Not Found", status_code=404)
    tg_user = TelegramWebAppUser(
        id=body.telegram_user_id,
        first_name=body.display_name or "Developer",
        last_name=None,
        username=body.username,
        language_code=None,
    )
    user = await upsert_telegram_user(db, settings, tg_user)
    return _auth_response(settings, user, None)


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser, settings: AppSettings) -> UserOut:
    return _user_out(settings, user)


@router.patch("/me", response_model=UserOut)
async def update_me(
    body: UserPreferencesUpdate, user: CurrentUser, db: DbSession, settings: AppSettings
) -> UserOut:
    await set_language(db, user, body.preferred_language)
    await db.refresh(user)
    return _user_out(settings, user)
