import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.apartment import Apartment


class ApartmentImage(Base):
    """Image metadata; the bytes live in S3 under `storage_key`. sort_order 0 is the cover."""

    __tablename__ = "apartment_images"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    apartment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("apartments.id", ondelete="CASCADE"), nullable=False
    )
    storage_key: Mapped[str] = mapped_column(String(512), unique=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    content_type: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    apartment: Mapped["Apartment"] = relationship(back_populates="images", lazy="raise")

    __table_args__ = (
        # Deferrable so a reorder can permute sort_order values within one transaction.
        UniqueConstraint(
            "apartment_id",
            "sort_order",
            name="uq_apartment_images_apartment_id_sort_order",
            deferrable=True,
            initially="DEFERRED",
        ),
        CheckConstraint("sort_order >= 0", name="sort_order_non_negative"),
        CheckConstraint("width > 0 AND height > 0", name="dimensions_positive"),
    )
