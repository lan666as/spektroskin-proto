"""review pattern read (shadow-mode reference) and whether AI was hidden

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-25 02:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | Sequence[str] | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("reviews", sa.Column("pattern_read", sa.String(length=16), nullable=True))
    op.add_column("reviews", sa.Column("ai_hidden", sa.Boolean(), nullable=True))
    op.create_check_constraint(
        op.f("ck_reviews_pattern_read_valid"),
        "reviews",
        "pattern_read IS NULL OR pattern_read IN ('pigmented', 'vascular', 'mixed', 'unsure')",
    )


def downgrade() -> None:
    """Drops recorded pattern reads: one-way for data. Restore from a database backup."""
    op.drop_constraint(op.f("ck_reviews_pattern_read_valid"), "reviews", type_="check")
    op.drop_column("reviews", "ai_hidden")
    op.drop_column("reviews", "pattern_read")
