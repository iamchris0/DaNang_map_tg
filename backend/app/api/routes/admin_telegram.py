import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header
from sqlalchemy import select

from app.api.deps import AdminUser, AppSettings, DbSession, limit_admin_write, require_admin
from app.core.config import Settings
from app.core.media import image_url
from app.core.storage import ObjectStorage, get_storage
from app.models import TelegramPublication, User
from app.schemas.publications import PublicationOut, ResolvePublication, TelegramPreviewOut
from app.services import publications
from app.services.images import variant_key
from app.services.telegram_post import CAPTION_LIMIT, post_url
from app.services.telegram_publisher import ChannelPublisher, get_publisher

router = APIRouter(
    prefix="/admin/apartments/{apartment_id}",
    tags=["admin", "telegram"],
    dependencies=[Depends(require_admin)],
)
Storage = Annotated[ObjectStorage, Depends(get_storage)]
Publisher = Annotated[ChannelPublisher, Depends(get_publisher)]
IdempotencyKey = Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)]


async def publication_out(db: DbSession, publication: TelegramPublication) -> PublicationOut:
    admin_name = None
    if publication.published_by:
        user = await db.scalar(select(User).where(User.id == publication.published_by))
        if user:
            admin_name = user.display_name or (f"@{user.username}" if user.username else None)
    return PublicationOut(
        id=publication.id,
        status=publication.status,
        telegram_channel_id=publication.telegram_channel_id,
        telegram_message_id=publication.telegram_message_id,
        post_url=post_url(publication.telegram_channel_id, publication.telegram_message_id),
        error_code=publication.error_code,
        error_message=publication.error_message,
        published_by=admin_name,
        created_at=publication.created_at,
        published_at=publication.published_at,
    )


def _settings_language(settings: Settings) -> str:
    return settings.telegram_post_language.value


@router.get("/telegram-preview", response_model=TelegramPreviewOut)
async def telegram_preview(
    apartment_id: uuid.UUID, db: DbSession, settings: AppSettings
) -> TelegramPreviewOut:
    """The exact post that would be sent, plus anything preventing publication."""
    result = await publications.preview(db, settings, apartment_id)
    return TelegramPreviewOut(
        caption_html=result.post.html if result.post else None,
        caption_length=result.post.length if result.post else 0,
        caption_limit=result.post.limit if result.post else CAPTION_LIMIT,
        photo_urls=[
            image_url(settings, variant_key(key, "sm")) for key in result.photo_storage_keys
        ],
        channel_id=settings.telegram_channel_id,
        language=_settings_language(settings),
        can_publish=not result.blockers,
        blockers=result.blockers,
        live_publication=await publication_out(db, result.live) if result.live else None,
    )


@router.post(
    "/publish-telegram",
    response_model=PublicationOut,
    dependencies=[Depends(limit_admin_write)],
)
async def publish_to_telegram(
    apartment_id: uuid.UUID,
    db: DbSession,
    settings: AppSettings,
    admin: AdminUser,
    storage: Storage,
    publisher: Publisher,
    idempotency_key: IdempotencyKey,
) -> PublicationOut:
    """Post the listing to the configured channel. Always explicit, never automatic.

    Send a fresh `Idempotency-Key` per confirmed attempt and reuse it when retrying the
    same request: the original result is returned instead of posting twice.
    """
    publication = await publications.publish(
        db, settings, publisher, storage, admin, apartment_id, idempotency_key
    )
    return await publication_out(db, publication)


@router.get("/telegram-publications", response_model=list[PublicationOut])
async def telegram_publications(apartment_id: uuid.UUID, db: DbSession) -> list[PublicationOut]:
    return [await publication_out(db, p) for p in await publications.history(db, apartment_id)]


@router.post(
    "/telegram-publications/{publication_id}/resolve",
    response_model=PublicationOut,
    dependencies=[Depends(limit_admin_write)],
)
async def resolve_publication(
    apartment_id: uuid.UUID, publication_id: uuid.UUID, body: ResolvePublication, db: DbSession
) -> PublicationOut:
    """Record the outcome of an unconfirmed attempt after checking the channel."""
    publication = await publications.resolve_unknown(
        db,
        apartment_id,
        publication_id,
        was_published=body.was_published,
        message_id=body.message_id,
    )
    return await publication_out(db, publication)
