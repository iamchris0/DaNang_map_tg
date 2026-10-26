import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware

from app.api.errors import register_error_handlers
from app.api.router import api_router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.storage import ensure_bucket
from app.db.session import get_engine
from app.services.telegram_publisher import close_publishers

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    if settings.telegram_bot_username and not settings.telegram_mini_app_short_name:
        logger.warning(
            "TELEGRAM_MINI_APP_SHORT_NAME is empty: listing links in channel posts open the "
            "website instead of the Mini App (create one with /newapp in @BotFather)"
        )
    if settings.s3_auto_create_bucket:
        await _ensure_bucket_with_retry()
    yield
    await close_publishers()
    await get_engine().dispose()


async def _ensure_bucket_with_retry(attempts: int = 10, delay_seconds: float = 2.0) -> None:
    # Object storage may still be starting alongside the API in Docker Compose.
    for attempt in range(1, attempts + 1):
        try:
            await run_in_threadpool(ensure_bucket)
            return
        except Exception as exc:
            logger.warning("S3 bucket not ready (attempt %d/%d): %s", attempt, attempts, exc)
            await asyncio.sleep(delay_seconds)
    # Readiness endpoint will report storage as down; don't block startup.
    logger.error("Giving up on creating the S3 bucket")


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(
        title="Da Nang Apartments API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url=None if settings.is_production else "/api/docs",
        redoc_url=None,
        openapi_url=None if settings.is_production else "/api/openapi.json",
    )
    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=False,
            allow_methods=["GET", "POST", "PATCH", "DELETE"],
            allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
        )
    register_error_handlers(app)
    app.include_router(api_router)
    return app


app = create_app()
