"""test users

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-24 22:15:21.836202

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: str | Sequence[str] | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "users", sa.Column("is_test", sa.Boolean(), server_default=sa.text("false"), nullable=False)
    )
    # The smoke users exist on every environment provisioned so far (scripts/provision.sh).
    op.execute(
        "UPDATE users SET is_test = true "
        "WHERE username IN ('smoke-clinician', 'smoke-dermatologist')"
    )


def downgrade() -> None:
    """Drops the test-user flag; the next upgrade re-derives it for the smoke users."""
    op.drop_column("users", "is_test")
