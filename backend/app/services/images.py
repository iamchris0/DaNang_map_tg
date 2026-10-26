"""Listing photos: validation, optimisation and storage."""

import io
import logging
import uuid
from dataclasses import dataclass

from fastapi.concurrency import run_in_threadpool
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import AppError
from app.core.config import Settings
from app.core.storage import ObjectStorage
from app.models import Apartment, ApartmentImage
from app.models.enums import ApartmentStatus

logger = logging.getLogger(__name__)

# Declared MIME type -> Pillow format the file contents must actually have.
ALLOWED_TYPES = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}
OUTPUT_TYPE = "image/webp"
# Served variants: name -> longest side in pixels. "lg" is the reference size.
VARIANTS = {"lg": 1600, "sm": 480}
WEBP_QUALITY = 80
# Refuse decompression bombs well before they exhaust memory (about 8000 x 5000 px).
Image.MAX_IMAGE_PIXELS = 40_000_000


def variant_key(storage_key: str, variant: str) -> str:
    return f"{storage_key}/{variant}.webp"


@dataclass(frozen=True, slots=True)
class ProcessedImage:
    width: int
    height: int
    variants: dict[str, bytes]


def _invalid(message: str) -> AppError:
    return AppError("invalid_image", message, status_code=422)


def process_image(data: bytes, declared_type: str) -> ProcessedImage:
    """Validate an upload and produce optimised WebP variants (metadata stripped)."""
    expected_format = ALLOWED_TYPES.get(declared_type)
    if expected_format is None:
        raise AppError(
            "unsupported_image_type",
            "Only JPEG, PNG and WebP images are supported",
            status_code=415,
        )
    try:
        with Image.open(io.BytesIO(data)) as probe:
            actual_format = probe.format
            probe.verify()
        if actual_format != expected_format:
            raise _invalid("File contents do not match the declared image type")
        with Image.open(io.BytesIO(data)) as source:
            source.load()
            image = ImageOps.exif_transpose(source)
    except Image.DecompressionBombError as exc:
        raise _invalid("Image dimensions are too large") from exc
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError) as exc:
        raise _invalid("File is not a valid image") from exc

    has_alpha = image.mode in ("RGBA", "LA") or "transparency" in image.info
    image = image.convert("RGBA" if has_alpha else "RGB")

    variants: dict[str, bytes] = {}
    reference = image
    for name, max_side in VARIANTS.items():
        resized = image.copy()
        resized.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
        if name == "lg":
            reference = resized
        buffer = io.BytesIO()
        resized.save(buffer, format="WEBP", quality=WEBP_QUALITY, method=4)
        variants[name] = buffer.getvalue()
    return ProcessedImage(width=reference.width, height=reference.height, variants=variants)


async def _lock_apartment(db: AsyncSession, apartment_id: uuid.UUID) -> Apartment:
    apartment = await db.scalar(
        select(Apartment)
        .where(Apartment.id == apartment_id, Apartment.deleted_at.is_(None))
        .with_for_update()
    )
    if apartment is None:
        raise AppError("listing_not_found", "Listing not found", status_code=404)
    return apartment


async def _images(db: AsyncSession, apartment_id: uuid.UUID) -> list[ApartmentImage]:
    result = await db.scalars(
        select(ApartmentImage)
        .where(ApartmentImage.apartment_id == apartment_id)
        .order_by(ApartmentImage.sort_order)
    )
    return list(result.all())


async def add_image(
    db: AsyncSession,
    storage: ObjectStorage,
    settings: Settings,
    apartment_id: uuid.UUID,
    data: bytes,
    content_type: str,
) -> ApartmentImage:
    if len(data) > settings.image_max_upload_mb * 1024 * 1024:
        raise AppError(
            "file_too_large",
            f"Images must be at most {settings.image_max_upload_mb} MB",
            status_code=413,
        )
    await _lock_apartment(db, apartment_id)
    count = await db.scalar(select(func.count()).where(ApartmentImage.apartment_id == apartment_id))
    if (count or 0) >= settings.image_max_per_listing:
        await db.rollback()
        raise AppError(
            "too_many_images",
            f"A listing can have at most {settings.image_max_per_listing} photos",
            status_code=409,
        )

    processed = await run_in_threadpool(process_image, data, content_type)
    image_id = uuid.uuid4()
    storage_key = f"apartments/{apartment_id}/{image_id}"
    keys = [variant_key(storage_key, name) for name in processed.variants]
    for name, payload in processed.variants.items():
        await run_in_threadpool(storage.put, variant_key(storage_key, name), payload, OUTPUT_TYPE)

    image = ApartmentImage(
        id=image_id,
        apartment_id=apartment_id,
        storage_key=storage_key,
        sort_order=count or 0,
        width=processed.width,
        height=processed.height,
        content_type=OUTPUT_TYPE,
    )
    db.add(image)
    try:
        await db.commit()
    except Exception:
        # Don't leave orphaned objects behind if the row could not be saved.
        await run_in_threadpool(_delete_quietly, storage, keys)
        raise
    return image


async def delete_image(
    db: AsyncSession, storage: ObjectStorage, apartment_id: uuid.UUID, image_id: uuid.UUID
) -> None:
    apartment = await _lock_apartment(db, apartment_id)
    images = await _images(db, apartment_id)
    target = next((image for image in images if image.id == image_id), None)
    if target is None:
        await db.rollback()
        raise AppError("image_not_found", "Image not found", status_code=404)
    if apartment.status is not ApartmentStatus.DRAFT and len(images) == 1:
        await db.rollback()
        raise AppError(
            "listing_incomplete",
            "A published listing needs at least one photo",
            status_code=422,
            details={"missing_fields": ["images"]},
        )
    await db.delete(target)
    # Keep sort orders contiguous from 0 so the cover is always sort_order 0.
    for index, image in enumerate(i for i in images if i.id != image_id):
        image.sort_order = index
    await db.commit()
    await run_in_threadpool(
        _delete_quietly, storage, [variant_key(target.storage_key, name) for name in VARIANTS]
    )


async def reorder_images(
    db: AsyncSession, apartment_id: uuid.UUID, image_ids: list[uuid.UUID]
) -> list[ApartmentImage]:
    """Apply a new order; the first image becomes the cover."""
    await _lock_apartment(db, apartment_id)
    images = await _images(db, apartment_id)
    by_id = {image.id: image for image in images}
    if len(image_ids) != len(by_id) or set(image_ids) != set(by_id):
        await db.rollback()
        raise AppError(
            "invalid_image_order",
            "The new order must list every photo of the listing exactly once",
            status_code=422,
        )
    # The (apartment_id, sort_order) unique constraint is deferred to commit time.
    for index, image_id in enumerate(image_ids):
        by_id[image_id].sort_order = index
    await db.commit()
    return sorted(images, key=lambda image: image.sort_order)


def _delete_quietly(storage: ObjectStorage, keys: list[str]) -> None:
    try:
        storage.delete(keys)
    except Exception:
        logger.exception("Failed to delete image objects %s", keys)
