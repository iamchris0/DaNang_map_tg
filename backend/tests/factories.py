"""Test data builders and auth helpers.

Builders commit: inside the test fixture that only releases a savepoint, so the data
survives a service-level rollback while the outer test transaction still discards it."""

import hashlib
import hmac
import io
import json
import time
import uuid
from typing import Any
from urllib.parse import urlencode

from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.security import create_access_token
from app.models import Apartment, ApartmentImage, District, User
from app.models.enums import ApartmentStatus, LocationPrecision, UserRole

# A point near My Khe beach, inside the default service area.
BEACH = (16.0612, 108.2475)


def sign_init_data(
    bot_token: str,
    user: dict[str, Any] | None = None,
    auth_date: int | None = None,
    **extra: str,
) -> str:
    """Build initData exactly like Telegram does (sorted data-check-string, HMAC-SHA256)."""
    fields: dict[str, str] = {
        "auth_date": str(auth_date if auth_date is not None else int(time.time())),
        "query_id": "AAHdF6IQAAAAAN0XohDhrOrc",
        **extra,
    }
    if user is not None:
        fields["user"] = json.dumps(user, separators=(",", ":"))
    check_string = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    fields["hash"] = hmac.new(secret, check_string.encode(), hashlib.sha256).hexdigest()
    return urlencode(fields)


async def make_user(db: AsyncSession, telegram_user_id: int, **kwargs: Any) -> User:
    user = User(telegram_user_id=telegram_user_id, **{"role": UserRole.USER, **kwargs})
    db.add(user)
    await db.commit()
    return user


def auth_headers(settings: Settings, user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(settings, user.id).token}"}


async def district_id(db: AsyncSession, slug: str = "son-tra") -> int:
    found = await db.scalar(select(District.id).where(District.slug == slug))
    if found is None:
        raise LookupError(slug)
    return found


def image_bytes(
    image_format: str = "JPEG", size: tuple[int, int] = (2400, 1800), mode: str = "RGB"
) -> bytes:
    """A real encoded image (gradient-free, so it stays small)."""
    buffer = io.BytesIO()
    Image.new(mode, size, (200, 120, 40, 255)[: len(mode)]).save(buffer, format=image_format)
    return buffer.getvalue()


async def add_image(
    db: AsyncSession, apartment_id: uuid.UUID, sort_order: int = 0
) -> ApartmentImage:
    image = ApartmentImage(
        apartment_id=apartment_id,
        storage_key=f"apartments/{apartment_id}/{uuid.uuid4()}.webp",
        sort_order=sort_order,
        width=1600,
        height=1200,
        content_type="image/webp",
    )
    db.add(image)
    await db.commit()
    return image


async def make_apartment(
    db: AsyncSession,
    *,
    status: ApartmentStatus = ApartmentStatus.AVAILABLE,
    district: str = "son-tra",
    with_image: bool = True,
    **overrides: Any,
) -> Apartment:
    """A complete listing (publishable) unless overrides blank required fields."""
    values: dict[str, Any] = {
        "title": "Sea view 1BR",
        "price_vnd": 12_000_000,
        "bedrooms": 1,
        "bathrooms": 1,
        "area_sqm": 45,
        "district_id": await district_id(db, district),
        "latitude": BEACH[0],
        "longitude": BEACH[1],
        "location_precision": LocationPrecision.EXACT,
        "status": status,
    }
    values.update(overrides)
    apartment = Apartment(**values)
    db.add(apartment)
    await db.commit()
    if with_image:
        await add_image(db, apartment.id)
    return apartment
