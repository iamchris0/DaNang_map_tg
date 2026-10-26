"""seed districts reference data

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Familiar rental-market areas of Da Nang (see docs/DECISIONS.md, D2).
DISTRICTS = [
    ("hai-chau", "Hải Châu", "Хайчау"),
    ("son-tra", "Sơn Trà", "Шонча"),
    ("ngu-hanh-son", "Ngũ Hành Sơn", "Нгуханьшон"),
    ("thanh-khe", "Thanh Khê", "Тханькхе"),
    ("cam-le", "Cẩm Lệ", "Камле"),
    ("lien-chieu", "Liên Chiểu", "Льенчьеу"),
    ("hoa-vang", "Hòa Vang", "Хоаванг"),
]

districts = sa.table(
    "districts",
    sa.column("slug", sa.String),
    sa.column("name_en", sa.String),
    sa.column("name_ru", sa.String),
    sa.column("active", sa.Boolean),
)


def upgrade() -> None:
    op.bulk_insert(
        districts,
        [
            {"slug": slug, "name_en": name_en, "name_ru": name_ru, "active": True}
            for slug, name_en, name_ru in DISTRICTS
        ],
    )


def downgrade() -> None:
    op.execute(districts.delete().where(districts.c.slug.in_([slug for slug, _, _ in DISTRICTS])))
