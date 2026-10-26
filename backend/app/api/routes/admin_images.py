import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Response, UploadFile, status

from app.api import presenters
from app.api.deps import AppSettings, DbSession, limit_admin_write, require_admin
from app.core.storage import ObjectStorage, get_storage
from app.schemas.common import ImageOut
from app.schemas.images import ImageOrderUpdate
from app.services import images

router = APIRouter(
    prefix="/admin/apartments/{apartment_id}/images",
    tags=["admin"],
    dependencies=[Depends(require_admin), Depends(limit_admin_write)],
)
Storage = Annotated[ObjectStorage, Depends(get_storage)]


@router.post("", response_model=ImageOut, status_code=status.HTTP_201_CREATED)
async def upload_image(
    apartment_id: uuid.UUID,
    db: DbSession,
    settings: AppSettings,
    storage: Storage,
    file: Annotated[UploadFile, File(description="JPEG, PNG or WebP")],
) -> ImageOut:
    """Upload one photo. It is validated, re-encoded to WebP and appended to the gallery."""
    # Read one byte past the limit so oversized files are detected without reading them fully.
    data = await file.read(settings.image_max_upload_mb * 1024 * 1024 + 1)
    image = await images.add_image(
        db, storage, settings, apartment_id, data, file.content_type or ""
    )
    return presenters.image_out(settings, image)


@router.delete("/{image_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def delete_image(
    apartment_id: uuid.UUID, image_id: uuid.UUID, db: DbSession, storage: Storage
) -> None:
    await images.delete_image(db, storage, apartment_id, image_id)


@router.patch("/order", response_model=list[ImageOut])
async def reorder_images(
    apartment_id: uuid.UUID, body: ImageOrderUpdate, db: DbSession, settings: AppSettings
) -> list[ImageOut]:
    """Set the photo order; the first photo becomes the cover."""
    ordered = await images.reorder_images(db, apartment_id, body.image_ids)
    return [presenters.image_out(settings, image) for image in ordered]
