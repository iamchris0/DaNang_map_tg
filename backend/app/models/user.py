import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin
from app.models.enums import Language, UserRole, str_enum


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    telegram_user_id: Mapped[int] = mapped_column(BigInteger, unique=True, nullable=False)
    username: Mapped[str | None] = mapped_column(String(64))
    display_name: Mapped[str | None] = mapped_column(String(256))
    # USER or LANDLORD as chosen in the bot; ADMIN is cached from ADMIN_TELEGRAM_USER_IDS
    # and never trusted on its own (see services.users).
    role: Mapped[UserRole] = mapped_column(
        str_enum(UserRole, "user_role"), nullable=False, default=UserRole.USER
    )
    # When the user first picked a role in the bot (None: the bot asks on /start).
    role_selected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Shared through Telegram's contact button when becoming a landlord.
    phone_number: Mapped[str | None] = mapped_column(String(32))
    preferred_language: Mapped[Language | None] = mapped_column(str_enum(Language, "language"))
    # When the user picked a language (bot or app); None: the bot asks on /start.
    language_selected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
