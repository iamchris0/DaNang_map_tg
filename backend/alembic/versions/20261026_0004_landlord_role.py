"""landlord role

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _role_check(*values: str) -> str:
    return "role IN (" + ", ".join(f"'{value}'" for value in values) + ")"


def upgrade() -> None:
    op.drop_constraint(op.f("ck_users_user_role"), "users", type_="check")
    op.create_check_constraint(
        op.f("ck_users_user_role"), "users", _role_check("user", "landlord", "admin")
    )
    op.add_column("users", sa.Column("role_selected_at", sa.DateTime(timezone=True)))
    op.add_column("users", sa.Column("phone_number", sa.String(32)))


def downgrade() -> None:
    op.drop_column("users", "phone_number")
    op.drop_column("users", "role_selected_at")
    op.execute("UPDATE users SET role = 'user' WHERE role = 'landlord'")
    op.drop_constraint(op.f("ck_users_user_role"), "users", type_="check")
    op.create_check_constraint(op.f("ck_users_user_role"), "users", _role_check("user", "admin"))
