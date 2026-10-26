import io
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from aiogram.exceptions import TelegramForbiddenError, TelegramNetworkError
from aiogram.methods import SendMessage
from fastapi import FastAPI
from httpx import AsyncClient
from PIL import Image
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models import Apartment, ApartmentImage, TelegramPublication
from app.models.enums import ApartmentStatus, PublicationStatus
from app.services.images import variant_key
from app.services.telegram_publisher import get_publisher
from tests.conftest import ADMIN_TG_ID, USER_TG_ID, MemoryStorage, requires_db
from tests.factories import add_image, auth_headers, make_apartment, make_user

pytestmark = [pytest.mark.db, requires_db]

CHANNEL = "@danang_test_channel"
Headers = dict[str, str]


class FakePublisher:
    """Records calls; raises queued errors before succeeding."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, str, list[bytes]]] = []
        self.errors: list[Exception] = []
        self.next_message_id = 100

    async def publish(self, channel_id: str, caption_html: str, photos: list[bytes]) -> int:
        self.calls.append((channel_id, caption_html, photos))
        if self.errors:
            raise self.errors.pop(0)
        self.next_message_id += 1
        return self.next_message_id

    async def close(self) -> None:
        pass


@pytest.fixture
def publisher(app: FastAPI, settings: Settings) -> FakePublisher:
    settings.telegram_channel_id = CHANNEL
    fake = FakePublisher()
    app.dependency_overrides[get_publisher] = lambda: fake
    return fake


@pytest.fixture
async def admin(db: AsyncSession, settings: Settings) -> Headers:
    return auth_headers(settings, await make_user(db, ADMIN_TG_ID, display_name="Chris"))


def _webp() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (64, 48), "teal").save(buffer, format="WEBP")
    return buffer.getvalue()


async def listing(
    db: AsyncSession, storage: MemoryStorage, *, photos: int = 1, **kwargs: object
) -> uuid.UUID:
    """A complete listing whose photos exist in (fake) object storage."""
    apartment = await make_apartment(db, with_image=False, **kwargs)  # type: ignore[arg-type]
    apartment_id = apartment.id
    for index in range(photos):
        await add_image(db, apartment_id, sort_order=index)
    keys = (
        await db.scalars(
            select(ApartmentImage.storage_key).where(ApartmentImage.apartment_id == apartment_id)
        )
    ).all()
    for key in keys:
        storage.put(variant_key(key, "lg"), _webp(), "image/webp")
    return apartment_id


def key() -> dict[str, str]:
    return {"Idempotency-Key": str(uuid.uuid4())}


async def test_publish_success(
    api: AsyncClient,
    admin: Headers,
    db: AsyncSession,
    storage: MemoryStorage,
    publisher: FakePublisher,
) -> None:
    apartment_id = await listing(db, storage)
    response = await api.post(
        f"/api/admin/apartments/{apartment_id}/publish-telegram", headers={**admin, **key()}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "succeeded"
    assert body["telegram_message_id"] == 101
    assert body["post_url"] == "https://t.me/danang_test_channel/101"
    assert body["telegram_channel_id"] == CHANNEL
    assert body["published_by"] == "Chris"
    assert body["published_at"] is not None

    channel, caption, photos = publisher.calls[0]
    assert channel == CHANNEL
    assert caption.startswith("🏠 <b>Sea view 1BR</b>")
    assert len(photos) == 1 and photos[0][:3] == b"\xff\xd8\xff"  # re-encoded as JPEG


async def test_media_group_for_several_photos_capped_at_ten(
    api: AsyncClient,
    admin: Headers,
    db: AsyncSession,
    storage: MemoryStorage,
    publisher: FakePublisher,
) -> None:
    apartment_id = await listing(db, storage, photos=12)
    await api.post(
        f"/api/admin/apartments/{apartment_id}/publish-telegram", headers={**admin, **key()}
    )
    assert len(publisher.calls[0][2]) == 10


async def test_repeated_request_is_idempotent(
    api: AsyncClient,
    admin: Headers,
    db: AsyncSession,
    storage: MemoryStorage,
    publisher: FakePublisher,
) -> None:
    apartment_id = await listing(db, storage)
    headers = {**admin, **key()}
    url = f"/api/admin/apartments/{apartment_id}/publish-telegram"
    first = await api.post(url, headers=headers)
    second = await api.post(url, headers=headers)
    assert first.json() == second.json()
    assert len(publisher.calls) == 1


async def test_second_publish_is_refused(
    api: AsyncClient,
    admin: Headers,
    db: AsyncSession,
    storage: MemoryStorage,
    publisher: FakePublisher,
) -> None:
    apartment_id = await listing(db, storage)
    url = f"/api/admin/apartments/{apartment_id}/publish-telegram"
    await api.post(url, headers={**admin, **key()})
    again = await api.post(url, headers={**admin, **key()})
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "already_published"
    assert len(publisher.calls) == 1


async def test_key_cannot_be_reused_for_another_listing(
    api: AsyncClient,
    admin: Headers,
    db: AsyncSession,
    storage: MemoryStorage,
    publisher: FakePublisher,
) -> None:
    first = await listing(db, storage)
    second = await listing(db, storage)
    headers = {**admin, **key()}
    await api.post(f"/api/admin/apartments/{first}/publish-telegram", headers=headers)
    response = await api.post(f"/api/admin/apartments/{second}/publish-telegram", headers=headers)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "idempotency_key_reused"


@pytest.mark.parametrize(
    "status", [ApartmentStatus.DRAFT, ApartmentStatus.RENTED, ApartmentStatus.ARCHIVED]
)
async def test_only_available_listings(
    api: AsyncClient,
    admin: Headers,
    db: AsyncSession,
    storage: MemoryStorage,
    publisher: FakePublisher,
    status: ApartmentStatus,
) -> None:
    apartment_id = await listing(db, storage, status=status)
    response = await api.post(
        f"/api/admin/apartments/{apartment_id}/publish-telegram", headers={**admin, **key()}
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "listing_not_available"
    assert publisher.calls == []


async def test_not_configured(
    api: AsyncClient,
    admin: Headers,
    db: AsyncSession,
    storage: MemoryStorage,
    publisher: FakePublisher,
    settings: Settings,
) -> None:
    settings.telegram_channel_id = ""
    apartment_id = await listing(db, storage)
    response = await api.post(
        f"/api/admin/apartments/{apartment_id}/publish-telegram", headers={**admin, **key()}
    )
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "telegram_not_configured"


async def test_definite_failure_is_stored_and_can_be_retried(
    api: AsyncClient,
    admin: Headers,
    db: AsyncSession,
    storage: MemoryStorage,
    publisher: FakePublisher,
) -> None:
    publisher.errors.append(
        TelegramForbiddenError(SendMessage(chat_id=1, text="x"), "Forbidden: bot is not a member")
    )
    apartment_id = await listing(db, storage)
    url = f"/api/admin/apartments/{apartment_id}/publish-telegram"
    failed = (await api.post(url, headers={**admin, **key()})).json()
    assert failed["status"] == "failed"
    assert failed["error_code"] == "bot_not_admin"

    retry = (await api.post(url, headers={**admin, **key()})).json()
    assert retry["status"] == "succeeded"

    history = (
        await api.get(f"/api/admin/apartments/{apartment_id}/telegram-publications", headers=admin)
    ).json()
    assert [item["status"] for item in history] == ["succeeded", "failed"]


async def test_timeout_is_never_retried_automatically(
    api: AsyncClient,
    admin: Headers,
    db: AsyncSession,
    storage: MemoryStorage,
    publisher: FakePublisher,
) -> None:
    publisher.errors.append(
        TelegramNetworkError(SendMessage(chat_id=1, text="x"), "Request timeout error")
    )
    apartment_id = await listing(db, storage)
    url = f"/api/admin/apartments/{apartment_id}/publish-telegram"
    unknown = (await api.post(url, headers={**admin, **key()})).json()
    assert unknown["status"] == "unknown"
    assert unknown["error_code"] == "unconfirmed"

    # A new attempt is blocked until someone checks the channel.
    blocked = await api.post(url, headers={**admin, **key()})
    assert blocked.status_code == 409
    assert len(publisher.calls) == 1

    resolve = f"/api/admin/apartments/{apartment_id}/telegram-publications/{unknown['id']}/resolve"
    resolved = await api.post(resolve, json={"was_published": False}, headers=admin)
    assert resolved.json()["status"] == "failed"
    assert (await api.post(url, headers={**admin, **key()})).json()["status"] == "succeeded"

    again = await api.post(resolve, json={"was_published": True}, headers=admin)
    assert again.status_code == 409


async def test_unknown_can_be_confirmed_as_published(
    api: AsyncClient,
    admin: Headers,
    db: AsyncSession,
    storage: MemoryStorage,
    publisher: FakePublisher,
) -> None:
    publisher.errors.append(
        TelegramNetworkError(SendMessage(chat_id=1, text="x"), "Request timeout error")
    )
    apartment_id = await listing(db, storage)
    unknown = (
        await api.post(
            f"/api/admin/apartments/{apartment_id}/publish-telegram", headers={**admin, **key()}
        )
    ).json()
    resolved = await api.post(
        f"/api/admin/apartments/{apartment_id}/telegram-publications/{unknown['id']}/resolve",
        json={"was_published": True, "message_id": 77},
        headers=admin,
    )
    assert resolved.json()["status"] == "succeeded"
    assert resolved.json()["post_url"] == "https://t.me/danang_test_channel/77"


async def test_missing_photos_fail_without_calling_telegram(
    api: AsyncClient,
    admin: Headers,
    db: AsyncSession,
    storage: MemoryStorage,
    publisher: FakePublisher,
) -> None:
    apartment_id = await listing(db, storage)
    storage.objects.clear()
    response = await api.post(
        f"/api/admin/apartments/{apartment_id}/publish-telegram", headers={**admin, **key()}
    )
    assert response.json()["status"] == "failed"
    assert response.json()["error_code"] == "media_unavailable"
    assert publisher.calls == []


async def test_stale_pending_becomes_unknown(
    api: AsyncClient,
    admin: Headers,
    db: AsyncSession,
    storage: MemoryStorage,
    publisher: FakePublisher,
) -> None:
    apartment_id = await listing(db, storage)
    db.add(
        TelegramPublication(
            apartment_id=apartment_id,
            telegram_channel_id=CHANNEL,
            status=PublicationStatus.PENDING,
            idempotency_key="crashed-attempt",
        )
    )
    await db.commit()
    await db.execute(
        update(TelegramPublication)
        .where(TelegramPublication.idempotency_key == "crashed-attempt")
        .values(created_at=datetime.now(UTC) - timedelta(hours=1))
    )
    await db.commit()

    preview = (
        await api.get(f"/api/admin/apartments/{apartment_id}/telegram-preview", headers=admin)
    ).json()
    assert preview["blockers"] == ["already_published"]
    assert preview["live_publication"]["status"] == "unknown"


async def test_preview(
    api: AsyncClient,
    admin: Headers,
    db: AsyncSession,
    storage: MemoryStorage,
    publisher: FakePublisher,
) -> None:
    apartment_id = await listing(db, storage, photos=2)
    preview = (
        await api.get(f"/api/admin/apartments/{apartment_id}/telegram-preview", headers=admin)
    ).json()
    assert preview["can_publish"] is True
    assert preview["blockers"] == []
    assert preview["caption_html"].startswith("🏠 <b>Sea view 1BR</b>")
    assert preview["caption_limit"] == 1024
    assert 0 < preview["caption_length"] <= 1024
    assert len(preview["photo_urls"]) == 2
    assert preview["photo_urls"][0].endswith("/sm.webp")
    assert preview["channel_id"] == CHANNEL
    assert preview["live_publication"] is None
    assert publisher.calls == []  # previewing never posts


async def test_preview_blockers(
    api: AsyncClient,
    admin: Headers,
    db: AsyncSession,
    storage: MemoryStorage,
    publisher: FakePublisher,
    settings: Settings,
) -> None:
    settings.telegram_channel_id = ""
    apartment_id = await listing(db, storage, status=ApartmentStatus.DRAFT, price_vnd=None)
    preview = (
        await api.get(f"/api/admin/apartments/{apartment_id}/telegram-preview", headers=admin)
    ).json()
    assert preview["can_publish"] is False
    assert preview["blockers"] == ["telegram_not_configured", "listing_not_available"]
    assert preview["caption_html"] is None


async def test_requires_idempotency_key(
    api: AsyncClient,
    admin: Headers,
    db: AsyncSession,
    storage: MemoryStorage,
    publisher: FakePublisher,
) -> None:
    apartment_id = await listing(db, storage)
    response = await api.post(
        f"/api/admin/apartments/{apartment_id}/publish-telegram", headers=admin
    )
    assert response.status_code == 422
    assert publisher.calls == []


async def test_regular_users_cannot_publish(
    api: AsyncClient,
    db: AsyncSession,
    settings: Settings,
    storage: MemoryStorage,
    publisher: FakePublisher,
) -> None:
    apartment_id = await listing(db, storage)
    user = auth_headers(settings, await make_user(db, USER_TG_ID))
    base = f"/api/admin/apartments/{apartment_id}"
    assert (
        await api.post(f"{base}/publish-telegram", headers={**user, **key()})
    ).status_code == 403
    assert (await api.get(f"{base}/telegram-preview", headers=user)).status_code == 403
    assert (await api.get(f"{base}/telegram-publications", headers=user)).status_code == 403
    assert (await api.post(f"{base}/publish-telegram", headers=key())).status_code == 401
    assert publisher.calls == []


async def test_publication_survives_listing_edit_without_reposting(
    api: AsyncClient,
    admin: Headers,
    db: AsyncSession,
    storage: MemoryStorage,
    publisher: FakePublisher,
) -> None:
    apartment_id = await listing(db, storage)
    await api.post(
        f"/api/admin/apartments/{apartment_id}/publish-telegram", headers={**admin, **key()}
    )
    edit = await api.patch(
        f"/api/admin/apartments/{apartment_id}", json={"price_vnd": 13_000_000}, headers=admin
    )
    assert edit.status_code == 200
    assert edit.json()["latest_publication"]["status"] == "succeeded"
    assert len(publisher.calls) == 1  # editing never touches the channel
    assert await db.get(Apartment, apartment_id) is not None
