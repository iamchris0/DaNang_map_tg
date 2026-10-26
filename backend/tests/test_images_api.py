import io
import uuid

import pytest
from httpx import AsyncClient
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models import ApartmentImage
from app.models.enums import ApartmentStatus
from app.services.images import process_image
from tests.conftest import ADMIN_TG_ID, USER_TG_ID, MemoryStorage, requires_db
from tests.factories import auth_headers, image_bytes, make_apartment, make_user

Headers = dict[str, str]


# --- Pure processing (no database) --------------------------------------------------------


def test_process_creates_webp_variants_and_strips_metadata() -> None:
    source = io.BytesIO()
    exif = Image.Exif()
    exif[0x0112] = 6  # orientation: rotate 90° clockwise when displayed
    exif[0x8825] = {2: (16.0, 4.0, 0.0)}  # GPS info that must not survive
    Image.new("RGB", (3000, 2000), "white").save(source, format="JPEG", exif=exif)

    processed = process_image(source.getvalue(), "image/jpeg")

    # Orientation applied: portrait, longest side capped at 1600.
    assert (processed.width, processed.height) == (1067, 1600)
    assert set(processed.variants) == {"lg", "sm"}
    with Image.open(io.BytesIO(processed.variants["sm"])) as small:
        assert small.format == "WEBP"
        assert max(small.size) == 480
        assert not small.getexif()


def test_process_keeps_transparency() -> None:
    source = io.BytesIO()
    Image.new("RGBA", (100, 50), (200, 120, 40, 128)).save(source, format="PNG")
    processed = process_image(source.getvalue(), "image/png")
    with Image.open(io.BytesIO(processed.variants["lg"])) as image:
        assert image.mode == "RGBA"


@pytest.mark.parametrize(
    ("data", "declared", "code"),
    [
        (image_bytes("PNG", (10, 10)), "image/jpeg", "invalid_image"),  # mismatched contents
        (b"GIF89a not really", "image/gif", "unsupported_image_type"),
        (b"<svg xmlns='http://www.w3.org/2000/svg'/>", "image/svg+xml", "unsupported_image_type"),
        (b"\xff\xd8\xff\xe0 truncated jpeg", "image/jpeg", "invalid_image"),
        (b"%PDF-1.7", "image/png", "invalid_image"),
    ],
)
def test_process_rejects_bad_files(data: bytes, declared: str, code: str) -> None:
    from app.api.errors import AppError

    with pytest.raises(AppError) as exc_info:
        process_image(data, declared)
    assert exc_info.value.code == code


def test_process_rejects_decompression_bombs(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.api.errors import AppError

    monkeypatch.setattr(Image, "MAX_IMAGE_PIXELS", 1000)
    with pytest.raises(AppError) as exc_info:
        process_image(image_bytes("PNG", (100, 100)), "image/png")
    assert exc_info.value.code == "invalid_image"


# --- API (PostGIS) -------------------------------------------------------------------------

db_tests = [pytest.mark.db, requires_db]


@pytest.fixture
async def admin(db: AsyncSession, settings: Settings) -> Headers:
    return auth_headers(settings, await make_user(db, ADMIN_TG_ID))


def _upload(data: bytes, content_type: str = "image/jpeg") -> dict[str, tuple[str, bytes, str]]:
    return {"file": ("photo.jpg", data, content_type)}


async def _image_ids(db: AsyncSession, apartment_id: uuid.UUID) -> list[uuid.UUID]:
    rows = await db.scalars(
        select(ApartmentImage.id)
        .where(ApartmentImage.apartment_id == apartment_id)
        .order_by(ApartmentImage.sort_order)
        .execution_options(populate_existing=True)
    )
    return list(rows)


@pytest.mark.db
@requires_db
async def test_upload_stores_variants_and_metadata(
    api: AsyncClient, admin: Headers, db: AsyncSession, storage: MemoryStorage
) -> None:
    apartment = await make_apartment(db, status=ApartmentStatus.DRAFT, with_image=False)
    response = await api.post(
        f"/api/admin/apartments/{apartment.id}/images", files=_upload(image_bytes()), headers=admin
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert (body["width"], body["height"]) == (1600, 1200)
    key = f"apartments/{apartment.id}/{body['id']}"
    assert body["url"] == f"https://img.example.test/{key}/lg.webp"
    assert body["thumb_url"] == f"https://img.example.test/{key}/sm.webp"
    assert set(storage.objects) == {f"{key}/lg.webp", f"{key}/sm.webp"}
    assert storage.objects[f"{key}/lg.webp"][1] == "image/webp"

    detail = (await api.get(f"/api/admin/apartments/{apartment.id}", headers=admin)).json()
    assert [image["id"] for image in detail["images"]] == [body["id"]]
    assert "images" not in detail["missing_fields"]


@pytest.mark.db
@requires_db
async def test_upload_rejects_invalid_files(
    api: AsyncClient, admin: Headers, db: AsyncSession, storage: MemoryStorage, settings: Settings
) -> None:
    apartment = await make_apartment(db, status=ApartmentStatus.DRAFT, with_image=False)
    url = f"/api/admin/apartments/{apartment.id}/images"

    fake = await api.post(url, files=_upload(b"not an image at all"), headers=admin)
    assert (fake.status_code, fake.json()["error"]["code"]) == (422, "invalid_image")

    gif = await api.post(url, files=_upload(b"GIF89a", "image/gif"), headers=admin)
    assert gif.status_code == 415

    settings.image_max_upload_mb = 1
    big = await api.post(url, files=_upload(b"\xff" * (1024 * 1024 + 10)), headers=admin)
    assert (big.status_code, big.json()["error"]["code"]) == (413, "file_too_large")

    missing = await api.post(url, headers=admin)
    assert missing.status_code == 422
    assert storage.objects == {}


@pytest.mark.db
@requires_db
async def test_upload_limit_per_listing(
    api: AsyncClient, admin: Headers, db: AsyncSession, settings: Settings
) -> None:
    settings.image_max_per_listing = 2
    apartment = await make_apartment(db, status=ApartmentStatus.DRAFT, with_image=False)
    url = f"/api/admin/apartments/{apartment.id}/images"
    small = image_bytes(size=(40, 30))
    codes = [
        (await api.post(url, files=_upload(small), headers=admin)).status_code for _ in range(3)
    ]
    assert codes == [201, 201, 409]


@pytest.mark.db
@requires_db
async def test_reorder_sets_cover(api: AsyncClient, admin: Headers, db: AsyncSession) -> None:
    apartment = await make_apartment(db, with_image=False, status=ApartmentStatus.DRAFT)
    url = f"/api/admin/apartments/{apartment.id}/images"
    ids = [
        (await api.post(url, files=_upload(image_bytes(size=(40, 30))), headers=admin)).json()["id"]
        for _ in range(3)
    ]

    new_order = [ids[2], ids[0], ids[1]]
    response = await api.patch(f"{url}/order", json={"image_ids": new_order}, headers=admin)
    assert response.status_code == 200
    assert [image["id"] for image in response.json()] == new_order

    await api.patch(f"/api/admin/apartments/{apartment.id}", json={}, headers=admin)
    detail = (await api.get(f"/api/admin/apartments/{apartment.id}", headers=admin)).json()
    assert [image["id"] for image in detail["images"]] == new_order

    for bad in ([ids[0], ids[1]], [ids[0], ids[0], ids[1]], [*ids[:2], str(uuid.uuid4())]):
        rejected = await api.patch(f"{url}/order", json={"image_ids": bad}, headers=admin)
        assert rejected.status_code == 422
        assert rejected.json()["error"]["code"] == "invalid_image_order"


@pytest.mark.db
@requires_db
async def test_delete_reindexes_and_removes_objects(
    api: AsyncClient, admin: Headers, db: AsyncSession, storage: MemoryStorage
) -> None:
    apartment = await make_apartment(db, with_image=False, status=ApartmentStatus.DRAFT)
    apartment_id = apartment.id
    url = f"/api/admin/apartments/{apartment_id}/images"
    ids = [
        (await api.post(url, files=_upload(image_bytes(size=(40, 30))), headers=admin)).json()["id"]
        for _ in range(3)
    ]

    assert (await api.delete(f"{url}/{ids[0]}", headers=admin)).status_code == 204
    assert [str(i) for i in await _image_ids(db, apartment_id)] == ids[1:]
    sort_orders = (
        await db.scalars(
            select(ApartmentImage.sort_order)
            .where(ApartmentImage.apartment_id == apartment_id)
            .order_by(ApartmentImage.sort_order)
        )
    ).all()
    assert list(sort_orders) == [0, 1]
    assert not any(ids[0] in key for key in storage.objects)
    assert len(storage.objects) == 4

    unknown = await api.delete(f"{url}/{uuid.uuid4()}", headers=admin)
    assert unknown.status_code == 404


@pytest.mark.db
@requires_db
async def test_cannot_delete_last_photo_of_published_listing(
    api: AsyncClient, admin: Headers, db: AsyncSession
) -> None:
    apartment = await make_apartment(db)  # available, one photo
    image_id = (await _image_ids(db, apartment.id))[0]
    response = await api.delete(
        f"/api/admin/apartments/{apartment.id}/images/{image_id}", headers=admin
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "listing_incomplete"


@pytest.mark.db
@requires_db
async def test_images_are_scoped_to_their_listing(
    api: AsyncClient, admin: Headers, db: AsyncSession
) -> None:
    owner_id = (await make_apartment(db, status=ApartmentStatus.DRAFT)).id
    other_id = (await make_apartment(db, status=ApartmentStatus.DRAFT)).id
    foreign_image = (await _image_ids(db, owner_id))[0]
    response = await api.delete(
        f"/api/admin/apartments/{other_id}/images/{foreign_image}", headers=admin
    )
    assert response.status_code == 404
    assert await _image_ids(db, owner_id) == [foreign_image]


@pytest.mark.db
@requires_db
async def test_image_endpoints_require_admin(
    api: AsyncClient, db: AsyncSession, settings: Settings
) -> None:
    apartment = await make_apartment(db, status=ApartmentStatus.DRAFT)
    user = auth_headers(settings, await make_user(db, USER_TG_ID))
    url = f"/api/admin/apartments/{apartment.id}/images"
    upload = await api.post(url, files=_upload(image_bytes(size=(40, 30))), headers=user)
    assert upload.status_code == 403
    assert (await api.post(url, files=_upload(image_bytes()))).status_code == 401
    order = await api.patch(f"{url}/order", json={"image_ids": [str(uuid.uuid4())]}, headers=user)
    assert order.status_code == 403


@pytest.mark.db
@requires_db
async def test_upload_to_unknown_listing(api: AsyncClient, admin: Headers) -> None:
    response = await api.post(
        f"/api/admin/apartments/{uuid.uuid4()}/images",
        files=_upload(image_bytes(size=(40, 30))),
        headers=admin,
    )
    assert response.status_code == 404
