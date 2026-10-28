"""listing amenities and deposit in months

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "apartments",
        sa.Column(
            "amenities",
            postgresql.ARRAY(sa.String(32)),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
    )
    op.add_column(
        "apartments",
        sa.Column(
            "custom_amenities",
            postgresql.ARRAY(sa.String(60)),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
    )
    op.create_index("ix_apartments_amenities", "apartments", ["amenities"], postgresql_using="gin")
    op.add_column("apartments", sa.Column("deposit_months", sa.SmallInteger()))
    op.create_check_constraint(
        op.f("ck_apartments_deposit_months_range"),
        "apartments",
        "deposit_months BETWEEN 1 AND 12",
    )
    op.create_check_constraint(
        op.f("ck_apartments_deposit_single_form"),
        "apartments",
        "deposit_vnd IS NULL OR deposit_months IS NULL",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_apartments_deposit_single_form"), "apartments", type_="check")
    op.drop_constraint(op.f("ck_apartments_deposit_months_range"), "apartments", type_="check")
    op.drop_column("apartments", "deposit_months")
    op.drop_index("ix_apartments_amenities", table_name="apartments")
    op.drop_column("apartments", "custom_amenities")
    op.drop_column("apartments", "amenities")
