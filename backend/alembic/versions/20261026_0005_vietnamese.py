"""vietnamese language

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _language_check(*values: str) -> str:
    return "preferred_language IN (" + ", ".join(f"'{value}'" for value in values) + ")"


def upgrade() -> None:
    op.drop_constraint(op.f("ck_users_language"), "users", type_="check")
    op.create_check_constraint(
        op.f("ck_users_language"), "users", _language_check("en", "ru", "vi")
    )
    op.add_column("users", sa.Column("language_selected_at", sa.DateTime(timezone=True)))


def downgrade() -> None:
    op.drop_column("users", "language_selected_at")
    op.execute("UPDATE users SET preferred_language = 'en' WHERE preferred_language = 'vi'")
    op.drop_constraint(op.f("ck_users_language"), "users", type_="check")
    op.create_check_constraint(op.f("ck_users_language"), "users", _language_check("en", "ru"))
