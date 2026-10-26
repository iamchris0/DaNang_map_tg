"""Explicit, duplicate-safe publication of listings to the Telegram channel.

Flow: lock listing → reuse result for a repeated idempotency key → refuse if a live
publication exists → record a `pending` attempt (committed; a partial unique index makes a
second live attempt impossible) → call Telegram outside any transaction → store
`succeeded`, `failed` (Telegram rejected it; safe to try again) or `unknown` (outcome
unconfirmed; never retried automatically, an administrator resolves it).
"""

import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.errors import AppError
from app.core.config import Settings
from app.core.storage import ObjectStorage
from app.models import Apartment, TelegramPublication, User
from app.models.enums import ApartmentStatus, PublicationStatus
from app.services.images import variant_key
from app.services.telegram_post import MAX_MEDIA_GROUP, TelegramPost, build_post
from app.services.telegram_publisher import ChannelPublisher, classify_error, to_jpeg

logger = logging.getLogger(__name__)

LIVE_STATUSES = (PublicationStatus.PENDING, PublicationStatus.SUCCEEDED, PublicationStatus.UNKNOWN)


def is_configured(settings: Settings) -> bool:
    return bool(settings.telegram_bot_token.get_secret_value() and settings.telegram_channel_id)


def _not_found() -> AppError:
    return AppError("listing_not_found", "Listing not found", status_code=404)


async def _load(db: AsyncSession, apartment_id: uuid.UUID, *, lock: bool) -> Apartment:
    query = (
        select(Apartment)
        .where(Apartment.id == apartment_id, Apartment.deleted_at.is_(None))
        .options(selectinload(Apartment.district), selectinload(Apartment.images))
    )
    if lock:
        query = query.with_for_update(of=Apartment)
    apartment = await db.scalar(query)
    if apartment is None:
        raise _not_found()
    return apartment


async def expire_stale_pending(db: AsyncSession, settings: Settings) -> None:
    """A pending attempt that never finished (crash, hang) becomes `unknown`."""
    cutoff = datetime.now(UTC) - timedelta(seconds=settings.telegram_pending_timeout_seconds)
    await db.execute(
        update(TelegramPublication)
        .where(
            TelegramPublication.status == PublicationStatus.PENDING,
            TelegramPublication.created_at < cutoff,
        )
        .values(
            status=PublicationStatus.UNKNOWN,
            error_code="unconfirmed",
            error_message="The publication attempt did not finish; check the channel.",
        )
    )


async def live_publication(
    db: AsyncSession, apartment_id: uuid.UUID, channel_id: str
) -> TelegramPublication | None:
    return await db.scalar(
        select(TelegramPublication).where(
            TelegramPublication.apartment_id == apartment_id,
            TelegramPublication.telegram_channel_id == channel_id,
            TelegramPublication.status.in_(LIVE_STATUSES),
        )
    )


async def history(db: AsyncSession, apartment_id: uuid.UUID) -> list[TelegramPublication]:
    result = await db.scalars(
        select(TelegramPublication)
        .where(TelegramPublication.apartment_id == apartment_id)
        .order_by(TelegramPublication.created_at.desc())
    )
    return list(result.all())


@dataclass(frozen=True, slots=True)
class Preview:
    post: TelegramPost | None
    photo_storage_keys: list[str]
    blockers: list[str]
    live: TelegramPublication | None


async def preview(db: AsyncSession, settings: Settings, apartment_id: uuid.UUID) -> Preview:
    apartment = await _load(db, apartment_id, lock=False)
    await expire_stale_pending(db, settings)
    await db.commit()
    blockers: list[str] = []
    if not is_configured(settings):
        blockers.append("telegram_not_configured")
    if apartment.status is not ApartmentStatus.AVAILABLE:
        blockers.append("listing_not_available")
    live = await live_publication(db, apartment.id, settings.telegram_channel_id)
    if live is not None:
        blockers.append("already_published")
    keys = [image.storage_key for image in apartment.images[:MAX_MEDIA_GROUP]]
    try:
        post: TelegramPost | None = build_post(settings, apartment, with_media=bool(keys))
    except ValueError:
        post = None
        if "listing_not_available" not in blockers:
            blockers.append("listing_not_available")
    return Preview(post=post, photo_storage_keys=keys, blockers=blockers, live=live)


def _already_published(publication: TelegramPublication) -> AppError:
    return AppError(
        "already_published",
        "This listing already has a channel post (or an unconfirmed attempt).",
        status_code=409,
        details={"publication_id": str(publication.id), "status": publication.status},
    )


async def publish(
    db: AsyncSession,
    settings: Settings,
    publisher: ChannelPublisher,
    storage: ObjectStorage,
    admin: User,
    apartment_id: uuid.UUID,
    idempotency_key: str,
) -> TelegramPublication:
    if not is_configured(settings):
        raise AppError(
            "telegram_not_configured",
            "TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID must be configured",
            status_code=503,
        )
    channel_id = settings.telegram_channel_id

    # A repeated request (double click, client retry) gets the original attempt back.
    replay = await db.scalar(
        select(TelegramPublication).where(TelegramPublication.idempotency_key == idempotency_key)
    )
    if replay is not None:
        if replay.apartment_id != apartment_id:
            raise AppError(
                "idempotency_key_reused",
                "This idempotency key belongs to another listing",
                status_code=422,
            )
        return replay

    apartment = await _load(db, apartment_id, lock=True)
    if apartment.status is not ApartmentStatus.AVAILABLE:
        await db.rollback()
        raise AppError(
            "listing_not_available",
            "Only available listings can be posted to the channel",
            status_code=409,
        )
    await expire_stale_pending(db, settings)
    live = await live_publication(db, apartment.id, channel_id)
    if live is not None:
        error = _already_published(live)  # read the record before rollback expires it
        await db.rollback()
        raise error

    post = build_post(settings, apartment, with_media=bool(apartment.images))
    photo_keys = [variant_key(image.storage_key, "lg") for image in apartment.images]
    photo_keys = photo_keys[:MAX_MEDIA_GROUP]
    publication = TelegramPublication(
        apartment_id=apartment.id,
        telegram_channel_id=channel_id,
        published_by=admin.id,
        status=PublicationStatus.PENDING,
        # Wall-clock time rather than the transaction timestamp, so attempts order correctly.
        created_at=datetime.now(UTC),
        idempotency_key=idempotency_key,
    )
    db.add(publication)
    try:
        await db.commit()
    except IntegrityError:
        # Lost a race with a concurrent request: same key, or another live attempt.
        await db.rollback()
        replay = await db.scalar(
            select(TelegramPublication).where(
                TelegramPublication.idempotency_key == idempotency_key
            )
        )
        if replay is not None:
            return replay
        live = await live_publication(db, apartment_id, channel_id)
        if live is not None:
            raise _already_published(live) from None
        raise

    try:
        photos = [await run_in_threadpool(_read_jpeg, storage, key) for key in photo_keys]
    except Exception as exc:
        logger.exception("Could not read listing photos for publication %s", publication.id)
        publication.status = PublicationStatus.FAILED
        publication.error_code = "media_unavailable"
        publication.error_message = f"{type(exc).__name__}: {exc}"[:2000]
        await db.commit()
        return publication

    try:
        message_id = await publisher.publish(channel_id, post.html, photos)
    except Exception as exc:
        failure = classify_error(exc)
        logger.warning(
            "Publication %s %s (%s): %s", publication.id, failure.status, failure.code, exc
        )
        publication.status = failure.status
        publication.error_code = failure.code
        publication.error_message = failure.message[:2000]
    else:
        publication.status = PublicationStatus.SUCCEEDED
        publication.telegram_message_id = message_id
        publication.published_at = datetime.now(UTC)
        publication.error_code = None
        publication.error_message = None
    await db.commit()
    return publication


def _read_jpeg(storage: ObjectStorage, key: str) -> bytes:
    return to_jpeg(storage.get(key))


async def resolve_unknown(
    db: AsyncSession,
    apartment_id: uuid.UUID,
    publication_id: uuid.UUID,
    *,
    was_published: bool,
    message_id: int | None,
) -> TelegramPublication:
    """An administrator checked the channel and reports what actually happened."""
    publication = await db.scalar(
        select(TelegramPublication)
        .where(
            TelegramPublication.id == publication_id,
            TelegramPublication.apartment_id == apartment_id,
        )
        .with_for_update()
    )
    if publication is None:
        raise AppError("publication_not_found", "Publication not found", status_code=404)
    if publication.status is not PublicationStatus.UNKNOWN:
        await db.rollback()
        raise AppError(
            "publication_not_unconfirmed",
            "Only unconfirmed publications can be resolved",
            status_code=409,
        )
    if was_published:
        publication.status = PublicationStatus.SUCCEEDED
        publication.telegram_message_id = message_id
        publication.published_at = publication.published_at or datetime.now(UTC)
        publication.error_code = None
        publication.error_message = None
    else:
        publication.status = PublicationStatus.FAILED
        publication.error_code = "not_published"
        publication.error_message = "An administrator confirmed the post did not appear."
    await db.commit()
    return publication
