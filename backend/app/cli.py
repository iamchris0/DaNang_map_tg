"""Operational commands.

python -m app.cli init-storage          create the image bucket with public read access
python -m app.cli seed-demo [--reset]   add clearly labelled fictional demo listings
"""

import argparse
import asyncio
import io
import logging
import random
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from PIL import Image, ImageDraw, ImageFont
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.storage import ObjectStorage, ensure_bucket, get_storage
from app.db.session import get_sessionmaker
from app.models import Apartment, ApartmentImage, District
from app.models.enums import ApartmentStatus, ContactType, LocationPrecision
from app.services.images import OUTPUT_TYPE, process_image, variant_key

logger = logging.getLogger("app.cli")

DEMO_PREFIX = "[DEMO] "
DEMO_NOTE = (
    "Fictional demo listing for demonstrations only. It is not real rental inventory "
    "and cannot be rented."
)


@dataclass(frozen=True)
class DemoListing:
    title: str
    district: str
    lat: float
    lng: float
    price_m: float
    bedrooms: int
    area: int
    precision: LocationPrecision = LocationPrecision.EXACT
    agent: str | None = "demo_agent"


# Spread over Da Nang's rental areas; coordinates are plausible street-level points.
DEMO_LISTINGS = [
    DemoListing("Sea-view 1BR near My Khe Beach", "son-tra", 16.0612, 108.2475, 12, 1, 45),
    DemoListing(
        "Studio by An Thuong food street",
        "ngu-hanh-son",
        16.0485,
        108.2460,
        7.5,
        0,
        30,
        LocationPrecision.APPROXIMATE,
    ),
    DemoListing("Family 3BR house in Son Tra", "son-tra", 16.0700, 108.2390, 22, 3, 120),
    DemoListing(
        "River-view 2BR on the Han River", "hai-chau", 16.0680, 108.2240, 16.5, 2, 75, agent=None
    ),
    DemoListing(
        "Budget 1BR in Thanh Khe",
        "thanh-khe",
        16.0640,
        108.1900,
        6,
        1,
        38,
        LocationPrecision.APPROXIMATE,
    ),
    DemoListing("2BR near the Dragon Bridge", "hai-chau", 16.0612, 108.2270, 14, 2, 68),
    DemoListing(
        "Villa 4BR with pool",
        "ngu-hanh-son",
        16.0230,
        108.2560,
        45,
        4,
        250,
        LocationPrecision.APPROXIMATE,
    ),
    DemoListing("Quiet 2BR in Lien Chieu", "lien-chieu", 16.0750, 108.1500, 9, 2, 60),
    DemoListing("Cozy 1BR in Cam Le", "cam-le", 16.0150, 108.2050, 5.5, 1, 40),
    DemoListing("Penthouse 3BR, city skyline", "hai-chau", 16.0545, 108.2205, 35, 3, 160),
    DemoListing(
        "Garden studio near Non Nuoc", "ngu-hanh-son", 16.0030, 108.2640, 8, 0, 32, agent=None
    ),
    DemoListing("Beachfront 2BR, Pham Van Dong", "son-tra", 16.0720, 108.2440, 19, 2, 82),
    DemoListing(
        "Student studio near the university",
        "lien-chieu",
        16.0610,
        108.1590,
        4.5,
        0,
        25,
        LocationPrecision.APPROXIMATE,
    ),
    DemoListing("Townhouse 4BR in Thanh Khe", "thanh-khe", 16.0700, 108.1800, 18, 4, 140),
    DemoListing(
        "Lake-view 1BR in Hoa Vang",
        "hoa-vang",
        15.9900,
        108.1300,
        5,
        1,
        50,
        LocationPrecision.APPROXIMATE,
    ),
    DemoListing("Modern 2BR near Con Market", "hai-chau", 16.0700, 108.2130, 13, 2, 70),
    DemoListing("Serviced 1BR at An Thuong", "ngu-hanh-son", 16.0450, 108.2440, 11, 1, 42),
    DemoListing("Spacious 3BR in Cam Le", "cam-le", 16.0230, 108.2150, 12.5, 3, 110),
]

PALETTES = [
    ((236, 228, 214), (176, 139, 104), (92, 120, 140)),
    ((222, 232, 236), (150, 120, 96), (70, 96, 120)),
    ((240, 234, 224), (120, 98, 82), (168, 120, 96)),
    ((228, 236, 228), (160, 132, 108), (96, 132, 108)),
]


def demo_photo(seed: int, index: int, label: str) -> bytes:
    """A simple illustrated room, clearly marked as a demo placeholder."""
    rng = random.Random(seed * 31 + index)  # noqa: S311 - only varies placeholder drawings
    wall, floor, accent = PALETTES[(seed + index) % len(PALETTES)]
    image = Image.new("RGB", (1600, 1200), wall)
    draw = ImageDraw.Draw(image)
    draw.rectangle([0, 820, 1600, 1200], fill=floor)
    window_x = rng.randint(120, 900)
    draw.rectangle(
        [window_x, 180, window_x + 520, 620],
        fill=(170, 205, 230),
        outline=(255, 255, 255),
        width=18,
    )
    draw.line([window_x + 260, 180, window_x + 260, 620], fill=(255, 255, 255), width=10)
    if index % 2 == 0:  # bed
        draw.rectangle([180, 700, 900, 940], fill=(250, 250, 250))
        draw.rectangle([180, 640, 260, 940], fill=accent)
        draw.rectangle([300, 680, 480, 740], fill=(230, 230, 236))
    else:  # sofa and table
        draw.rounded_rectangle([700, 690, 1400, 900], radius=40, fill=accent)
        draw.rounded_rectangle([300, 860, 620, 940], radius=12, fill=(120, 90, 70))
    draw.ellipse([1300, 260, 1420, 380], fill=(250, 220, 150))
    # Bottom centre: stays visible in card crops and clear of the card's corner badge.
    font = ImageFont.load_default(size=64)
    text = f"DEMO PHOTO · {label}"
    left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
    width, height = right - left, bottom - top
    x, y = (1600 - width) // 2, 1060
    draw.rounded_rectangle(
        [x - 36, y - 24, x + width + 36, y + height + 36], radius=24, fill=(0, 0, 0)
    )
    draw.text((x, y - top), text, fill=(255, 255, 255), font=font)
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=85)
    return buffer.getvalue()


async def _store_photos(
    storage: ObjectStorage, apartment_id: uuid.UUID, seed: int, count: int
) -> list[ApartmentImage]:
    images = []
    for index in range(count):
        processed = await asyncio.to_thread(
            process_image, demo_photo(seed, index, f"{seed + 1}.{index + 1}"), "image/jpeg"
        )
        image_id = uuid.uuid4()
        key = f"apartments/{apartment_id}/{image_id}"
        for name, payload in processed.variants.items():
            await asyncio.to_thread(storage.put, variant_key(key, name), payload, OUTPUT_TYPE)
        images.append(
            ApartmentImage(
                id=image_id,
                apartment_id=apartment_id,
                storage_key=key,
                sort_order=index,
                width=processed.width,
                height=processed.height,
                content_type=OUTPUT_TYPE,
            )
        )
    return images


async def seed_demo(reset: bool) -> None:
    async with get_sessionmaker()() as db:
        await create_demo_listings(db, get_storage(), reset=reset)


async def create_demo_listings(db: AsyncSession, storage: ObjectStorage, *, reset: bool) -> int:
    """Create the demo listings; returns how many were created (0 if already present)."""
    existing = (
        await db.scalars(
            select(Apartment.id).where(
                Apartment.title.startswith(DEMO_PREFIX), Apartment.deleted_at.is_(None)
            )
        )
    ).all()
    if existing and not reset:
        logger.info("%d demo listings already exist; use --reset to recreate", len(existing))
        return 0
    if existing:
        await db.execute(
            update(Apartment).where(Apartment.id.in_(existing)).values(deleted_at=datetime.now(UTC))
        )
        logger.info("Soft-deleted %d previous demo listings", len(existing))

    districts = {d.slug: d.id for d in await db.scalars(select(District))}
    for seed, demo in enumerate(DEMO_LISTINGS):
        price = int(demo.price_m * 1_000_000)
        apartment = Apartment(
            id=uuid.uuid4(),
            title=DEMO_PREFIX + demo.title,
            description=f"{DEMO_NOTE}\n\nFurnished, air conditioning, Wi-Fi included. "
            "Close to shops and cafés.",
            price_vnd=price,
            area_sqm=demo.area,
            bedrooms=demo.bedrooms,
            bathrooms=max(1, min(demo.bedrooms, 3)),
            district_id=districts[demo.district],
            address="Demo address (fictional)",
            latitude=demo.lat,
            longitude=demo.lng,
            location_precision=demo.precision,
            deposit_vnd=price,
            minimum_rental_months=6 if seed % 3 else 3,
            rental_conditions="Demo listing: no real tenancy conditions.",
            agent_contact_type=ContactType.TELEGRAM_USERNAME if demo.agent else None,
            agent_contact_value=demo.agent,
            status=ApartmentStatus.AVAILABLE,
        )
        db.add(apartment)
        db.add_all(await _store_photos(storage, apartment.id, seed, 1 + seed % 3))
        await db.flush()
    await db.commit()
    logger.info("Created %d demo listings", len(DEMO_LISTINGS))
    return len(DEMO_LISTINGS)


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("init-storage", help="create the bucket with public read access")
    seed = commands.add_parser("seed-demo", help="add fictional demo listings")
    seed.add_argument("--reset", action="store_true", help="replace existing demo listings")
    args = parser.parse_args()
    configure_logging(get_settings().log_level)

    if args.command == "init-storage":
        ensure_bucket()
        logger.info("Bucket %s is ready (public read)", get_settings().s3_bucket)
    elif args.command == "seed-demo":
        asyncio.run(seed_demo(reset=args.reset))


if __name__ == "__main__":
    main()
