"""patient research consent

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-24 22:04:54.384923

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003"
down_revision: str | Sequence[str] | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "patients",
        sa.Column(
            "research_consent", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
    )


def downgrade() -> None:
    """Drops recorded consent answers: one-way for data. Restore from a database backup."""
    op.drop_column("patients", "research_consent")
