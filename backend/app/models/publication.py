import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String, Text, Uuid, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import PublicationStatus, str_enum


class TelegramPublication(Base):
    __tablename__ = "telegram_publications"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    apartment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("apartments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    telegram_channel_id: Mapped[str] = mapped_column(String(64), nullable=False)
    telegram_message_id: Mapped[int | None] = mapped_column(BigInteger)
    published_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    status: Mapped[PublicationStatus] = mapped_column(
        str_enum(PublicationStatus, "publication_status"),
        nullable=False,
        default=PublicationStatus.PENDING,
    )
    # Client-supplied key; repeated submissions with the same key return the same record.
    idempotency_key: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    # Stable machine-readable failure reason (e.g. "bot_not_admin"); see services/telegram.
    error_code: Mapped[str | None] = mapped_column(String(64))
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        # At most one live (in-flight, confirmed, or unconfirmed) post per listing per channel.
        Index(
            "uq_telegram_publications_active",
            "apartment_id",
            "telegram_channel_id",
            unique=True,
            postgresql_where=text("status IN ('pending', 'succeeded', 'unknown')"),
        ),
    )
